import { count, eq, isNull, sql } from "drizzle-orm"
import type { Metadata } from "next"
import Link from "next/link"
import { db } from "../../db"
import { duplicatePairs, materialPages, materials } from "../../db/schema"
import { requireSession } from "../../lib/session"

/**
 * The admin overview: what needs a person's attention, and nothing else.
 *
 * Deliberately not a dashboard of charts. The useful question when someone
 * opens this is "what is waiting for me", so every tile is a queue with a
 * number and a way in.
 */
export const metadata: Metadata = {
  title: "Overview",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

export default async function AdminHome({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>
}) {
  const [session, { denied }] = await Promise.all([requireSession(), searchParams])

  const [[published], [uncategorised], [pendingDupes], [needOcr]] = await Promise.all([
    db.select({ n: count() }).from(materials).where(eq(materials.status, "published")),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(materials)
      .where(
        sql`${materials.status} = 'published' and not exists (
          select 1 from material_categories mc where mc.material_id = ${materials.id}
        )`,
      ),
    db.select({ n: count() }).from(duplicatePairs).where(eq(duplicatePairs.status, "pending")),
    db.select({ n: count() }).from(materialPages).where(isNull(materialPages.text)),
  ])

  const queues = [
    {
      label: "Uncategorised",
      value: uncategorised?.n ?? 0,
      href: "/admin/materials?filter=uncategorised",
      note: "Materials with no topic yet. They still appear in the library.",
    },
    {
      label: "Possible duplicates",
      value: pendingDupes?.n ?? 0,
      href: "/admin/duplicates",
      note: "Raised for a person to decide. Nothing is ever deleted automatically.",
    },
    {
      label: "Pages awaiting text",
      value: needOcr?.n ?? 0,
      href: "/admin/materials?filter=needs-ocr",
      note: "Run pnpm ocr:local on a Mac to read them.",
    },
  ]

  return (
    <>
      {denied === "1" ? (
        <p
          role="alert"
          className="mb-8 rounded-lg border-l-2 border-gold bg-paper-2 px-4 py-3 text-[13.5px] text-ink-2"
        >
          That page needs a higher role than yours.
        </p>
      ) : null}

      <p className="text-[11px] font-medium uppercase tracking-[.2em] text-taupe">Overview</p>
      <h1 className="mt-3 font-serif text-[clamp(30px,4vw,44px)] font-light tracking-[-0.02em]">
        {greeting()}, {session.user.name.split(" ")[0]}
      </h1>
      <p className="mt-3 max-w-[52ch] text-[15px] leading-relaxed text-ink-2">
        {published?.n ?? 0} materials are published and readable. Below is what is waiting for
        someone to look at.
      </p>

      <div className="mt-10 grid gap-px border-y border-line-soft bg-line-soft sm:grid-cols-3">
        {queues.map((queue) => (
          <Link
            key={queue.label}
            href={queue.href}
            className="group flex flex-col bg-paper p-6 transition-colors hover:bg-paper-2"
          >
            <span className="font-serif text-[clamp(32px,4vw,44px)] font-light leading-none">
              {queue.value}
            </span>
            <span className="mt-3 text-[13px] font-medium uppercase tracking-[.16em] text-taupe">
              {queue.label}
            </span>
            <span className="mt-2.5 text-[13px] leading-relaxed text-ink-3">{queue.note}</span>
          </Link>
        ))}
      </div>
    </>
  )
}

function greeting() {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning"
  if (hour < 18) return "Good afternoon"
  return "Good evening"
}
