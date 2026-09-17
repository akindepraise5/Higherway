import { randomUUID } from "node:crypto"
import { and, eq, isNull, ne, sql } from "drizzle-orm"
import { db } from "../../db"
import { duplicatePairs, materials } from "../../db/schema"
import { txdb } from "../../db/tx"
import { scoreDuplicate } from "../../lib/dedupe/score"
import { titleOverlap, titleSimilarity } from "../../lib/dedupe/title"
import { containment, textSimilarity } from "../../lib/text/similarity"

/**
 * Scanning **one** material against the archive — pipeline stage 6
 * (ARCHITECTURE.md §6, §8).
 *
 * The scan existed only as `scripts/scan-duplicates.ts`, which compares every
 * material against every other: 566 materials is 160,000 pairs, minutes of work,
 * and something a person has to remember to run. Ingest never called it, so the
 * only duplicate check a new upload got was the SHA-256 equality in `ingestPdf`
 * — which catches the same file twice and nothing else. The pairs that actually
 * matter here are the same teaching photographed on two occasions, where no two
 * bytes agree.
 *
 * One material against the rest is O(n), not O(n²): 566 comparisons, and the
 * expensive text work is done only for the handful that already look related.
 *
 * It decides nothing. It raises pairs, explains why, and a person rules at
 * `/admin/duplicates`. A pair someone has already dismissed is never raised
 * again, which is what makes this safe to run on every upload.
 *
 * **The meaning signal is passed now.** `scoreDuplicate` has always accepted an
 * `embedding` argument and the script has never supplied one, so it silently
 * defaulted to 0 and every duplicate finding in this archive so far rests on
 * titles and shingles alone. Shingles compare word runs, so a teaching retyped
 * or re-scanned with different OCR errors can score near zero on them while
 * plainly being the same text; the vectors are what see through that.
 */

export type ScanResult = {
  /** Pairs newly raised for review. */
  raised: number
  /** Pending pairs re-scored because this material's text or title changed. */
  rescored: number
  /** How many materials it was compared against. */
  compared: number
  /** The strongest finding, for the ingest log and the admin notice. */
  strongest?: { otherId: string; otherTitle: string; score: number; level: string }
}

/** Ordered so a pair is stored once, never twice. Matches the unique index. */
const orderPair = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a])

/** Below this a text is too short for shingles to mean anything. */
const MIN_TEXT = 200

export async function scanMaterial(materialId: string): Promise<ScanResult> {
  const [subject] = await db
    .select({
      id: materials.id,
      title: materials.title,
      sha256: materials.sha256,
      pageCount: materials.pageCount,
    })
    .from(materials)
    .where(eq(materials.id, materialId))
    .limit(1)

  if (!subject) return { raised: 0, rescored: 0, compared: 0 }

  const others = await db
    .select({
      id: materials.id,
      title: materials.title,
      sha256: materials.sha256,
      pageCount: materials.pageCount,
    })
    .from(materials)
    .where(and(isNull(materials.archivedAt), ne(materials.id, materialId)))

  /**
   * Page text for the subject and for everything else, in two queries rather
   * than a correlated subquery. RUNBOOK.md records why: a column object
   * interpolated into a nested `sql` template inside `.select()` matches
   * nothing at all, with no error — it has caused two separate bugs here.
   */
  const textById = new Map<string, string>()
  const textRows = await db.execute(sql`
    select mp.material_id as id,
           string_agg(mp.text, ' ' order by mp.page_number) as text
      from material_pages mp
     where mp.text is not null
     group by mp.material_id`)

  for (const row of ((textRows as { rows?: unknown[] }).rows ?? textRows) as {
    id: string
    text: string | null
  }[]) {
    textById.set(row.id, row.text ?? "")
  }

  const subjectText = textById.get(subject.id) ?? ""

  /**
   * Cosine similarity of the document vectors, for every live material at once.
   *
   * Cheap enough to take unconditionally — one indexed pass over 566 rows — and
   * it has to be unconditional, because this is the signal that catches the
   * pairs the title gate would otherwise never let the text be read for.
   *
   * Empty when the material has not been embedded yet, which is an ordinary
   * state on a fresh upload rather than a fault: the scan then behaves exactly
   * as it did before, on titles and shingles.
   */
  const similarity = new Map<string, number>()
  const vectorRows = await db.execute(sql`
    with me as (
      select embedding from material_chunks
       where material_id = ${materialId}::uuid
         and page_number is null and embedding is not null
       limit 1
    )
    select mc.material_id as id,
           (1 - (mc.embedding <=> (select embedding from me)))::float as similarity
      from material_chunks mc
      join materials m on m.id = mc.material_id
     where mc.page_number is null
       and mc.embedding is not null
       and mc.material_id <> ${materialId}::uuid
       and m.archived_at is null
       and exists (select 1 from me)`)

  for (const row of ((vectorRows as { rows?: unknown[] }).rows ?? vectorRows) as {
    id: string
    similarity: number
  }[]) {
    similarity.set(row.id, row.similarity)
  }

  const existing = await db
    .select({
      id: duplicatePairs.id,
      a: duplicatePairs.materialAId,
      b: duplicatePairs.materialBId,
      status: duplicatePairs.status,
    })
    .from(duplicatePairs)

  const settled = new Set(
    existing.filter((p) => p.status !== "pending").map((p) => `${p.a}:${p.b}`),
  )
  const pendingId = new Map(
    existing.filter((p) => p.status === "pending").map((p) => [`${p.a}:${p.b}`, p.id]),
  )

  const found: {
    a: string
    b: string
    otherId: string
    otherTitle: string
    score: number
    level: string
    signals: Record<string, unknown>
  }[] = []

  for (const other of others) {
    const title = titleSimilarity(subject.title, other.title)
    const sha256Equal = Boolean(subject.sha256 && other.sha256 && subject.sha256 === other.sha256)

    const otherText = textById.get(other.id) ?? ""

    /**
     * Reading the text is the expensive part, so it is done only for pairs that
     * already look related.
     *
     * Gated on raw word overlap rather than on `title`: the series rule sets
     * `title` to 0 for two titles alike in everything but a trailing number, and
     * gating on that would stop the text ever being read — losing the
     * containment finding that is the whole reason such a pair deserves a look.
     */
    const bothHaveText = subjectText.length > MIN_TEXT && otherText.length > MIN_TEXT
    const worthReading =
      bothHaveText && (titleOverlap(subject.title, other.title) >= 0.35 || sha256Equal)

    const shingles = worthReading ? textSimilarity(subjectText, otherText) : 0
    const contained = worthReading ? containment(subjectText, otherText) : 0
    const meaning = similarity.get(other.id) ?? 0

    const verdict = scoreDuplicate({
      sha256Equal,
      title,
      shingles,
      containment: contained,
      embedding: meaning,
      samePageCount: subject.pageCount !== null && subject.pageCount === other.pageCount,
    })

    if (verdict.level === "distinct") continue

    const [a, b] = orderPair(subject.id, other.id)
    if (settled.has(`${a}:${b}`)) continue

    found.push({
      a,
      b,
      otherId: other.id,
      otherTitle: other.title,
      score: verdict.score,
      level: verdict.level,
      signals: {
        level: verdict.level,
        reasons: verdict.reasons,
        title: Number(title.toFixed(3)),
        ...(sha256Equal ? { sha256Equal } : {}),
        ...(shingles ? { shingles: Number(shingles.toFixed(3)) } : {}),
        ...(contained ? { containment: Number(contained.toFixed(3)) } : {}),
        ...(meaning ? { embedding: Number(meaning.toFixed(3)) } : {}),
      },
    })
  }

  found.sort((p, q) => q.score - p.score)

  let raised = 0
  let rescored = 0

  if (found.length > 0) {
    await txdb.transaction(async (tx) => {
      for (const f of found) {
        const known = pendingId.get(`${f.a}:${f.b}`)
        if (known) {
          await tx
            .update(duplicatePairs)
            .set({ score: f.score, signals: f.signals })
            .where(eq(duplicatePairs.id, known))
          rescored++
        } else {
          await tx.insert(duplicatePairs).values({
            id: randomUUID(),
            materialAId: f.a,
            materialBId: f.b,
            score: f.score,
            signals: f.signals,
            status: "pending",
          })
          raised++
        }
      }
    })
  }

  /**
   * Deliberately **not** withdrawing pending pairs this scan did not find, which
   * the whole-archive script does. That script has looked at every pair and can
   * say a finding no longer holds; this one has looked at a single material and
   * knows nothing about the pairs between two others. Withdrawing on that basis
   * would delete other materials' findings on every upload.
   */
  const top = found[0]

  return {
    raised,
    rescored,
    compared: others.length,
    strongest: top
      ? { otherId: top.otherId, otherTitle: top.otherTitle, score: top.score, level: top.level }
      : undefined,
  }
}
