import { Prisma } from "../../prisma/generated/prisma/client.ts";
import { prismaClient } from "../server.js"
import { getEmbeddings } from "../utils/services/ai.service.js";
import { cleanPdfText, getPdfChunks, validatePdfResult } from "../utils/services/pdf.service.js";
import { extractText } from "unpdf";

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
