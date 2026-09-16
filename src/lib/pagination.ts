/**
 * Working out which page numbers to show.
 *
 * With 651 materials at 48 a page there are 14 pages, and a bare "previous /
 * next" makes a reader click twelve times to reach the end. Numbers with gaps
 * let someone jump, while keeping the control narrow enough for a phone.
 *
 *   page 1 of 14    [1] 2 3 … 14
 *   page 7 of 14    1 … 6 [7] 8 … 14
 *   page 14 of 14   1 … 12 13 [14]
 *
 * Pure by design (CLAUDE.md), so the awkward cases are testable without a
 * browser — and they are all edge cases at the ends of the range.
 */

export type PageItem = number | "gap"

/**
 * `window` is how many pages to show either side of the current one. The first
 * and last are always shown, because "go to the end" is a real intention.
 */
export function pageItems(current: number, total: number, window = 1): PageItem[] {
  if (total <= 1) return total === 1 ? [1] : []

  const page = Math.min(Math.max(1, current), total)
  const shown = new Set<number>([1, total])

  for (let i = page - window; i <= page + window; i++) {
    if (i >= 1 && i <= total) shown.add(i)
  }

  // A gap that hides a single page is worse than just showing it.
  const sorted = [...shown].sort((a, b) => a - b)
  const items: PageItem[] = []

  for (let i = 0; i < sorted.length; i++) {
    const value = sorted[i]
    const previous = sorted[i - 1]

    if (previous !== undefined) {
      if (value - previous === 2) items.push(previous + 1)
      else if (value - previous > 2) items.push("gap")
    }
    items.push(value)
  }

  return items
}

/** "Showing 49–96 of 651" — so a reader knows where they are in the whole. */
export function pageRange(page: number, pageSize: number, total: number) {
  if (total === 0) return { from: 0, to: 0, total }
  const from = (page - 1) * pageSize + 1
  return { from, to: Math.min(page * pageSize, total), total }
}
