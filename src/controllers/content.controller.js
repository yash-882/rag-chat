import { Prisma } from "../../prisma/generated/prisma/client.ts";
import { getAnswersByAi, getAnswersByAiStream, getEmbeddings } from "../utils/services/ai.service.js";
import { cleanPdfText, getPdfChunks, getPdfHash, validatePdfResult } from "../utils/services/pdf.service.js";
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
  const cacheKey = `embedding:${question.trim().toLowerCase()}:${req.user.id}`;
  let embeddingsDetails = await getCache(cacheKey);
  if (!embeddingsDetails) {
    embeddingsDetails = await getEmbeddings([question]);
    await setCache(cacheKey, embeddingsDetails, 3600);
  }

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
    if (!Array.isArray(conversation.memory) || conversation.memory.length === 0) {
      return res.status(200).json({
        data: {
          answer: "No relevant information found across your uploaded documents."
        }
      });
    }
  }

  // clean context
  const context = results.length > 0 ? results.map(r => r.chunk_text).join("\n\n") : "";

  // generate answer
  const answer = await getAnswersByAi({ context, question, memory: conversation.memory });

  // save assistant message
  await saveMessage(conversation.id, answer, 'ASSISTANT');

  // update memory
  try {
    await updateConversationMemory(conversation, { question, answer });
  } catch (err) {
    console.error('CRITICAL: Error updating conversation memory:', err);
  }

  return res.status(200).json({
    data: {
      answer,
      conversationId: conversation.id,
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

  res.setHeader('Connection', 'keep-alive') // keep the connection open for streaming
  res.setHeader('Cache-Control', 'no-cache') // prevent caching of the response
  res.setHeader('Content-Type', 'text/event-stream') // set content type for SSE
  res.flushHeaders() // flush the headers to establish the SSE connection immediately

  // helper function to send SSE events in a consistent format
  const sendEvent = (eventType, payload) => {
    res.write(`data: ${JSON.stringify({ type: eventType, ...payload })}\n\n`);
  };

  // get or create conversation, and save the user question as the first message in the conversation
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

  // invalidate the first page of messages cache for this conversation 
  // to ensure the new question appears in the message list immediately (if the client is fetching messages with pagination)
  try {
    await deleteCache(`messages:${req.user.id}:${conversation.id}:first`);
  } catch (err) {
    console.log(err);
  }

  // get embeddings for the question to search for relevant PDF chunks as context for the answer
  try {
    const cacheKey = `embedding:${question.trim().toLowerCase()}:${req.user.id}`;

    // check cache for embeddings
    let embeddingDetails = await getCache(cacheKey);

    if (!embeddingDetails || !embeddingDetails[0]?.values) {
      
      embeddingDetails = await getEmbeddings([question]);
      await setCache(cacheKey, embeddingDetails, 3600); // cache embeddings to avoid redundant calls for the same question
    }

    
    const results = await prismaClient.$queryRaw(
      Prisma.sql`
  SELECT 
    pc.chunk_text,
    file_name,
    1 - (
      embedding <=> ${JSON.stringify(embeddingDetails[0].values)}::vector
    ) AS similarity
  FROM pdf
  JOIN pdf_chunk pc ON pdf.id = pc.pdf_id
  WHERE user_id = ${req.user.id}::uuid
  ORDER BY similarity DESC
  LIMIT 7
`
    );

    // if no results found or similarity is too low, treat as weak context (still try to answer with memory if exists, but skip PDF sources)
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
        
        });
        res.end();
        return;
      }
    }

    // clean context
    const context = results.length > 0 ? 
    results.map(r => `[Source: ${r.file_name}]\n${r.chunk_text}`).join("\n\n") 
    : "No context available.";

    // generate answer with streaming
    await getAnswersByAiStream({
      context,
      question,
      memory: conversation.memory,

      // called per chunk retrieved from the LLM
      onChunk: (token) => {
        sendEvent("chunk", { token });
      },

      // called when the full answer has been sent
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

        // update memory with the full question and answer (not per chunk to avoid fragmentation and context dilution)
        try {
          await updateConversationMemory(conversation, { question, answer: fullAnswer });
        } catch (err) {
          console.error('CRITICAL: Error updating conversation memory:', err);
        }

        sendEvent("done", { conversationId: conversation.id, });
        res.end();
      },
    });
  } catch (err) {
    console.log(err);

    // close the stream with an error event
    sendEvent("error", {
      conversationId: conversation.id,
      message: process.env.NODE_ENV === 'development'
        ? (err.message || "Failed to process the question.") : "Something went wrong."
    });
    res.end();
  }
}