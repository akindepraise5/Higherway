import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { MaterialCard } from "../../../../components/public/material-card"
import { Pagination } from "../../../../components/public/pagination"
import { libraryMaterials, PAGE_SIZE, topicBySlug } from "../../../../server/materials/library"
import { topicList } from "../../../../server/materials/queries"

/**
 * A topic's own page. This exists for search engines as much as for readers:
 * "materials about prayer" is the sort of thing people type, and a landing
 * page answers it far better than a filtered library URL. ARCHITECTURE.md §9.
 */

export const revalidate = 300

export async function generateStaticParams() {
  const topics = await topicList()
  return topics.map((topic) => ({ slug: topic.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const topic = await topicBySlug(slug)
  if (!topic) return { title: "Topic not found" }

  return {
    title: topic.name,
    description:
      topic.blurb ??
      `Every Higherway material filed under ${topic.name}. Free to read and download.`,
    alternates: { canonical: `/topics/${topic.slug}` },
  }
}

export default async function TopicPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string }>
}) {
  const [{ slug }, { page: pageParam }] = await Promise.all([params, searchParams])
  const topic = await topicBySlug(slug)
  if (!topic) notFound()

  const page = Number(pageParam) || 1
  const result = await libraryMaterials({ topic: slug, page })

  return (
    <>
      <div className="mx-auto max-w-(--measure) px-(--gutter) pb-[clamp(24px,3vw,36px)] pt-[clamp(34px,4.5vw,64px)]">
        <Link
          href="/library"
          className="inline-flex items-center gap-2 text-[13px] text-ink-3 transition-colors hover:text-ink"
        >
          ← The whole library
        </Link>

        <p className="mt-6 text-[11px] font-medium uppercase tracking-[.2em] text-taupe">Topic</p>
        <h1 className="mt-3 text-[clamp(34px,5vw,62px)]">{topic.name}</h1>
        {topic.blurb ? (
          <p className="mt-4 max-w-[52ch] text-[clamp(15.5px,1.15vw,17.5px)] leading-relaxed text-ink-2">
            {topic.blurb}
          </p>
        ) : null}
        <p className="mt-4 border-t border-line-soft pt-4 text-[13px] text-taupe">
          <b className="font-medium text-ink">{result.total}</b>{" "}
          {result.total === 1 ? "material" : "materials"} on this shelf
        </p>
      </div>

      <section className="mx-auto max-w-(--measure) px-(--gutter) pb-[clamp(56px,7vw,104px)]">
        {result.items.length === 0 ? (
          <p className="py-16 text-center text-ink-3">
            Nothing is filed here yet. It may be waiting to be categorised.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4">
            {result.items.map((material) => (
              <MaterialCard key={material.id} material={material} shelf={topic.name} />
            ))}
          </div>
        )}

        <Pagination
          page={page}
          pages={result.pages}
          total={result.total}
          pageSize={PAGE_SIZE}
          hrefFor={(p) => (p === 1 ? `/topics/${slug}` : `/topics/${slug}?page=${p}`)}
        />
      </section>
    </>
  )
}
