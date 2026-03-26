import { Prisma } from "../../prisma/generated/prisma/client.ts";
import { prismaClient } from "../server.js"
import { getAnswersByAi, getEmbeddings } from "../utils/services/ai.service.js";
import { cleanPdfText, getPdfChunks, getPdfHash, validatePdfResult } from "../utils/services/pdf.service.js";
import { extractText } from "unpdf";
import { deleteCache, getCache, setCache } from "../utils/services/cache.service.js";

export const uploadFile = async (req, res, next) => {
    const file = req.file;

    // get all text extracted from PDF as a string
    const data = await extractText(new Uint8Array(file.buffer), { mergePages: true });

    // clean text
    const cleanText = cleanPdfText(data.text)

    // throws error if not satisfied with the conditions
    validatePdfResult(cleanText)

    // Note: (smaller chunks -> more api calls for embeddings + more rows are created + weaker context per chunk)
    
    // get chunks 
    const chunks = getPdfChunks(cleanText, 20, 800) // returns an array of chunks

  // get embeddings from AI 
  const embeddings = await getEmbeddings(chunks)

  let pdf;

  // start transation for atomicity
  await prismaClient.$transaction(async (tx) => {

    // insert pdf
  pdf = await tx.pdf.create({
    data: {
      file_name: file.originalname,
      file_hash: req.fileHash || getPdfHash(file.buffer),
      user_id: req.user.id,
    }
  });

  // create array of SQL value tuples for bulk insert
  const values = chunks.map((chunk, index) => {
    const vec = JSON.stringify(embeddings[index].values);
    return Prisma.sql`(
      gen_random_uuid(), 
      ${pdf.id}::uuid, -- pdf id
      ${req.user.id}::uuid, -- makes sure the user can only query their own data
      ${chunk}, -- chunk text
      ${index}, -- chunk index
      ${vec}::vector -- embedding
    )`;
  });

  // insert all pdf chunks
  await tx.$queryRaw(
    Prisma.sql`
      INSERT INTO pdf_chunk (id, pdf_id, user_id, chunk_text, chunk_index, embedding)
      -- output values: ( id, pdf_id, user_id, chunk_text, chunk_index, embedding ), and so on..
      VALUES ${Prisma.join(values)} 
    `
  );

});
  // delete the pdfs list from cache
  await deleteCache(`user-pdfs:${req.user.id}`);

  // send response
  res.status(201).json({
        data: {
          message: 'File uploaded successfully',
          pdf: pdf,
        }
    })
}

export const getAnswers = async (req, res, next) => {
  const { question } = req.body || {};

  const embeddingsDetails = await getEmbeddings([question]);

  // search vector database
  const results = await prismaClient.$queryRaw(
    Prisma.sql`
    SELECT pdf_id, chunk_text, 1 - (
      embedding <=> ${JSON.stringify(embeddingsDetails[0].values)}::vector
      ) AS similarity
    FROM pdf_chunk
    WHERE
    user_id = ${req.user.id}::uuid -- return only the pdf chunks that belong to the user
    ORDER BY similarity DESC
    LIMIT 5
    `
  );
  
  if(results.length === 0 || parseFloat(results[0].similarity) < 0.5){
    return res.status(200).json({
      data: {
        answer: "No relevant information found across your uploaded documents."
      }
    })
  }
  
  let data;
  
  // check if the data is stored in cache 
  const pdfIds = [ ...new Set(results.map(r => r.pdf_id)) ]
  const keySource = `${question}:${pdfIds.join()}:${req.user.id}`
  data = await getCache(keySource)

  let isCached = true; // cache flag

  // cache not present, call LLM to generate answers
  if(!data || !data.answer){

    isCached = false;
  
  // clean context
  const context = results.map(r => r.chunk_text).join("\n\n");
  
  // generate answer
  const answer = await getAnswersByAi({ context, question });

  // find pdf sources of answer
  const sources = await prismaClient.pdf.findMany({
    where: {
      id: { in: pdfIds },
      user_id: req.user.id
    },
    select: {
      id: true,
      file_name: true
    }
  });

  data = {
    answer,
    sources: sources
  }

  // store data in redis as a cache
  await setCache(keySource, data, 600)
  }

  // send answer
  res.status(200).json({
    data: {
      content: data,
      isCached: !!isCached,
    }
  });

}

// user's all uploaded files details (name, created_at)
export const getMyFiles = async (req, res, next) => {

  // cache layer
  const keySource = `user-pdfs:${req.user.id}`;
  const cachedPdfs = await getCache(keySource);

  // return cached data
  if (cachedPdfs) {
    return res.status(200).json({
      data: {
        content: cachedPdfs,
        isCached: true
      }
    });
  }

  // query DB
  const pdfs = await prismaClient.pdf.findMany({
    where: {
      user_id: req.user.id
    },
    select: {
      id: true,
      file_name: true,
      created_at: true
    }
  });

  // store in cache
  await setCache(keySource, pdfs, 600);

  // send response
  res.status(200).json({
    data: {
      content: pdfs,
      isCached: false
    }
  });
}

// delete user's file
export const deleteMyFile = async (req, res, next) => {
  const { fileId } = req.params;

  // delete file
  await prismaClient.pdf.delete({
    where: {
      id: fileId
    }
  });

  // delete from cache too
  await deleteCache(`user-pdfs:${req.user.id}`);

  // send response
  res.status(200).json({
    status: 'success',
    message: 'File deleted successfully.'
  });
}