CREATE TYPE "public"."duplicate_status" AS ENUM('pending', 'dismissed', 'merged');--> statement-breakpoint
CREATE TYPE "public"."material_source" AS ENUM('drive_sync', 'admin_upload', 'url_import', 'public_submission');--> statement-breakpoint
CREATE TYPE "public"."material_status" AS ENUM('staged', 'processing', 'review', 'published', 'archived', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."ocr_engine" AS ENUM('text_layer', 'vision', 'gcv', 'tesseract', 'none');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"blurb" text,
	"sort_order" integer,
	"embedding" vector(384),
	"merged_into_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_categories" (
	"material_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"ordinal" integer DEFAULT 0 NOT NULL,
	"assigned_by" text,
	"suggested" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "material_categories_material_id_category_id_pk" PRIMARY KEY("material_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "duplicate_pairs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_a_id" uuid NOT NULL,
	"material_b_id" uuid NOT NULL,
	"score" real NOT NULL,
	"signals" jsonb NOT NULL,
	"status" "duplicate_status" DEFAULT 'pending' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_id" uuid NOT NULL,
	"page_number" integer NOT NULL,
	"r2_key_webp" text,
	"width" integer,
	"height" integer,
	"text" text,
	"ocr_engine" "ocr_engine" DEFAULT 'none' NOT NULL,
	"ocr_quality" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"title_original" text,
	"summary" text,
	"author" text,
	"status" "material_status" DEFAULT 'staged' NOT NULL,
	"source" "material_source" NOT NULL,
	"r2_key_pdf" text,
	"byte_size" integer,
	"page_count" integer,
	"sha256" text,
	"drive_file_id" text,
	"drive_md5" text,
	"drive_checked_at" timestamp with time zone,
	"ocr_engine" "ocr_engine" DEFAULT 'none' NOT NULL,
	"ocr_quality" real,
	"text_public" boolean DEFAULT true NOT NULL,
	"duplicate_of_id" uuid,
	"view_count" integer DEFAULT 0 NOT NULL,
	"download_count" integer DEFAULT 0 NOT NULL,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_by" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"imported" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"flagged" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"detail" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "material_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_id" uuid NOT NULL,
	"page_number" integer,
	"text" text NOT NULL,
	"embedding" vector(384)
);
--> statement-breakpoint
ALTER TABLE "material_categories" ADD CONSTRAINT "material_categories_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_categories" ADD CONSTRAINT "material_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_pairs" ADD CONSTRAINT "duplicate_pairs_material_a_id_materials_id_fk" FOREIGN KEY ("material_a_id") REFERENCES "public"."materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duplicate_pairs" ADD CONSTRAINT "duplicate_pairs_material_b_id_materials_id_fk" FOREIGN KEY ("material_b_id") REFERENCES "public"."materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_pages" ADD CONSTRAINT "material_pages_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_chunks" ADD CONSTRAINT "material_chunks_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_idx" ON "categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "categories_name_idx" ON "categories" USING btree ("name");--> statement-breakpoint
CREATE INDEX "material_categories_category_idx" ON "material_categories" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "duplicate_pairs_unique_idx" ON "duplicate_pairs" USING btree ("material_a_id","material_b_id");--> statement-breakpoint
CREATE INDEX "duplicate_pairs_status_idx" ON "duplicate_pairs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "duplicate_pairs_b_idx" ON "duplicate_pairs" USING btree ("material_b_id");--> statement-breakpoint
CREATE UNIQUE INDEX "material_pages_unique_idx" ON "material_pages" USING btree ("material_id","page_number");--> statement-breakpoint
CREATE INDEX "material_pages_material_idx" ON "material_pages" USING btree ("material_id");--> statement-breakpoint
CREATE UNIQUE INDEX "materials_slug_live_idx" ON "materials" USING btree ("slug") WHERE archived_at is null;--> statement-breakpoint
CREATE UNIQUE INDEX "materials_sha256_live_idx" ON "materials" USING btree ("sha256") WHERE archived_at is null and sha256 is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "materials_drive_file_idx" ON "materials" USING btree ("drive_file_id") WHERE drive_file_id is not null;--> statement-breakpoint
CREATE INDEX "materials_status_idx" ON "materials" USING btree ("status");--> statement-breakpoint
CREATE INDEX "materials_published_idx" ON "materials" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "materials_title_trgm_idx" ON "materials" USING gin (lower("title") gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sync_runs_started_idx" ON "sync_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "material_chunks_material_idx" ON "material_chunks" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "material_chunks_embedding_idx" ON "material_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "material_chunks_fts_idx" ON "material_chunks" USING gin (to_tsvector('english', "text"));