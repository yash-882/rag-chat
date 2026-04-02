-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('NO_RESULT', 'SUCCESS');

-- AlterTable
ALTER TABLE "message" ADD COLUMN     "type" "MessageType" NOT NULL DEFAULT 'SUCCESS';
