import { Prisma } from "../../prisma/generated/prisma/client.ts";
import { getAnswersByAi, getAnswersByAiStream, getEmbeddings } from "../utils/services/ai.service.js";
import { cleanPdfText, getPdfChunks, getPdfHash, getPdfSources, validatePdfResult } from "../utils/services/pdf.service.js";
import { extractText } from "unpdf";
import { deleteCache, getCache, setCache } from "../utils/services/cache.service.js";
import { getOrCreateConversation, saveMessage, updateConversationMemory } from "../utils/services/conversation.service.js";
import prismaClient from "../configs/prisma.config.js";
import opError from "../utils/classes/opError.class.js";

// upload file ------------------------------------------------
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
      ${chunk}, -- chunk text
      ${vec}::vector -- embedding
    )`;
    });

    // insert all pdf chunks
    await tx.$queryRaw(
      Prisma.sql`
      INSERT INTO pdf_chunk (id, pdf_id, chunk_text, embedding)
      -- output values: ( id, pdf_id, chunk_text, chunk_index, embedding ), and so on..
      VALUES ${Prisma.join(values)} 
    `
    );

  });

  // invalidate the full user PDF list cache
  // key is flat so this always hits the right key
  await deleteCache(`user-pdfs:${req.user.id}`);

  // send response
  res.status(201).json({
    data: {
      message: 'File uploaded successfully',
      pdf: pdf,
    }
  })
}

// get answers without streaming -----------------------------------------------------
export const getAnswers = async (req, res, next) => {

  const { question, conversationId } = req.body;

  // get or create conversation
  const conversation = await getOrCreateConversation(req.user.id, conversationId);

  // save user message 
  await saveMessage(conversation.id, question, 'USER');

  // get embeddings
  const embeddingsDetails = await getEmbeddings([question]);

  if (!embeddingsDetails?.[0]?.values) {
    throw new opError("Embedding generation failed", 502);
  }

  // search vector DB
  const results = await prismaClient.$queryRaw(
    Prisma.sql`
      SELECT 
        pdf_id, 
        file_name, 
        pc.chunk_text, 
        1 - (
          embedding <=> ${JSON.stringify(embeddingsDetails[0].values)}::vector
        ) AS similarity
      FROM pdf
      JOIN pdf_chunk pc ON pdf.id = pc.pdf_id
      WHERE user_id = ${req.user.id}::uuid
      ORDER BY similarity DESC
      LIMIT 5
      `
  );

  // if no results found or similarity is too low
  const similarity = Number(results?.[0]?.similarity || 0);

  if (!results.length || similarity < 0.5) {
    // weak/no PDF context — check if this is a follow-up question
    if (!Array.isArray(conversation.memory) || conversation.memory.length === 0) {
      // no memory, no PDF context → cannot answer
      return res.status(200).json({
        data: {
          answer: "No relevant information found across your uploaded documents."
        }
      });
    }
    // memory exists → treat as follow-up answer (context will be empty, memory will be used)
  }

  // unique + sorted pdfIds (stable cache key) 
  const pdfIds = results.length > 0 ? [...new Set(results.map(r => r.pdf_id))].sort() : [];
  const keySource = `${question.trim().toLowerCase()}:${pdfIds.join(',')}:${req.user.id}`;


  // array of sources (empty if no strong PDF match)
  const sources = results.length > 0 ? getPdfSources(results) : [];

  let data = await getCache(keySource);
  const isCached = !!(data && data.answer);

  if (!isCached) {
    // clean context (may be empty for follow-up questions with weak PDF matches)
    const context = results.length > 0 ? results.map(r => r.chunk_text).join("\n\n") : "";

    // generate answer
    const answer = await getAnswersByAi({ context, question, memory: conversation.memory });

    // save assistant message
    await saveMessage(conversation.id, answer, 'ASSISTANT');

    data = {
      answer,
      sources
    };

    // cache it
    await setCache(keySource, data, 600);
  }

  else {
    // save assistant message
    try {
      await saveMessage(conversation.id, data.answer, 'ASSISTANT');
    } catch (err) {
      console.error('Error saving assistant message from cache:', err);
    }

    // do NOT update memory for cached answers to avoid duplicate context
  }

  return res.status(200).json({
    data: {
      content: data,
      conversationId: conversation.id,
      sources,
      isCached
    }
  });
};

// user's all uploaded files details (name, created_at) -----------------------------------------------
export const getMyFiles = async (req, res, next) => {
  // cache key
  // this way uploadFile and deleteMyFile can always invalidate with one simple key
  const cacheKey = `user-pdfs:${req.user.id}`;

  // check cache
  const cachedPdfs = await getCache(cacheKey);

  if (cachedPdfs) {
    return res.status(200).json({
      data: {
        content: cachedPdfs,
        isCached: true
      }
    });
  }

  // cache miss — fetch full list from DB (no skip/take)
  const pdfs = await prismaClient.pdf.findMany({
    where: {
      user_id: req.user.id
    },
    select: {
      id: true,
      file_name: true,
      created_at: true
    },
    orderBy: {
      created_at: 'desc'
    }
  });

  // cache the full list under the flat key
  await setCache(cacheKey, pdfs, 600);

  res.status(200).json({
    data: {
      content: pdfs,
      isCached: false
    }
  });

};

// delete user's file --------------------------------------------------
export const deleteMyFile = async (req, res, next) => {
  const { fileId } = req.params;

  // delete file
  await prismaClient.pdf.delete({
    where: {
      id: fileId,
      user_id: req.user.id
    }
  });

  // flat key — always matches what getMyFiles set
  await deleteCache(`user-pdfs:${req.user.id}`);

  // send response
  res.status(200).json({
    status: 'success',
    message: 'File deleted successfully.'
  });
}

// get answer with streaming (SSE) -------------------------------------------------
export const getAnswersStream = async (req, res, next) => {
  const { question, conversationId } = req.body || {};

  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Content-Type', 'text/event-stream')
  res.flushHeaders()

  const sendEvent = (eventType, payload) => {
    res.write(`data: ${JSON.stringify({ type: eventType, ...payload })}\n\n`);
  };

  let conversation;
  try {
    conversation = await getOrCreateConversation(req.user.id, conversationId);
    await saveMessage(conversation.id, question, 'USER', 'SUCCESS')
  } catch (err) {
    console.log(err);
    sendEvent("error", {
      message: err.message || "Failed to get or create conversation."
    });
    res.end();
    return;
  }

  try {
    await deleteCache(`messages:${req.user.id}:${conversation.id}:first`);
  } catch (err) {
    console.log(err);
  }

  try {
    const embeddingDetails = await getEmbeddings([question]);

    const results = await prismaClient.$queryRaw(
      Prisma.sql`
  SELECT 
    pdf_id, 
    file_name, 
    pc.chunk_text, 
    1 - (
      embedding <=> ${JSON.stringify(embeddingDetails[0].values)}::vector
    ) AS similarity
  FROM pdf
  JOIN pdf_chunk pc ON pdf.id = pc.pdf_id
  WHERE user_id = ${req.user.id}::uuid
  ORDER BY similarity DESC
  LIMIT 8
`
    );

    const isWeakContext = results.length === 0 || parseFloat(results[0].similarity) < 0.5;

    if (isWeakContext) {
      if (!Array.isArray(conversation.memory) || conversation.memory.length === 0) {
        await saveMessage(conversation.id, '', 'ASSISTANT', 'NO_RESULT')
        sendEvent("chunk", {
          token: "No relevant information found across your uploaded documents."
        });
        sendEvent("done", {
          conversationId: conversation.id,
          sources: [],
          isCached: false
        });
        res.end();
        return;
      }
    }

    // check cache for the simiilar question with the same context (pdfIds or memory) to reuse the answer if possible
    let keySource;
    let cached;

    // for caching: if there's a strong PDF context, use pdfIds; if weak context, use memory content (which is the only context available)
    if (!isWeakContext) {
      const pdfIds = [...new Set(results.map(r => r.pdf_id))].sort();
      keySource = `db:${question.trim().toLowerCase()}:${pdfIds.join(',')}:${req.user.id}`;

    } else {
      keySource = `memory:${question.trim().toLowerCase()}:${conversation.memory.map(m => m.content).join(' ')}:${req.user.id}`;
    }


    if(!isWeakContext){
    try {
      cached = await getCache(keySource);
    } catch (err) {
      console.log(err);
    }
  }
  
    
    if (cached && cached.answer ) {
      await saveMessage(conversation.id, cached.answer, 'ASSISTANT', 'SUCCESS')

      try {
        // update conversation memory
        await updateConversationMemory(conversation, { question, answer: cached.answer });
      } catch (err) {
        console.error('CRITICAL: Error updating conversation memory:', err);
      }

      const words = cached.answer.split(" ");
      for (const word of words) {
        sendEvent("chunk", { token: word + " " });
      }

      sendEvent("done", {
        conversationId: conversation.id,
        sources: cached.sources,
        isCached: true
      });

      res.end();
      return;
    }

    const context = results.length > 0 ? results.map(r => r.chunk_text).join("\n\n") : "";

    await getAnswersByAiStream({
      context,
      question,
      memory: conversation.memory,

      onChunk: (token) => {
        sendEvent("chunk", { token });
      },

      onDone: async (fullAnswer) => {
        try {
          await saveMessage(conversation.id, fullAnswer, 'ASSISTANT', 'SUCCESS')
        } catch (err) {
          console.error('Error saving assistant message:', err);
          sendEvent("error", {
            conversationId: conversation.id,
            message: process.env.NODE_ENV === 'development'
              ? (err.message || "Failed to save message.") : "Something went wrong."
          });
          res.end();
          return;
        }

        try {
          await updateConversationMemory(conversation, { question, answer: fullAnswer });
        } catch (err) {
          console.error('CRITICAL: Error updating conversation memory:', err);
        }

        let sources = [];
        try {
          sources = !isWeakContext ? getPdfSources(results) : [];
        } catch (err) {
          console.error('Error getting PDF sources:', err);
        }

        try {
          await setCache(keySource, { answer: fullAnswer, sources }, 600);
        } catch (err) {
          console.log('Non-critical: Cache set failed:', err);
        }

        sendEvent("done", { conversationId: conversation.id, sources, isCached: false });
        res.end();
      },
    });

  } catch (err) {
    console.log(err);
    sendEvent("error", {
      conversationId: conversation.id,
      message: process.env.NODE_ENV === 'development'
        ? (err.message || "Failed to process the question.") : "Something went wrong."
    });
    res.end();
  }
}