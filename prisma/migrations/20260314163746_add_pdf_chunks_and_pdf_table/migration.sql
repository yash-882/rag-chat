-- DropForeignKey
ALTER TABLE "pdf_chunk" DROP CONSTRAINT "pdf_chunk_pdf_id_fkey";

-- AlterTable
ALTER TABLE "pdf" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "pdf_chunk" ALTER COLUMN "id" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "pdf_chunk_pdf_id_idx" ON "pdf_chunk"("pdf_id");

-- AddForeignKey
ALTER TABLE "pdf_chunk" ADD CONSTRAINT "pdf_chunk_pdf_id_fkey" FOREIGN KEY ("pdf_id") REFERENCES "pdf"("id") ON DELETE CASCADE ON UPDATE CASCADE;
