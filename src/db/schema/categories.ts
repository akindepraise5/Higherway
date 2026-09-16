import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core"
import { materials } from "./materials"

/**
 * Categories are many-to-many. A material with none is shown as
 * "Uncategorised" — that is a computed state, not a row, so nothing has to be
 * re-filed when a category is finally given. ARCHITECTURE.md §5.
 *
 * Seeded from the 69 topics found in the v1 spreadsheet. 19 of those are used
 * exactly once, which is why merging is a first-class action rather than a
 * delete-and-retag chore.
 */
export const categories = pgTable(
  "categories",
  {
    id: uuid().primaryKey().defaultRandom(),
    slug: text().notNull(),
    name: text().notNull(),
    blurb: text(),

    /** Manual ordering for the home page tiles; nulls sort last by count. */
    sortOrder: integer(),

    /**
     * The category's own embedding. Comparing a document against these is the
     * free category suggestion — no model, no account. ARCHITECTURE.md §8.
     */
    embedding: vector({ dimensions: 384 }),

    /** Set when this category was merged into another, keeping old links working. */
    mergedIntoId: uuid(),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("categories_slug_idx").on(t.slug), index("categories_name_idx").on(t.name)],
)

/** The join. Ordinal keeps "first topic" meaningful, as v1 relied on it. */
export const materialCategories = pgTable(
  "material_categories",
  {
    materialId: uuid()
      .notNull()
      .references(() => materials.id, { onDelete: "cascade" }),
    categoryId: uuid()
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),

    ordinal: integer().notNull().default(0),

    /** Who filed it here, and whether a machine proposed it. */
    assignedBy: text(),
    suggested: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.materialId, t.categoryId] }),
    index("material_categories_category_idx").on(t.categoryId),
  ],
)
