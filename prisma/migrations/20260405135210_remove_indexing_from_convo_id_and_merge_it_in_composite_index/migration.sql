-- DropIndex
DROP INDEX "message_conversation_id_idx";

-- DropIndex
DROP INDEX "message_created_at_seq_idx";

-- CreateIndex
CREATE INDEX "message_conversation_id_created_at_seq_idx" ON "message"("conversation_id", "created_at" DESC, "seq" DESC);
