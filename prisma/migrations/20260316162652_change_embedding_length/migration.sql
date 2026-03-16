-- change length of an embedding
ALTER TABLE "pdf_chunk" ALTER COLUMN "embedding" TYPE vector(3072);
