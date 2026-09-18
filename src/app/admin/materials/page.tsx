import { Plus } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { BulkSelect, RowSelect, SelectAll } from "../../../components/admin/bulk-select"
import { InFlight } from "../../../components/admin/in-flight"
import { stickyCell, stickyHead, TableScroll } from "../../../components/admin/table-scroll"
import { Pagination } from "../../../components/public/pagination"
import { requireSession } from "../../../lib/session"
import { exact, timeAgo, who } from "../../../lib/when"
import { describeChange } from "../../../server/activity"
import { adminCategories } from "../../../server/categories/queries"
import {
  ADMIN_PAGE_SIZE,
  adminCounts,
  adminMaterials,
  asAdminSort,
  asFilter,
  FILTERS,
  inFlightCount,
} from "../../../server/materials/admin"
import { lastChanges } from "../../../server/materials/history"

/**
 * The materials list: a working surface, not a showcase.
 *
 * Rows are dense and scannable, and every filter is a link so the state of the
 * list is in the URL — an admin can send a colleague "the 367 uncategorised
 * ones" rather than describing how to get there.
 */
export const metadata: Metadata = {
  title: "Materials",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

type Search = { filter?: string; q?: string; sort?: string; page?: string }

const href = (params: Search) => {
  const qs = new URLSearchParams()
  if (params.filter && params.filter !== "all") qs.set("filter", params.filter)
  if (params.q) qs.set("q", params.q)
  if (params.sort && params.sort !== "recent") qs.set("sort", params.sort)
  if (params.page && params.page !== "1") qs.set("page", params.page)
  const s = qs.toString()
  return s ? `/admin/materials?${s}` : "/admin/materials"
}

const STATUS_STYLE: Record<string, string> = {
  published: "bg-forest/10 text-forest",
  staged: "bg-paper-3 text-taupe",
  processing: "bg-paper-3 text-taupe",
  review: "bg-gold-wash text-gold",
  archived: "bg-paper-3 text-ink-3",
  rejected: "bg-paper-3 text-ink-3",
}

export default async function AdminMaterialsPage({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  const session = await requireSession()
  const role = (session.user as { role?: string }).role ?? "editor"
  // Filing is every editor's daily work; publishing and archiving decide what
  // the archive says in public, so they stay Admin — in the bar exactly as they
  // are on a single material.
  const canModerate = role === "admin" || role === "owner"
  const params = await searchParams

  const filter = asFilter(params.filter)
  const sort = asAdminSort(params.sort)
  const q = params.q?.trim() ?? ""
  const page = Number(params.page) || 1

  const [result, counts, topics, inFlight] = await Promise.all([
    adminMaterials({ filter, q, sort, page }),
    adminCounts(),
    adminCategories(),
    inFlightCount(),
  ])

  // One query for the whole page, after the rows are known.
  const changes = await lastChanges(result.items.map((m) => m.id))

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[.2em] text-taupe">Materials</p>
          <h1 className="mt-3 font-serif text-[clamp(28px,3.4vw,38px)] font-light tracking-[-0.02em]">
            {result.total} {result.total === 1 ? "material" : "materials"}
            {filter !== "all" ? (
              <span className="text-taupe">
                {" "}
                · {FILTERS.find((f) => f.value === filter)?.label}
              </span>
            ) : null}
          </h1>
        </div>

        <form action="/admin/materials" method="get" className="flex gap-2">
          {filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
          <label htmlFor="q" className="sr-only">
            Search materials
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Search titles or authors"
            className="w-56 rounded-full border border-line bg-paper-2 px-4 py-2.5 text-[14px] outline-none transition-colors focus:border-ink"
          />
          <button
            type="submit"
            className="rounded-full border border-line px-4 py-2.5 text-[13.5px] transition-colors hover:border-ink"
          >
            Search
          </button>
        </form>

        {/* A link, not a drawer. Adding is a queue of up to sixty files with
            uploads in flight; that belongs on a page with an address, not in a
            modal that cannot be dismissed while it works. Editing is still a
            drawer, because editing really is one material at a time. */}
        <Link
          href="/admin/materials/new"
          className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[13.5px] font-medium text-paper-2 transition-colors hover:bg-forest-2"
        >
          <Plus size={15} />
          Add materials
        </Link>
      </div>

      {/* Only while something is actually in flight; it refreshes the page
          itself and stops on its own. */}
      <InFlight count={inFlight} />

      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={href({ filter: f.value, q })}
            className={`rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${
              filter === f.value
                ? "border-ink bg-ink text-paper-2"
                : "border-line text-ink-2 hover:border-ink"
            }`}
          >
            {f.label} <span className="opacity-60">{counts[f.value]}</span>
          </Link>
        ))}
      </div>

      {result.items.length === 0 ? (
        <p className="mt-16 text-center text-ink-3">
          Nothing here.{" "}
          {q ? (
            <Link href={href({ filter })} className="border-b border-line hover:border-ink">
              Clear the search
            </Link>
          ) : (
            "This queue is empty."
          )}
        </p>
      ) : (
        <BulkSelect ids={result.items.map((m) => m.id)} topics={topics} canModerate={canModerate}>
          <TableScroll minWidth="62rem" className="mt-4">
            <thead>
              <tr className="border-b border-line-soft bg-paper-2 text-[11px] font-medium uppercase tracking-[.14em] text-taupe">
                <th className="w-10 px-4 py-3 font-medium">
                  <SelectAll ids={result.items.map((m) => m.id)} />
                  <span className="sr-only">Select</span>
                </th>
                <th className={`px-4 py-3 font-medium ${stickyHead}`}>Material</th>
                <th className="px-4 py-3 font-medium">Topics</th>
                <th className="px-4 py-3 font-medium">Pages</th>
                <th className="px-4 py-3 font-medium">Text</th>
                <th className="px-4 py-3 font-medium">Last change</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((m) => (
                <tr
                  key={m.id}
                  className="group border-b border-line-soft last:border-0 hover:bg-paper-2"
                >
                  <td className="px-4 py-3 align-top">
                    <RowSelect id={m.id} title={m.title} />
                  </td>
                  <td className={`px-4 py-3 ${stickyCell}`}>
                    <Link
                      href={`/admin/materials/${m.id}`}
                      className="font-serif text-[16px] leading-snug hover:text-gold"
                    >
                      {m.title}
                    </Link>
                    {m.author ? (
                      <span className="mt-0.5 block text-[12.5px] text-taupe">{m.author}</span>
                    ) : null}
                  </td>

                  <td className="px-4 py-3">
                    {m.topics.length === 0 ? (
                      <span className="text-[12.5px] text-gold">Uncategorised</span>
                    ) : (
                      <span className="text-[12.5px] text-ink-3">
                        {m.topics.map((t) => t.name).join(", ")}
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3 text-[13px] text-ink-3">{m.pageCount ?? "—"}</td>

                  <td className="px-4 py-3">
                    {m.ocrEngine === "none" ? (
                      <span className="text-[12.5px] text-taupe">awaiting</span>
                    ) : (
                      <span className="text-[12.5px] text-ink-3">
                        {m.ocrEngine === "text_layer" ? "embedded" : m.ocrEngine}
                        {m.ocrQuality !== null ? ` · ${Math.round(m.ocrQuality * 100)}%` : ""}
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {(() => {
                      const c = changes.get(m.id)
                      if (!c) return <span className="text-[12.5px] text-taupe">—</span>
                      return (
                        <span className="text-[12.5px] text-ink-3" title={exact(c.at)}>
                          {timeAgo(c.at)}
                          <span className="block text-taupe">
                            {describeChange(c.action, c.before, c.after)} ·{" "}
                            {who(c.byName, c.byEmail)}
                          </span>
                        </span>
                      )
                    })()}
                  </td>

                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[.1em] ${
                        STATUS_STYLE[m.status] ?? "bg-paper-3 text-ink-3"
                      }`}
                    >
                      {m.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableScroll>
        </BulkSelect>
      )}

      <Pagination
        page={result.page}
        pages={result.pages}
        total={result.total}
        pageSize={ADMIN_PAGE_SIZE}
        hrefFor={(p) => href({ filter, q, sort, page: String(p) })}
      />
    </>
  )
}
