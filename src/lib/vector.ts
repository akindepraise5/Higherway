/**
 * Comparing embeddings. Used by the "similar meaning" duplicate signal
 * (ARCHITECTURE.md §8), by category suggestion (§8), and by search ranking (§9).
 *
 * Pure by design (CLAUDE.md): no model, no network. Producing the vectors is
 * src/server/embed's job; this only compares them.
 */

export const DIMENSIONS = 384

/**
 * Cosine similarity, -1 to 1. For normalised vectors this is just the dot
 * product, and the model we use normalises its output — but the general form
 * is kept so a vector from anywhere else cannot silently give a wrong answer.
 */
export function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Cannot compare vectors of different sizes: ${a.length} and ${b.length}`)
  }
  if (a.length === 0) return 0

  let dot = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB)
  return magnitude === 0 ? 0 : dot / magnitude
}

/** Whether a vector is already unit length, within floating-point tolerance. */
export function isNormalised(v: readonly number[], tolerance = 1e-4): boolean {
  if (v.length === 0) return false
  let sum = 0
  for (const x of v) sum += x * x
  return Math.abs(Math.sqrt(sum) - 1) <= tolerance
}

/**
 * Guards the boundary between a model and the database. The schema declares
 * vector(384); a model returning anything else would be rejected by Postgres
 * with a far less helpful message than this one.
 */
export function assertDimensions(v: readonly number[], expected = DIMENSIONS): readonly number[] {
  if (v.length !== expected) {
    throw new Error(
      `Embedding has ${v.length} dimensions, but the schema expects ${expected}. ` +
        "Changing the model means changing src/db/schema/search.ts and re-embedding everything.",
    )
  }
  return v
}

/** The n nearest of a set, most similar first. Used for "related materials". */
export function nearest<T>(
  query: readonly number[],
  candidates: readonly { item: T; embedding: readonly number[] }[],
  n = 5,
): { item: T; score: number }[] {
  return candidates
    .map(({ item, embedding }) => ({ item, score: cosine(query, embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
}
