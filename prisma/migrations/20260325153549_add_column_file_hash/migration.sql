/*
  Warnings:

  - Added the required column `file_hash` to the `pdf` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "pdf" ADD COLUMN     "file_hash" VARCHAR(100) NOT NULL;
