/*
  Warnings:

  - A unique constraint covering the columns `[user_id,file_hash]` on the table `pdf` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "pdf_file_hash_key";

-- DropIndex
DROP INDEX "pdf_user_id_idx";

-- CreateIndex
CREATE UNIQUE INDEX "pdf_user_id_file_hash_key" ON "pdf"("user_id", "file_hash");
