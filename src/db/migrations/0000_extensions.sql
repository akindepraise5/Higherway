-- Extensions must exist before the schema migration: it creates a vector(384)
-- column, a gin_trgm_ops index on material titles, and an HNSW index. Without
-- these, every one of those statements fails.
--
-- Both are available on Neon's free plan. See ARCHITECTURE.md §3 and §9.
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
