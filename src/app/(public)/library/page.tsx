import type { Metadata } from "next"
import Link from "next/link"
import { MaterialCard } from "../../../components/public/material-card"
import { Pagination } from "../../../components/public/pagination"
import { asSort, libraryMaterials, PAGE_SIZE, type Sort } from "../../../server/materials/library"
import { authorList, topicList } from "../../../server/materials/queries"

/**
 * The library. Every filter is a link or a plain GET form, so search, topic
 * filtering, sorting and paging all work with JavaScript switched off — and
 * every state has a real URL that can be shared or bookmarked.
 */

export const metadata: Metadata = {
  title: "Library",
  description:
    "Every material published by Higherway, filed by topic. Free to read and free to download.",
}

export const revalidate = 300

type Search = { q?: string; topic?: string; author?: string; sort?: string; page?: string }

const href = (params: Search) => {
  const qs = new URLSearchParams()
  if (params.q) qs.set("q", params.q)
  if (params.topic && params.topic !== "all") qs.set("topic", params.topic)
  if (params.author) qs.set("author", params.author)
  // "recent" is the browsing default and "relevance" the searching one, so
  // neither needs to appear in a URL — a link that carries its own default is a
  // link that stops meaning the same thing when the default changes.
  if (params.sort && params.sort !== "recent" && params.sort !== "relevance") {
    qs.set("sort", params.sort)
  }
  if (params.page && params.page !== "1") qs.set("page", params.page)
  const s = qs.toString()
  return s ? `/library?${s}` : "/library"
}

const SORT_LABELS: Record<Sort, string> = {
  relevance: "Best match",
  recent: "Recently added",
  oldest: "Oldest first",
  title: "A–Z",
  ztitle: "Z–A",
}

export default async function LibraryPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams
  const q = params.q?.trim() ?? ""
  const topic = params.topic ?? "all"
  const author = params.author?.trim() ?? ""
  // "Best match" is only meaningful against a query, and it is the right
  // default when there is one: a searcher wants the best answer, not the newest.
  const sort = asSort(params.sort, q.length > 0)
  const page = Number(params.page) || 1

  const [result, topics, authors] = await Promise.all([
    libraryMaterials({ q, topic, author, sort, page }),
    topicList(),
    authorList(24),
  ])

  return (
    <>
      <div className="mx-auto max-w-(--measure) px-(--gutter) pb-[clamp(24px,3vw,36px)] pt-[clamp(34px,4.5vw,64px)]">
        <p className="text-[11px] font-medium uppercase tracking-[.2em] text-taupe">Library</p>
        <h1 className="mt-3.5 max-w-[16ch] text-[clamp(34px,5vw,62px)]">
          Explore the Higherway library
        </h1>
        <p className="mt-4 max-w-[52ch] text-[clamp(15.5px,1.15vw,17.5px)] leading-relaxed text-ink-2">
          Every material published by Higherway, filed by topic. Pick a shelf or search for a
          subject, then read it here or take the file with you.
        </p>

        {/* A plain GET form: no JavaScript, and the result has a shareable URL. */}
        <form action="/library" method="get" className="relative mt-[clamp(26px,3vw,38px)] flex">
          {topic !== "all" ? <input type="hidden" name="topic" value={topic} /> : null}
          {/* Carried only when it is not a default, matching `href` above: a
              form that posts back the default turns it into an explicit choice
              that then survives a change of default. */}
          {sort !== "recent" && sort !== "relevance" ? (
            <input type="hidden" name="sort" value={sort} />
          ) : null}
          <label htmlFor="q" className="sr-only">
            Search materials
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Search materials, topics or authors"
            className="w-full rounded-full border border-line-soft bg-paper-2 py-4 pl-6 pr-28 text-[15px] transition-colors focus:border-ink focus:bg-white focus:outline-none"
          />
          <button
            type="submit"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-paper-2 transition-colors hover:bg-forest-2"
          >
            Search
          </button>
        </form>

        <div className="mt-5 flex gap-2.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <Link
            href={href({ q, author, sort })}
            className={`flex-none rounded-full border px-4 py-2 text-[13.5px] whitespace-nowrap transition-colors ${
              topic === "all"
                ? "border-ink bg-ink text-paper-2"
                : "border-line text-ink-2 hover:border-ink"
            }`}
          >
            All
          </Link>
          {topics.map((t) => (
            <Link
              key={t.slug}
              href={href({ q, topic: t.slug, author, sort })}
              className={`flex-none rounded-full border px-4 py-2 text-[13.5px] whitespace-nowrap transition-colors ${
                topic === t.slug
                  ? "border-ink bg-ink text-paper-2"
                  : "border-line text-ink-2 hover:border-ink"
              }`}
            >
              {t.name} <span className="text-[11px] opacity-60">{t.count}</span>
            </Link>
          ))}
        </div>

        {/* Only the credited few, not a directory: most of the archive is
            unattributed, so an author row of mostly-nothing would be noise.
            Clicking the active author clears it, so the row is its own escape. */}
        {authors.length > 0 ? (
          <div className="mt-2.5 flex items-center gap-2.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <span className="flex-none text-[11px] font-medium uppercase tracking-[.16em] text-taupe">
              Authors
            </span>
            {authors.map((a) => (
              <Link
                key={a.name}
                href={href({ q, topic, author: a.name === author ? undefined : a.name, sort })}
                className={`flex-none rounded-full border px-4 py-2 text-[13.5px] whitespace-nowrap transition-colors ${
                  author === a.name
                    ? "border-ink bg-ink text-paper-2"
                    : "border-line text-ink-2 hover:border-ink"
                }`}
              >
                {a.name} <span className="text-[11px] opacity-60">{a.count}</span>
              </Link>
            ))}
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-b border-line-soft pb-4">
          <p className="text-[13px] text-taupe">
            <b className="font-medium text-ink">{result.total}</b>{" "}
            {result.total === 1 ? "material" : "materials"}
            {topic !== "all" || q || author ? " in " : " in the collection"}
            {topic !== "all" ? topics.find((t) => t.slug === topic)?.name : null}
            {topic !== "all" && (q || author) ? " · " : null}
            {author ? `by ${author}` : null}
            {author && q ? " · " : null}
            {q ? `“${q}”` : null}
          </p>

          <div className="flex flex-wrap gap-2">
            {/* "Best match" is offered only while searching — there is nothing
                for an unsearched library to be relevant to. */}
            {(Object.keys(SORT_LABELS) as Sort[])
              .filter((option) => option !== "relevance" || q.length > 0)
              .map((option) => (
                <Link
                  key={option}
                  href={href({ q, topic, author, sort: option })}
                  className={`rounded-full border px-3.5 py-1.5 text-[12.5px] transition-colors ${
                    sort === option
                      ? "border-ink bg-ink text-paper-2"
                      : "border-line text-ink-3 hover:border-ink"
                  }`}
                >
                  {SORT_LABELS[option]}
                </Link>
              ))}
          </div>
        </div>
      </div>

      <section className="mx-auto max-w-(--measure) px-(--gutter) pb-[clamp(56px,7vw,104px)]">
        {result.items.length === 0 ? (
          <div className="py-[clamp(56px,8vw,104px)] text-center">
            <h2 className="text-[clamp(24px,3vw,34px)]">Nothing matches that yet</h2>
            <p className="mt-3 text-ink-3">
              Try a different word, or clear the filters to see the whole collection.
            </p>
            <Link
              href="/library"
              className="mt-6 inline-flex items-center gap-2.5 rounded-full border border-ink bg-ink px-6 py-3.5 text-sm font-medium text-paper-2"
            >
              Show all materials
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4">
              {result.items.map((material) => (
                <MaterialCard
                  key={material.id}
                  material={material}
                  shelf={topic !== "all" ? topics.find((t) => t.slug === topic)?.name : undefined}
                  matchedPage={material.matchedPage}
                />
              ))}
            </div>

            <Pagination
              page={page}
              pages={result.pages}
              total={result.total}
              pageSize={PAGE_SIZE}
              hrefFor={(p) => href({ q, topic, author, sort, page: String(p) })}
            />
          </>
        )}
      </section>
    </>
  )
}
