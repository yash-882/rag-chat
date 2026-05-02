-- AlterTable
ALTER TABLE "conversation" ADD COLUMN     "memory" JSONB NOT NULL DEFAULT '[]';
