/**
 * Deterministic randomness for the generated covers.
 *
 * Nothing on this site is a photograph. Every cover is drawn from the material's
 * own identity, which means the same material must produce the same cover for
 * ever — across reloads, across servers, across a rebuild two years from now.
 * A cover that drifts is a cover people stop recognising.
 *
 * Pure by design (CLAUDE.md): no environment, no clock, no Math.random.
 */

/** FNV-1a. Small, fast, and stable — the same string always gives the same number. */
export function hash(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * xorshift32. Seeded, so a cover's composition is fixed by its seed rather
 * than by when it happened to be drawn.
 */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 7
  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return ((s >>> 0) % 100000) / 100000
  }
}

/** Pick one item from a list, by seed. */
export function pick<T>(items: readonly T[], seed: number): T {
  return items[seed % items.length]
}

/**
 * A short, stable id for SVG gradient definitions. Two covers on one page must
 * not share a gradient id, or the second silently adopts the first's colours —
 * which is exactly what happens on a library grid of 48 cards.
 */
export function uid(seed: string): string {
  return `a${hash(seed).toString(36)}`
}
