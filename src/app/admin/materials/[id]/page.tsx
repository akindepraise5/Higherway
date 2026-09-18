import { eq, sql } from "drizzle-orm"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { CategoryPicker } from "../../../../components/admin/category-picker"
import { MaterialEditor } from "../../../../components/admin/material-editor"
import { PageReader } from "../../../../components/admin/page-reader"
import { TopicSuggestions } from "../../../../components/admin/topic-suggestions"
import { Cover } from "../../../../components/public/cover"
import { db } from "../../../../db"
import {
  categories,
  materialCategories,
  materialPages,
  materials,
  user,
} from "../../../../db/schema"
import { lookFor } from "../../../../lib/art/palette"
import { pageKey, publicUrl } from "../../../../lib/r2/keys"
import { requireSession } from "../../../../lib/session"
import { USABLE_THRESHOLD } from "../../../../lib/text/quality"
import { exact, timeAgo, who } from "../../../../lib/when"
import { describeChange } from "../../../../server/activity"
import { adminAuthors } from "../../../../server/materials/admin"
import { contributors, materialHistory, whyArchived } from "../../../../server/materials/history"
import { suggestTopics } from "../../../../server/suggest/topics"

/**
 * One material, as an admin sees it.
 *
 * Shows what the public page cannot: its status, where the file came from, how
 * its text was read and how well, and every page with its own quality score —
 * so a bad OCR read is visible at the page that caused it rather than as a
 * single number for the whole document.
 */
export const metadata: Metadata = {
  title: "Material",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

const fmtBytes = (n: number | null) =>
  n === null
    ? "—"
    : n > 1024 * 1024
      ? `${(n / 1024 / 1024).toFixed(1)} MB`
      : `${Math.round(n / 1024)} KB`

export default async function AdminMaterialPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession()
  // Correcting details is everyone's work; publishing and archiving are not.
  // The services enforce this too — this only decides what is worth showing.
  const role = (session.user as { role?: string }).role ?? "editor"
  const canModerate = role === "admin" || role === "owner"

  const { id } = await params

  const [material] = await db.select().from(materials).where(eq(materials.id, id)).limit(1)
  if (!material) notFound()

  const [topics, pages, allTopics, people, history, unfiledNext, authors] = await Promise.all([
    db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        // Who filed it here, and when. Both already sit on the join row.
        byName: user.name,
        byEmail: user.email,
        at: materialCategories.createdAt,
      })
      .from(materialCategories)
      .innerJoin(categories, eq(categories.id, materialCategories.categoryId))
      .leftJoin(user, eq(user.id, materialCategories.assignedBy))
      .where(eq(materialCategories.materialId, id))
      .orderBy(materialCategories.ordinal),
    db
      .select({
        pageNumber: materialPages.pageNumber,
        ocrEngine: materialPages.ocrEngine,
        ocrQuality: materialPages.ocrQuality,
        text: materialPages.text,
        width: materialPages.width,
        height: materialPages.height,
      })
      .from(materialPages)
      .where(eq(materialPages.materialId, id))
      .orderBy(materialPages.pageNumber),
    db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .orderBy(categories.name),
    contributors(id),
    materialHistory(id, 12),
    // 367 materials have no topic. Filing them should not mean returning to the
    // list after every one, so the next unfiled material is always one click on.
    db
      .select({ id: materials.id, title: materials.title })
      .from(materials)
      .where(
        sql`${materials.id} <> ${id} and ${materials.archivedAt} is null and not exists (
          select 1 from material_categories mc where mc.material_id = ${materials.id}
        )`,
      )
      .orderBy(materials.createdAt)
      .limit(1),
    adminAuthors(),
  ])

  /**
   * Only for an unfiled material, and only after the topics are known — so it
   * is a second round trip rather than part of the batch above. That is the
   * right trade: it keeps a nearest-neighbour query off every page load of the
   * 252 materials that are already filed, which is most of them.
   */
  const suggestions = topics.length === 0 ? await suggestTopics(id) : []

  /**
   * Why it was taken out, and what it duplicates. Only fetched when one of them
   * can be true — a published material that duplicates nothing has neither, and
   * that is most of them.
   */
  const removed =
    material.archivedAt !== null || material.duplicateOfId !== null ? await whyArchived(id) : null

  const base = process.env.R2_PUBLIC_BASE_URL ?? ""
  const look = lookFor(material.slug, topics[0]?.slug ?? "uncategorised")
  const withText = pages.filter((p) => p.text).length
  /**
   * Read, but badly. Different from having no text: a recogniser cannot help
   * here, it has already run — this needs a person to look at the image.
   */
  const readBadly = pages.filter(
    (p) => p.ocrQuality !== null && p.ocrQuality < USABLE_THRESHOLD,
  ).length

  const facts: [string, React.ReactNode][] = [
    ["Status", material.status],
    ["Source", material.source.replace(/_/g, " ")],
    ["Pages", material.pageCount ?? "—"],
    ["Size", fmtBytes(material.byteSize)],
    ["Text", material.ocrEngine === "none" ? "awaiting" : material.ocrEngine.replace(/_/g, " ")],
    ["Pages with text", `${withText} of ${pages.length}`],
    ...(readBadly > 0
      ? ([
          [
            "Read badly",
            <span key="badly" className="text-[#8c2f22]">
              {readBadly} {readBadly === 1 ? "page" : "pages"} — worth looking at
            </span>,
          ],
        ] as [string, React.ReactNode][])
      : []),
    ["Public text", material.textPublic ? "shown" : "hidden"],
    ["Added", material.createdAt.toISOString().slice(0, 10)],
    // Worth keeping — it is what the v1 sheet called the file, so it traces a
    // material back to where it came from. It just does not belong under the
    // title, where it reads like a correction rather than provenance.
    ...(material.titleOriginal && material.titleOriginal !== material.title
      ? ([
          [
            "Originally",
            <span key="originally" className="font-mono text-[12px]">
              {material.titleOriginal}
            </span>,
          ],
        ] as [string, React.ReactNode][])
      : []),
  ]

  return (
    <>
      <Link
        href="/admin/materials"
        className="inline-flex items-center gap-2 text-[13px] text-ink-3 transition-colors hover:text-ink"
      >
        ← All materials
      </Link>

      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,260px)_1fr]">
        {/* Sticky, so filing can be done while reading. The pages scroll past
            on the right and the topic picker stays put — deciding where a
            material belongs usually means looking at it, not at its title. */}
        <div className="lg:sticky lg:top-24">
          <Cover
            variant="cover"
            seed={material.slug}
            look={look}
            title={material.title}
            topic={topics[0]?.name}
            footer={material.author ?? undefined}
          />
          {material.status === "published" ? (
            <Link
              href={`/m/${material.slug}`}
              className="mt-4 block rounded-full border border-line px-4 py-2.5 text-center text-[13.5px] transition-colors hover:border-ink"
            >
              View public page
            </Link>
          ) : null}

          <div className="mt-6 border-t border-line-soft pt-5">
            <h2 className="text-[11px] font-medium uppercase tracking-[.2em] text-taupe">
              Filed under
            </h2>
            <div className="mt-3">
              <CategoryPicker
                materialId={id}
                assigned={topics}
                all={allTopics}
                mayCreate={role === "owner"}
              />
            </div>

            {/* Only when it is unfiled. 314 published materials are, which is
                where the work is; on a material already on a shelf, a panel
                proposing more shelves is noise. */}
            {topics.length === 0 ? (
              <TopicSuggestions materialId={id} suggestions={suggestions} />
            ) : null}

            {unfiledNext[0] ? (
              <Link
                href={`/admin/materials/${unfiledNext[0].id}`}
                className="mt-4 flex items-center justify-between gap-2 rounded-[4px] bg-paper-2 px-3 py-2.5 text-[12.5px] text-ink-3 transition-colors hover:bg-paper-3 hover:text-ink"
              >
                <span className="min-w-0">
                  <span className="block text-[10.5px] font-medium uppercase tracking-[.16em] text-taupe">
                    Next unfiled
                  </span>
                  <span className="mt-0.5 block truncate">{unfiledNext[0].title}</span>
                </span>
                <span aria-hidden="true">→</span>
              </Link>
            ) : null}
          </div>
        </div>

        <div>
          {/* Both of these have always been recorded and neither was shown
              anywhere: the reason is collected in the archive dialog precisely
              so it exists, and went straight into the trail and out of sight. */}
          {removed && (removed.reason || removed.duplicateOf) ? (
            <div className="mb-5 rounded-[4px] border-l-2 border-[#8c2f22] bg-paper-2 px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-[.16em] text-[#8c2f22]">
                {material.archivedAt ? "Taken out of the library" : "Refused"}
              </p>
              {removed.reason ? (
                <p className="mt-1.5 text-[14px] leading-relaxed text-ink-2">{removed.reason}</p>
              ) : null}
              {removed.duplicateOf ? (
                <p className="mt-1.5 text-[13px] text-ink-3">
                  {removed.duplicateOf.live ? "Kept instead: " : "Against: "}
                  <Link
                    href={`/admin/materials/${removed.duplicateOf.id}`}
                    className="border-b border-line hover:border-ink"
                  >
                    {removed.duplicateOf.title}
                  </Link>
                  {removed.duplicateOf.live ? null : " — which is itself archived"}
                </p>
              ) : null}
              {removed.by && removed.at ? (
                <p className="mt-1.5 text-[11.5px] text-taupe">
                  {who(removed.by.name, removed.by.email)} · {timeAgo(removed.at)}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="flex items-start gap-3">
            <h1 className="font-serif text-[clamp(26px,3.2vw,36px)] font-light leading-tight tracking-[-0.02em]">
              {material.title}
            </h1>
            <MaterialEditor
              materialId={id}
              authors={authors}
              title={material.title}
              author={material.author}
              summary={material.summary}
              status={material.status}
              archived={material.archivedAt !== null}
              hasFile={material.r2KeyPdf !== null}
              textPublic={material.textPublic}
              canModerate={canModerate}
            />
          </div>

          <dl className="mt-8 grid grid-cols-2 gap-px border border-line-soft bg-line-soft sm:grid-cols-4">
            {facts.map(([label, value]) => (
              <div key={label} className="bg-paper p-3.5">
                <dt className="text-[10.5px] font-medium uppercase tracking-[.14em] text-taupe">
                  {label}
                </dt>
                <dd className="mt-1.5 text-[14px] text-ink">{value}</dd>
              </div>
            ))}
          </dl>

          <h2 className="mt-10 text-[11px] font-medium uppercase tracking-[.2em] text-taupe">
            Pages
          </h2>
          <PageReader
            title={material.title}
            pages={pages.map((p) => ({
              pageNumber: p.pageNumber,
              url: publicUrl(pageKey(id, p.pageNumber), base),
              width: p.width,
              height: p.height,
              ocrQuality: p.ocrQuality,
            }))}
          />

          {pages.length === 0 ? (
            <p className="mt-4 text-[13.5px] text-ink-3">
              This material has not been processed yet.
            </p>
          ) : null}

          <h2 className="mt-12 text-[11px] font-medium uppercase tracking-[.2em] text-taupe">
            History
          </h2>

          {people.length > 0 ? (
            <p className="mt-3 text-[13px] text-ink-3">
              Worked on by{" "}
              {people.map((p, i) => (
                <span key={p.email ?? i}>
                  {i > 0 ? ", " : ""}
                  <span className="text-ink-2">{who(p.name, p.email)}</span>
                  <span className="text-taupe"> ({p.changes})</span>
                </span>
              ))}
            </p>
          ) : null}

          {history.length === 0 ? (
            <p className="mt-3 text-[13.5px] text-ink-3">
              Nothing has been changed since it was imported.
            </p>
          ) : (
            <ol className="mt-4 border-l border-line-soft">
              {history.map((h) => (
                <li key={h.id} className="relative py-2.5 pl-5 text-[13.5px]">
                  <span className="absolute left-0 top-[18px] h-px w-3 bg-line-soft" />
                  <span className="text-ink-2">{describeChange(h.action, h.before, h.after)}</span>
                  <span className="text-taupe"> — {who(h.byName, null)}</span>
                  <time
                    dateTime={h.at.toISOString()}
                    title={exact(h.at)}
                    className="ml-1.5 text-taupe"
                  >
                    · {timeAgo(h.at)}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </>
  )
}
