/**
 * Placeholder. The real home page arrives in Phase 2, reading from Neon.
 * This exists to prove the design tokens and fonts resolve. See STATUS.md.
 */
export default function Home() {
  return (
    <main className="mx-auto max-w-[var(--measure)] px-[var(--gutter)] py-24">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-taupe">Higherway</p>
      <h1 className="mt-5 max-w-[14ch] text-[clamp(44px,7.4vw,96px)]">
        Wisdom for a more faithful life.
      </h1>
      <p className="mt-6 max-w-[52ch] text-[17px] leading-relaxed text-ink-2">
        The archive is being rebuilt. Every material stays free to read and free to download.
      </p>
      <p className="mt-10 text-sm text-ink-3">
        Phase 0 — scaffold. See <code>STATUS.md</code> for what comes next.
      </p>
    </main>
  )
}
