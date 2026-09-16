import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { materials } from "./materials"

/**
 * The archive arrives with duplicates: 62 exact-title groups covering 132 rows,
 * and 69 once case and punctuation are ignored. One title appears three times.
 * ARCHITECTURE.md §8.
 *
 * Nothing here deletes anything. A pair is raised, a human decides, and the
 * decision is remembered — a dismissed pair is never raised again.
 */
export const duplicateStatus = pgEnum("duplicate_status", [
  "pending",
  "dismissed", // a human said these are not duplicates — never flag again
  "merged", // one was kept, the other archived
])

export const duplicatePairs = pgTable(
  "duplicate_pairs",
  {
    id: uuid().primaryKey().defaultRandom(),

    /**
     * Ordered by id so a pair is stored once, never twice. Enforced by the
     * unique index below plus ordering at the call site.
     */
    materialAId: uuid()
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    materialBId: uuid()
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),

    /** Combined confidence, and the reasons behind it. */
    score: real().notNull(),

    /**
     * Which signals fired and how strongly, e.g.
     * { sha256: true, title: 0.78, shingles: 0.84, embedding: 0.95 }
     * The review page explains itself from this rather than showing a number.
     */
    signals: jsonb().notNull(),

    status: duplicateStatus().notNull().default("pending"),

    decidedBy: text(),
    decidedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("duplicate_pairs_unique_idx").on(t.materialAId, t.materialBId),
    index("duplicate_pairs_status_idx").on(t.status),
    index("duplicate_pairs_b_idx").on(t.materialBId),
  ],
)
