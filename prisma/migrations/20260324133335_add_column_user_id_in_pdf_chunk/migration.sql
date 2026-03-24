/*
  Warnings:

  - Added the required column `user_id` to the `pdf_chunk` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "pdf_chunk" ADD COLUMN     "user_id" UUID NOT NULL;
