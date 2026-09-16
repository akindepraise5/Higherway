import { sql } from "drizzle-orm"
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

/**
 * A material is one published item: a PDF plus everything we know about it.
 * See ARCHITECTURE.md §5. Postgres holds the record; R2 holds the file.
 */

/** The ingestion pipeline, in order. ARCHITECTURE.md §6. */
export const materialStatus = pgEnum("material_status", [
  "staged", // in r2://staging/, nothing else done yet
  "processing", // pages, text, embeddings, duplicate scan running
  "review", // waiting for a human — flagged duplicate, or a submission
  "published", // public
  "archived", // soft-deleted; reversible, never destroyed
  "rejected", // a submission that was turned down
])

/** Where a material came from. All four walk the same pipeline. */
export const materialSource = pgEnum("material_source", [
  "drive_sync",
  "admin_upload",
  "url_import",
  "public_submission",
])

/**
 * Which engine read the text, so the re-read queue knows what to upgrade.
 * ARCHITECTURE.md §7: text_layer is perfect and free, vision is best for
 * scans, gcv is the server default, tesseract the credential-free fallback.
 */
export const ocrEngine = pgEnum("ocr_engine", ["text_layer", "vision", "gcv", "tesseract", "none"])

export const materials = pgTable(
  "materials",
  {
    id: uuid().primaryKey().defaultRandom(),

    /** Stable once published — this is the public URL, /m/[slug]. */
    slug: text().notNull(),

    /** What we show, and what the source called it. Titles are often filenames. */
    title: text().notNull(),
    titleOriginal: text(),
    summary: text(),
    author: text(),

    status: materialStatus().notNull().default("staged"),
    source: materialSource().notNull(),

    /** The file in R2. sha256 is how an identical re-upload is caught instantly. */
    r2KeyPdf: text(),
    byteSize: integer(),
    pageCount: integer(),
    sha256: text(),

    /**
     * Drive is a read-only inbox. These record what was imported so a re-sync
     * never imports twice, and so a file edited in Drive can be flagged.
     */
    driveFileId: text(),
    driveMd5: text(),
    driveCheckedAt: timestamp({ withTimezone: true }),

    /** How well we read it. Low scores surface in the re-read queue. */
    ocrEngine: ocrEngine().notNull().default("none"),
    ocrQuality: real(),

    /**
     * OCR text is public by default — it is what makes a photographed page
     * findable on Google. Per-material switch because OCR of photos errs.
     */
    textPublic: boolean().notNull().default(true),

    /** Set when a duplicate review archives this in favour of another. */
    duplicateOfId: uuid(),

    /** Our own counters, for "Most read" and the admin dashboard. */
    viewCount: integer().notNull().default(0),
    downloadCount: integer().notNull().default(0),

    publishedAt: timestamp({ withTimezone: true }),
    archivedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /** Slugs and checksums are unique among live rows only — an archived
        duplicate keeps its own, so nothing has to be renamed to archive it. */
    uniqueIndex("materials_slug_live_idx").on(t.slug).where(sql`archived_at is null`),
    uniqueIndex("materials_sha256_live_idx")
      .on(t.sha256)
      .where(sql`archived_at is null and sha256 is not null`),
    uniqueIndex("materials_drive_file_idx").on(t.driveFileId).where(sql`drive_file_id is not null`),

    index("materials_status_idx").on(t.status),
    index("materials_published_idx").on(t.publishedAt),
    /** Fuzzy title matching for the duplicate check. ARCHITECTURE.md §8. */
    index("materials_title_trgm_idx").using("gin", sql`lower(${t.title}) gin_trgm_ops`),
  ],
)

/**
 * One row per page. Drives the reader, lets a search result point at a page,
 * and lets a single page be re-read without redoing the document.
 */
export const materialPages = pgTable(
  "material_pages",
  {
    id: uuid().primaryKey().defaultRandom(),
    materialId: uuid()
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),

    pageNumber: integer().notNull(),

    /** The rendered page in R2, plus its dimensions for layout without a fetch. */
    r2KeyWebp: text(),
    width: integer(),
    height: integer(),

    text: text(),
    ocrEngine: ocrEngine().notNull().default("none"),
    ocrQuality: real(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("material_pages_unique_idx").on(t.materialId, t.pageNumber),
    index("material_pages_material_idx").on(t.materialId),
  ],
)
