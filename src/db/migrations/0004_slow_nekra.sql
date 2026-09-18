DROP INDEX "material_chunks_fts_idx";--> statement-breakpoint
ALTER TABLE "material_chunks" ADD COLUMN "tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', "text")) STORED;--> statement-breakpoint
CREATE INDEX "material_chunks_fts_idx" ON "material_chunks" USING gin ("tsv");