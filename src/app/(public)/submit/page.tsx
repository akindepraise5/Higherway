import type { Metadata } from "next"
import Link from "next/link"
import { SubmitForm } from "../../../components/public/submit-form"
import { env, hasSubmissions } from "../../../lib/env"

/**
 * Sending something in.
 *
 * **The page does not exist when Turnstile is not configured** — it is not a
 * disabled form, it is a 404 plus an explanation. Every other switched-off
 * feature here degrades to a worse-but-working state; this one cannot, because
 * the degraded state is an unauthenticated write to the bucket.
 *
 * Deliberately short. The owner's constraint, recorded word for word: anyone who
 * arrives wanting to contribute is doing us a favour, and every field is a
 * chance for them to decide it is not worth the time. Ask for the file and
 * almost nothing else — a title we can correct later beats a form nobody
 * finishes.
 */
export const metadata: Metadata = {
  title: "Send us something",
  description:
    "Have a copy of a Higher Way material that is not here? Send it in — we will read it, check it against the archive, and add it.",
}

/**
 * Rendered per request, not baked at build. Whether submissions are open is an
 * environment question, and a statically prerendered page would keep answering
 * with whatever was true when it was built.
 */
export const dynamic = "force-dynamic"

export default function SubmitPage() {
  if (!hasSubmissions) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-20">
        <h1 className="font-serif text-[clamp(30px,4vw,44px)] font-light tracking-[-0.02em]">
          Not open just yet
        </h1>
        <p className="mt-4 max-w-[54ch] text-[16px] leading-relaxed text-ink-2">
          We are not taking submissions through the site at the moment. Everything already in the
          archive is free to read and download.
        </p>
        <Link
          href="/library"
          className="mt-8 inline-block rounded-full bg-ink px-5 py-3 text-[14px] font-medium text-paper-2 transition-colors hover:bg-forest-2"
        >
          Browse the library
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <p className="text-[11px] font-medium uppercase tracking-[.2em] text-taupe">Contribute</p>
      <h1 className="mt-3 font-serif text-[clamp(30px,4vw,44px)] font-light leading-tight tracking-[-0.02em]">
        Have something that is not here?
      </h1>
      <p className="mt-4 max-w-[56ch] text-[16px] leading-relaxed text-ink-2">
        If you have a copy of a Higher Way material the archive is missing, send it in. A photograph
        of the pages is fine — we read scans and photographs as well as proper files, and we will
        tidy up the details.
      </p>
      <p className="mt-3 max-w-[56ch] text-[14.5px] leading-relaxed text-taupe">
        Nothing you send appears in the library until someone here has looked at it. If we already
        have it, it is recognised and nothing is duplicated.
      </p>

      <SubmitForm siteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""} />
    </div>
  )
}
