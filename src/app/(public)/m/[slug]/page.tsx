import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Cover } from "../../../../components/public/cover"
import { Share } from "../../../../components/public/share"
import { materialBySlug } from "../../../../server/materials/queries"

/**
 * One material, read in the browser.
 *
 * v1 sent people to Google Drive the moment they clicked anything, which meant
 * leaving the site to read a single page. Here the pages are images we already
 * rendered, served from our own CDN, and the PDF is still one click away.
 *
 * The OCR text sits at the foot of the page, collapsed. It is what makes a
 * photographed page findable on Google at all, and an admin can hide it per
 * material when a read has come out badly. ARCHITECTURE.md §7 and §9.
 */

export const revalidate = 300

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const material = await materialBySlug(slug)
  if (!material) return { title: "Material not found" }

  const description =
    material.summary ??
    material.readableText.slice(0, 180).replace(/\s+\S*$/, "") ??
    "A material from the Higherway archive. Free to read and free to download."

  return {
    title: material.title,
    description,
    alternates: { canonical: `/m/${material.slug}` },
    openGraph: {
      title: material.title,
      description,
      type: "article",
    },
  }
}

export default async function MaterialPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const material = await materialBySlug(slug)
  if (!material) notFound()

  const topic = material.topics[0]

  return (
    <article className="mx-auto max-w-(--measure) px-(--gutter) pb-[clamp(56px,7vw,104px)]">
      <Link
        href={topic ? `/topics/${topic.slug}` : "/library"}
        className="inline-flex items-center gap-2 py-[clamp(22px,3vw,34px)] text-[13px] text-ink-3 transition-colors hover:text-ink"
      >
        ← {topic ? topic.name : "The library"}
      </Link>

      <div className="grid items-start gap-[clamp(32px,6vw,84px)] lg:grid-cols-[minmax(0,380px)_1fr]">
        <div className="lg:sticky lg:top-[calc(var(--header-h)+24px)]">
          <Cover
            variant="cover"
            seed={material.slug}
            look={material.look}
            title={material.title}
            topic={topic?.name}
            footer={material.author ?? undefined}
          />

          {material.downloadUrl ? (
            <a
              href={material.downloadUrl}
              download
              className="mt-5 flex w-full items-center justify-center gap-2.5 rounded-full border border-ink bg-ink px-6 py-4 text-[15px] font-medium text-paper-2 transition-colors hover:bg-forest-2"
            >
              Download the PDF
            </a>
          ) : null}

          <Share
            title={material.title}
            author={material.author ?? undefined}
            topic={topic?.name}
            pageCount={material.pageCount}
          />
        </div>

        <div>
          <h1 className="text-[clamp(34px,5vw,62px)]">{material.title}</h1>

          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2.5 text-[13px] text-ink-3">
            {material.author ? <span>{material.author}</span> : null}
            {material.pageCount ? (
              <span>
                {material.pageCount} {material.pageCount === 1 ? "page" : "pages"}
              </span>
            ) : null}
            {material.topics.map((t) => (
              <Link
                key={t.slug}
                href={`/topics/${t.slug}`}
                className="border-b border-line transition-colors hover:border-ink hover:text-ink"
              >
                {t.name}
              </Link>
            ))}
          </div>

          {material.summary ? (
            <p className="mt-6 max-w-[60ch] text-[clamp(16px,1.2vw,18px)] leading-relaxed text-ink-2">
              {material.summary}
            </p>
          ) : null}

          {/* The reader. Page images we rendered ourselves, straight from R2 —
              no PDF library ships to the browser, and nothing is proxied. */}
          {material.pages.length > 0 ? (
            <div className="mt-[clamp(30px,4vw,48px)] flex flex-col gap-5">
              {material.pages.map((page) => (
                <figure
                  key={page.pageNumber}
                  className="overflow-hidden rounded-[2px] bg-paper-3 shadow-[0_1px_2px_rgba(20,26,23,.08),0_24px_50px_-28px_rgba(20,26,23,.5)]"
                >
                  {/* Plain img on purpose: these are already sized and optimised
                      by our own pipeline and served free from R2. next/image
                      would proxy them through Vercel for no gain. */}
                  {/* biome-ignore lint/performance/noImgElement: see comment above */}
                  <img
                    src={page.url}
                    alt={`${material.title}, page ${page.pageNumber}`}
                    width={page.width ?? 1400}
                    height={page.height ?? 1980}
                    loading={page.pageNumber === 1 ? "eager" : "lazy"}
                    decoding="async"
                    className="h-auto w-full"
                  />
                  <figcaption className="sr-only">Page {page.pageNumber}</figcaption>
                </figure>
              ))}
            </div>
          ) : (
            <p className="mt-8 rounded-[2px] border-l-2 border-gold bg-paper-2 px-5 py-4 text-[13.5px] leading-relaxed text-ink-2">
              The pages of this material are still being prepared. The PDF is available to download
              in the meantime.
            </p>
          )}

          {material.readableText ? (
            <details className="mt-[clamp(30px,4vw,48px)] border-t border-line-soft pt-6">
              <summary className="cursor-pointer text-[11px] font-medium uppercase tracking-[.2em] text-taupe">
                Read the text
              </summary>
              <div className="mt-5 max-w-[64ch] whitespace-pre-wrap font-serif text-[16px] leading-relaxed text-ink-2">
                {material.readableText}
              </div>
              <p className="mt-5 text-[12.5px] text-taupe">
                This text was read from the scanned pages by machine, so it may contain mistakes.
                The pages above are the original.
              </p>
            </details>
          ) : null}
        </div>
      </div>
    </article>
  )
}
