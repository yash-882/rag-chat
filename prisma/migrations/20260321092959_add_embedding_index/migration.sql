-- add index for embeddings[] column
CREATE INDEX ON pdf_chunk USING hnsw (embedding vector_cosine_ops);