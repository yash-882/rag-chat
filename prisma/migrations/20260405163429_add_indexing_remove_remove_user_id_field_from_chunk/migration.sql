/*
  Warnings:

  - You are about to drop the column `user_id` on the `pdf_chunk` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[file_hash]` on the table `pdf` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "conversation" DROP CONSTRAINT "conversation_user_id_fkey";

-- DropIndex
DROP INDEX "pdf_chunk_user_id_idx";

-- AlterTable
ALTER TABLE "pdf_chunk" DROP COLUMN "user_id";

-- CreateIndex
CREATE INDEX "conversation_user_id_created_at_idx" ON "conversation"("user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "pdf_file_hash_key" ON "pdf"("file_hash");

-- CreateIndex
CREATE INDEX "pdf_chunk_pdf_id_idx" ON "pdf_chunk"("pdf_id");
