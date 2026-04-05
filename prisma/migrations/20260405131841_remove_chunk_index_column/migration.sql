/*
  Warnings:

  - You are about to drop the column `chunk_index` on the `pdf_chunk` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "pdf_chunk" DROP COLUMN "chunk_index";
