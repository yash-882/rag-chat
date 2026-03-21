import { __wbg_String_8f0eb39a4a4c2f66 } from "@prisma/client/runtime/query_compiler_fast_bg.postgresql.mjs";
import { Prisma } from "../../prisma/generated/prisma/client.ts";
import { prismaClient } from "../server.js"
import { getAnswersByAi, getEmbeddings } from "../utils/services/ai.service.js";
import { cleanPdfText, getPdfChunks, validatePdfResult } from "../utils/services/pdf.service.js";
import { extractText } from "unpdf";
import opError from "../utils/classes/opError.class.js";

export const uploadFile = async (req, res, next) => {
    const file = req.file;

    // get all text extracted from PDF as a string
    const data = await extractText(new Uint8Array(file.buffer), { mergePages: true });

    // clean text
    const cleanText = cleanPdfText(data.text)

    // throws error if not satisfied with the conditions
    validatePdfResult(cleanText)

    // get chunks 
    // Note: (smaller chunks -> more api calls for embeddings + more rows are created + weaker context per chunk)

  const chunks = getPdfChunks(cleanText, 20, 800) // returns an array of chunks 

  // get embeddings from AI 
  const embeddings = await getEmbeddings(chunks)

  if(embeddings.length === 0 || embeddings[0].values.length === 0)
    return next(new Error("Could not generate embeddings for the provided question."))
  

  let pdf;

  // start transaction
  await prismaClient.$transaction(async (tx) => {

    // insert PDF
    pdf = await tx.pdf.create({
      data: {
        file_name: file.originalname,
      }
    })

    await Promise.all(
      chunks.map((chunk, index) => {
        const vec = JSON.stringify(embeddings[index].values);

        // insert PDF chunk
        return tx.$queryRaw(
          Prisma.sql`
        INSERT INTO pdf_chunk (id, pdf_id, chunk_text, chunk_index, embedding)
        VALUES (
          gen_random_uuid(),
          ${pdf.id}::uuid,
          ${chunk},
          ${index},
          ${vec}::vector
        )
      `
    );
  })
);

  return pdf
})
    res.json({
        data: {
          message: 'File uploaded successfully',
          pdf: pdf,
        }
    })
}

export const getAnswers = async (req, res, next) => {
  const { question } = req.body || {};
  
  const embeddingsDetails = await getEmbeddings([question]);

  if(embeddingsDetails.length === 0 || embeddingsDetails[0].values.length === 0)
    return next(new Error('Could not generate embeddings for the provided question.'))


  // search vector database
  const results = await prismaClient.$queryRaw(
    Prisma.sql`
    SELECT chunk_text, 1 - (
      embedding <=> ${JSON.stringify(embeddingsDetails[0].values)}::vector
      ) AS similarity
    FROM pdf_chunk
    ORDER BY similarity DESC
    LIMIT 5
    `
  );

  if(results.length === 0 || parseFloat(results[0].similarity) < 0.5){
    return next(new opError('No relevant information found for the provided question.', 404))
  }

  // clean context
  const context = results.map(r => r.chunk_text).join("\n\n");

  // generate answer
  const answer = await getAnswersByAi({context, question});

  res.json({
    data: {
      answer,
    }
  });
  
}