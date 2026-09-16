/**
 * Reading the v1 spreadsheet. This runs once, to seed the database with the
 * 651 materials already published, then the sheet is retired in favour of the
 * admin panel (ARCHITECTURE.md §13).
 *
 * The parser is carried over from v1, where it read this exact sheet in the
 * browser for two years. It honours quoted fields, escaped quotes and
 * newlines inside cells — all of which Google Sheets will happily produce.
 *
 * Pure by design (CLAUDE.md): no network. Fetching the CSV is the caller's job.
 */

/** The real header row, for reference:
 *  SN | Title | Author | Drive Link (Ctrl + Click) | Topics/Tags | Summary
 */
const COLUMNS = {
  title: ["title", "name", "nametitle", "material", "materialtitle"],
  topics: ["topicstags", "topics", "topic", "tags", "tag", "category", "categories", "topictag"],
  link: [
    "drivelinkctrlclick",
    "drivelink",
    "googledrivelink",
    "link",
    "url",
    "drive",
    "file",
    "filelink",
  ],
  author: ["author", "writer", "by"],
  summary: ["summary", "description", "about", "notes"],
} as const

/**
 * Topic values meaning "not filed yet". 367 of 651 rows — 56% — carry
 * "— Review manually". Those become Uncategorised until an admin files them.
 */
const PLACEHOLDER_TOPICS = new Set([
  "reviewmanually",
  "review",
  "tbd",
  "tba",
  "na",
  "none",
  "pending",
  "",
])

export type SheetRow = {
  title: string
  author: string
  summary: string
  driveUrl: string
  driveFileId: string | null
  topics: string[]
  /** Position in the sheet. v1 treated later rows as newer, and so do we. */
  row: number
}

/** Header matching ignores case, spaces and punctuation. */
const key = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "")

export function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      quoted = true
    } else if (c === ",") {
      row.push(field)
      field = ""
    } else if (c === "\n") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
    } else if (c !== "\r") {
      field += c
    }
  }

  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/** Finds the header row and maps the columns we care about onto their indexes. */
export function mapColumns(
  rows: string[][],
): { header: number; idx: Record<string, number> } | null {
  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const heads = rows[r].map(key)
    const idx: Record<string, number> = {}

    for (const [field, names] of Object.entries(COLUMNS)) {
      const i = heads.findIndex((h) => h && (names as readonly string[]).includes(h))
      if (i > -1) idx[field] = i
    }

    // Title and link are the minimum: without both, a row cannot become a material.
    if (idx.title != null && idx.link != null) return { header: r, idx }
  }
  return null
}

export const isPlaceholderTopic = (t: string): boolean => PLACEHOLDER_TOPICS.has(key(t))

export function splitTopics(cell: string): string[] {
  return String(cell || "")
    .split(/[,;|/]/)
    .map((t) => t.trim().replace(/\s+/g, " "))
    .filter((t) => t && !isPlaceholderTopic(t))
}

/** Drive links are used as given; the only check is that a cell holds one. */
export const isLink = (u: string): boolean => /^https?:\/\//i.test(String(u || "").trim())

/** The file id inside a Drive URL, which is how a re-import is avoided. */
export function driveFileIdFrom(url: string): string | null {
  const match = url.match(/\/d\/([\w-]+)/) ?? url.match(/[?&]id=([\w-]+)/)
  return match ? match[1] : null
}

/**
 * Turns the sheet into rows worth importing. A row without a title or without
 * a usable link is skipped rather than half-imported — in the real sheet all
 * 651 rows have both.
 */
export function parseSheet(text: string): SheetRow[] {
  const rows = parseCSV(text)
  const map = mapColumns(rows)

  if (!map) {
    throw new Error(
      "The spreadsheet needs a header row with a Title column and a Drive Link column.",
    )
  }

  const cell = (row: string[], field: string): string =>
    map.idx[field] == null ? "" : String(row[map.idx[field]] ?? "").trim()

  const out: SheetRow[] = []

  for (let r = map.header + 1; r < rows.length; r++) {
    const row = rows[r]
    const title = cell(row, "title")
    const driveUrl = cell(row, "link")
    if (!title || !isLink(driveUrl)) continue

    out.push({
      title,
      author: cell(row, "author"),
      summary: cell(row, "summary"),
      driveUrl,
      driveFileId: driveFileIdFrom(driveUrl),
      topics: splitTopics(cell(row, "topics")),
      row: out.length,
    })
  }

  return out
}
