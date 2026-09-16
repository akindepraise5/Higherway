import type { Metadata } from "next"
import Link from "next/link"
import { Arrow } from "../../../components/public/masthead"
import { archiveStats, topicList } from "../../../server/materials/queries"

export const metadata: Metadata = {
  title: "About",
  description:
    "Higherway is a publication before it is a website: a free archive of teachings prepared for our congregation, scanned in full and free to download.",
  alternates: { canonical: "/about" },
}

export const revalidate = 3600

export default async function AboutPage() {
  const [stats, topics] = await Promise.all([archiveStats(), topicList(3)])
  const named = topics.map((t) => t.name)

  return (
    <>
      <div className="mx-auto max-w-(--measure) px-(--gutter) pt-[clamp(34px,4.5vw,64px)]">
        <p className="text-[11px] font-medium uppercase tracking-[.2em] text-taupe">About</p>
        <h1 className="mt-3.5 max-w-[18ch] text-[clamp(34px,5vw,62px)]">
          Higherway is a publication before it is a website.
        </h1>
      </div>

      <section className="mx-auto max-w-(--measure) px-(--gutter) py-[clamp(40px,5vw,72px)]">
        <div className="max-w-[64ch]">
          <p className="font-serif text-[clamp(21px,2.2vw,26px)] font-light leading-[1.5] tracking-[-0.015em]">
            Higherway began as a printed collection of teachings prepared for our congregation —
            articles written to be read slowly, kept, and passed on. This site is its archive.
            Everything we have published is here, free to read and free to download.
          </p>

          <h2 className="mb-3 mt-12 text-[clamp(24px,2.6vw,32px)]">What it is for</h2>
          <p className="text-[clamp(16px,1.2vw,18px)] leading-[1.72] text-ink-2">
            Most of what we publish is written for an ordinary week: a decision that needs wisdom, a
            season that has gone quiet, a family working out how to pray together. The articles are
            short by design — meant to be finished in one sitting and returned to later.
          </p>
          <p className="mt-5 text-[clamp(16px,1.2vw,18px)] leading-[1.72] text-ink-2">
            Nothing here asks you to sign up. Open a material, read it through, and take the file if
            it is useful to you. Share it with anyone.
          </p>

          <h2 className="mb-3 mt-12 text-[clamp(24px,2.6vw,32px)]">Where it comes from</h2>
          <p className="text-[clamp(16px,1.2vw,18px)] leading-[1.72] text-ink-2">
            Higherway is produced by our local church and written by its pastors, teachers and
            members. It carries the convictions of that community: that Scripture is trustworthy,
            that faith is worked out in daily life, and that teaching should be plain enough to be
            useful.
          </p>

          <h2 className="mb-3 mt-12 text-[clamp(24px,2.6vw,32px)]">How the archive works</h2>
          <p className="text-[clamp(16px,1.2vw,18px)] leading-[1.72] text-ink-2">
            The collection holds <b className="font-medium text-ink">{stats.materials} materials</b>{" "}
            filed under {stats.topics} topics
            {named.length ? ` — ${named.join(", ")} among them` : null}. Each one was printed first
            and scanned page by page, so what you read here is the publication as it was set. Start
            from{" "}
            <Link
              href="/library"
              className="border-b border-line transition-colors hover:border-ink"
            >
              the library
            </Link>
            , narrow it to a topic, and open whatever you need.
          </p>
        </div>

        <div className="mt-[clamp(40px,5vw,64px)] grid gap-px border-y border-line-soft bg-line-soft sm:grid-cols-3">
          {[
            {
              k: "Written for",
              h: "The ordinary week",
              p: "Not conference material. Counsel for Monday, for the school run, for the quiet hour before anyone else is awake.",
            },
            {
              k: "Kept",
              h: "In print and in full",
              p: "Every material is scanned complete, page for page, so nothing is lost when the printed copies run out.",
            },
            {
              k: "Given",
              h: "Freely, to anyone",
              p: "No account, no charge, no restriction on passing it on. If it helps someone, send it to them.",
            },
          ].map((panel) => (
            <div key={panel.k} className="bg-paper p-[clamp(24px,2.6vw,34px)]">
              <p className="text-[11px] font-medium uppercase tracking-[.2em] text-gold">
                {panel.k}
              </p>
              <h3 className="mt-3.5 font-serif text-[22px] font-normal tracking-[-0.015em]">
                {panel.h}
              </h3>
              <p className="mt-2.5 text-sm leading-relaxed text-ink-3">{panel.p}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-forest py-[clamp(56px,7vw,96px)] text-paper-2">
        <div className="mx-auto grid max-w-(--measure) items-end gap-[clamp(28px,5vw,72px)] px-(--gutter) lg:grid-cols-[1.15fr_1fr]">
          <h2 className="max-w-[12ch] text-[clamp(34px,5vw,62px)] text-[#FCFAF5]">
            Start anywhere in the collection.
          </h2>
          <div>
            <p className="max-w-[44ch] leading-relaxed text-[rgba(251,248,243,.66)]">
              Every material is free, and every one of them opens on the page itself. Pick a topic
              and see what is there.
            </p>
            <Link
              href="/library"
              className="mt-6 inline-flex items-center gap-2.5 rounded-full border border-paper-2 bg-paper-2 px-7 py-4 text-[15px] font-medium text-ink transition-colors hover:bg-white"
            >
              Open the library <Arrow />
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
