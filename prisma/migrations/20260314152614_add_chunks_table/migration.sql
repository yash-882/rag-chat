CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateTable
CREATE TABLE "pdf" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "label" VARCHAR(50) NOT NULL,
    "file_name" VARCHAR(100) NOT NULL, 
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pdf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pdf_chunk" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pdf_id" UUID NOT NULL,
    "chunk_text" TEXT NOT NULL,
    "embedding" vector(768) NOT NULL,

    CONSTRAINT "pdf_chunk_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "pdf_chunk" ADD CONSTRAINT "pdf_chunk_pdf_id_fkey" FOREIGN KEY ("pdf_id") REFERENCES "pdf"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
