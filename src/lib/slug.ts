/**
 * Turning a title into a URL. A slug is the public address of a material
 * (/m/<slug>) and is stable once published, so this has to be predictable:
 * the same title always gives the same slug, and nothing else does.
 *
 * Pure by design (CLAUDE.md): no database, no network, no environment.
 * Uniqueness is the caller's job — see `uniqueSlug`.
 */

const MAX_LENGTH = 60

export function slugify(input: string): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .replace(/['''`]/g, "") // "God's" → "gods", not "god-s"
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_LENGTH)
    .replace(/-+$/g, "") // a trailing dash left by the cut

  return slug || "item"
}

/**
 * A slug not already taken. Two materials in this archive genuinely share a
 * title — "5 keys for successful building" appears three times — so collisions
 * are normal rather than exceptional, and numbering is how they coexist until
 * a human decides whether they are duplicates.
 */
export function uniqueSlug(input: string, taken: Set<string> | ReadonlySet<string>): string {
  const base = slugify(input)
  if (!taken.has(base)) return base

  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`
    if (!taken.has(candidate)) return candidate
  }
}
