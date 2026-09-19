import Link from "next/link"
import { Hero } from "../../components/public/hero/hero"
import { LatestAddition } from "../../components/public/latest-addition"
import { Arrow } from "../../components/public/masthead"
import { MaterialCard } from "../../components/public/material-card"
import { archiveStats, recentMaterials, topicList } from "../../server/materials/queries"

/**
 * The home page. Entirely server-rendered — a visitor downloads no application
 * JavaScript to read it.
 *
 * Revalidated rather than rebuilt: the archive changes when an admin adds
 * something, not when the site is deployed.
 */
export const revalidate = 300

export default async function HomePage() {
  const [recent, topics, stats] = await Promise.all([
    recentMaterials(8),
    topicList(12),
    archiveStats(),
  ])

  const latest = recent[0]

  return (
    <>
      <Hero />

      {latest ? (
        <LatestAddition
          material={{
            slug: latest.slug,
            title: latest.title,
            summary: latest.summary,
            topic: latest.topics[0]?.name,
          }}
          stats={stats}
        />
      ) : null}

      <section className="py-[clamp(56px,7vw,104px)]">
        <div className="mx-auto max-w-(--measure) px-(--gutter)">
          <div className="mb-[clamp(26px,3vw,40px)] flex items-end justify-between gap-6">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[.2em] text-taupe">
                Recently added
              </p>
              <h2 className="mt-3 text-[clamp(26px,3.2vw,40px)]">Fresh from the press</h2>
            </div>
            <Link
              href="/library"
              className="inline-flex flex-none items-center gap-2 border-b border-line pb-[3px] text-[13px] font-medium transition-all hover:gap-3 hover:border-ink"
            >
              View all <Arrow />
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-4">
            {recent.slice(0, 8).map((material) => (
              <MaterialCard key={material.id} material={material} />
            ))}
          </div>
        </div>
      </section>

      {topics.length > 0 ? (
        <section className="py-[clamp(40px,5vw,72px)]">
          <div className="mx-auto max-w-(--measure) px-(--gutter)">
            <div className="mb-[clamp(26px,3vw,40px)] flex items-end justify-between gap-6">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[.2em] text-taupe">
                  Browse by topic
                </p>
                <h2 className="mt-3 text-[clamp(26px,3.2vw,40px)]">Find what you need</h2>
              </div>
            </div>

            <div className="grid gap-px border-y border-line-soft bg-line-soft sm:grid-cols-2 lg:grid-cols-3">
              {topics.map((topic, i) => (
                <Link
                  key={topic.slug}
                  href={`/topics/${topic.slug}`}
                  className="flex min-h-[170px] flex-col gap-2.5 bg-paper p-[clamp(22px,2.4vw,32px)] transition-colors hover:bg-paper-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium tracking-[.18em] text-taupe">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[13.5px] text-ink-3">{topic.count}</span>
                  </div>
                  <div className="mt-auto font-serif text-[clamp(22px,2.2vw,28px)] font-light tracking-[-0.02em]">
                    {topic.name}
                  </div>
                  {topic.blurb ? (
                    <p className="text-[13px] leading-relaxed text-ink-3">{topic.blurb}</p>
                  ) : null}
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="bg-forest py-[clamp(56px,7vw,96px)] text-paper-2">
        <div className="mx-auto grid max-w-(--measure) items-end gap-[clamp(28px,5vw,72px)] px-(--gutter) lg:grid-cols-[1.15fr_1fr]">
          <h2 className="max-w-[12ch] text-[clamp(34px,5vw,62px)] text-[#FCFAF5]">
            Same truths. A brighter tomorrow.
          </h2>
          <div>
            <p className="max-w-[44ch] leading-relaxed text-[rgba(251,248,243,.66)]">
              Nothing to sign up for. Pick a topic, open a material, read it through, and take the
              file if it is useful to you.
            </p>
            <Link
              href="/library"
              className="mt-6 inline-flex items-center gap-2.5 rounded-full border border-paper-2 bg-paper-2 px-7 py-4 text-[15px] font-medium text-ink transition-colors hover:bg-white"
            >
              Browse every material <Arrow />
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
