import type { Metadata } from "next"
import Link from "next/link"
import { NewMaterialForm } from "../../../../components/admin/new-material-form"
import { hasJobs } from "../../../../lib/env"
import { requireSession } from "../../../../lib/session"

/**
 * Adding a material by hand.
 *
 * Until now the archive could only grow through `scripts/backfill.ts`, which
 * reads the v1 spreadsheet — fine for the 651 that already existed, useless for
 * the next one.
 *
 * Editor-level: adding is the same daily work as filing, and nothing added here
 * reaches the public library until someone publishes it.
 */
export const metadata: Metadata = {
  title: "Add a material",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function NewMaterialPage() {
  await requireSession()

  return (
    <>
      <Link
        href="/admin/materials"
        className="inline-flex items-center gap-2 text-[13px] text-ink-3 transition-colors hover:text-ink"
      >
        ← All materials
      </Link>

      <p className="mt-6 text-[11px] font-medium uppercase tracking-[.2em] text-taupe">
        Add a material
      </p>
      <h1 className="mt-3 font-serif text-[clamp(28px,3.4vw,38px)] font-light tracking-[-0.02em]">
        Put something new in the archive
      </h1>
      <p className="mt-3 max-w-[54ch] text-[15px] leading-relaxed text-ink-2">
        Upload a PDF, or paste a link and the server will fetch it. Either way the pages are
        rendered and the text read before it appears.
      </p>

      <NewMaterialForm jobsConfigured={hasJobs} />
    </>
  )
}
