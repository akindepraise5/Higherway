import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { user } from "./auth"

/**
 * Operational tables: what staff did, and what each sync run found.
 * Distinct from analytics, which is what visitors did. ARCHITECTURE.md §11.
 */

/**
 * Append-only. Every mutation goes through src/server/services/ and writes its
 * row here in the same transaction as the change — a change that cannot be
 * audited must not happen. See CLAUDE.md.
 *
 * actorId now carries its foreign key — the debt Phase 1 deliberately deferred
 * until the `user` table existed. `set null` rather than `cascade`: deleting a
 * person must never erase the record of what they did.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid().primaryKey().defaultRandom(),

    actorId: text().references(() => user.id, { onDelete: "set null" }),
    /** e.g. "material.publish", "category.merge", "duplicate.dismiss" */
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: text(),

    /** Enough to answer "what changed and what was it before". */
    before: jsonb(),
    after: jsonb(),

    ip: text(),
    userAgent: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_actor_idx").on(t.actorId),
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
    index("audit_log_created_idx").on(t.createdAt),
  ],
)

/**
 * One row per press of the Sync button. Sync is manual and one-way: it pulls
 * from Drive and never writes back. ARCHITECTURE.md §2.
 *
 * **Written when the button is pressed, not when the task starts.** It used to be
 * created inside `sync-drive`, so until a worker picked the run up there was no
 * row at all: the history stayed empty, the page said "scanning the folder" for
 * ever, and the one-at-a-time guard — which reads this table — could not see a
 * run that did not exist yet. Two presses both went through. Same mistake as
 * creating a material inside `process-material`, and the same fix.
 */
export const syncRuns = pgTable(
  "sync_runs",
  {
    id: uuid().primaryKey().defaultRandom(),

    startedBy: text(),
    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp({ withTimezone: true }),

    /**
     * The Trigger.dev run this row belongs to.
     *
     * Stored so the page can ask Trigger what happened to it. A run that is
     * queued and never picked up is indistinguishable from one that is working,
     * unless somebody asks — and "queued, no worker" is the single most useful
     * thing this page can say when nothing appears to be happening.
     */
    runId: text(),

    imported: integer().notNull().default(0),
    skipped: integer().notNull().default(0),
    /** Held back as possible duplicates, or changed in Drive since import. */
    flagged: integer().notNull().default(0),
    failed: integer().notNull().default(0),

    /** Per-file detail, so a run can be explained after the fact. */
    detail: jsonb(),
    error: text(),
  },
  (t) => [index("sync_runs_started_idx").on(t.startedAt)],
)
