import type { Metadata } from "next"
import Link from "next/link"
import { Arrow } from "../../../components/public/masthead"
import { archiveStats, topicList } from "../../../server/materials/queries"

export const metadata: Metadata = {
  title: "About",
  description:
    "Higherway is a publication before it is a website: a free digital archive of teachings prepared for the congregation of The Apostolic Faith Church, free to read and free to download.",
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
            Higherway began as a printed collection of teachings prepared for the congregation of{" "}
            <b className="font-medium">The Apostolic Faith Church</b> — articles written to be read
            slowly, kept, and passed on. This site is a digital archive of those materials, making
            them easier to discover and access. Every material in the collection is provided freely
            to read and download.
          </p>

          <h2 className="mb-3 mt-12 text-[clamp(24px,2.6vw,32px)]">What it is for</h2>
          <p className="font-serif text-[clamp(16px,1.2vw,18px)] leading-[1.72] text-ink-2">
            Most of what Higherway contains was written for an ordinary week: a decision that needs
            wisdom, a season that has gone quiet, a family learning how to pray together, or a
            believer seeking to grow in their walk with God. The articles are short by design,
            written to be read in one sitting and returned to when needed.
          </p>
          <p className="mt-5 font-serif text-[clamp(16px,1.2vw,18px)] leading-[1.72] text-ink-2">
            There is no account to create and no subscription required. Find a material, open it,
            and download the original publication if it is useful to you. Share it with anyone who
            may benefit from it.
          </p>

          <h2 className="mb-3 mt-12 text-[clamp(24px,2.6vw,32px)]">Where it comes from</h2>
          <p className="font-serif text-[clamp(16px,1.2vw,18px)] leading-[1.72] text-ink-2">
            The materials in the Higherway collection belong to The Apostolic Faith Church, a
            Christian church with a tradition of Wesleyan holiness.
          </p>
          <p className="mt-5 font-serif text-[clamp(16px,1.2vw,18px)] leading-[1.72] text-ink-2">
            The Apostolic Faith Church is conservative in nature, following a tradition of Wesleyan
            holiness taught and practiced by those upon whom the Holy Spirit descended during the
            Azusa Street Revival.
          </p>
          <p className="mt-5 font-serif text-[clamp(16px,1.2vw,18px)] leading-[1.72] text-ink-2">
            Higherway exists to make these teachings and publications more accessible while pointing
            readers back to the church from which they came.
          </p>

          <h2 className="mb-3 mt-12 text-[clamp(24px,2.6vw,32px)]">The Apostolic Faith Church</h2>
          <p className="font-serif text-[clamp(16px,1.2vw,18px)] leading-[1.72] text-ink-2">
            The Apostolic Faith Church is a global Christian fellowship committed to the teaching of
            the Bible and the life of holiness.
          </p>
          <p className="mt-5 font-serif text-[clamp(16px,1.2vw,18px)] leading-[1.72] text-ink-2">
            Its teachings emphasize the trustworthiness of Scripture and the practical working out
            of Christian faith in everyday life.
          </p>
          <p className="mt-5 font-serif text-[clamp(16px,1.2vw,18px)] leading-[1.72] text-ink-2">
            Higherway is one way these teachings can be encountered beyond the printed page.
          </p>

          <h2 className="mb-3 mt-12 text-[clamp(24px,2.6vw,32px)]">How the archive works</h2>
          <p className="font-serif text-[clamp(16px,1.2vw,18px)] leading-[1.72] text-ink-2">
            The Higherway collection currently holds{" "}
            <b className="font-medium text-ink">over {stats.materials} materials</b> across{" "}
            {stats.topics} topics
            {named.length ? `, including ${named.join(", ")}` : null}. Each material was originally
            printed and preserved page by page — the digital archive keeps those publications in
            their original form, making them available to discover and download. Start with{" "}
            <Link
              href="/library"
              className="border-b border-line transition-colors hover:border-ink"
            >
              the library
            </Link>
            , browse by topic, and find a material that speaks to where you are.
          </p>
        </div>

        <div className="mt-[clamp(40px,5vw,64px)] grid gap-px border-y border-line-soft bg-line-soft sm:grid-cols-3">
          {[
            {
              k: "Written for",
              h: "The ordinary week",
              p: "Not just for conferences or special occasions. Teaching and counsel for Monday morning, the school run, the family table, and the quiet hour before anyone else is awake.",
            },
            {
              k: "Kept",
              h: "In print and in full",
              p: "Every material is preserved from the original printed publication, page for page, so its content can remain accessible even when physical copies are no longer available.",
            },
            {
              k: "Given",
              h: "Freely, to anyone",
              p: "No account. No charge. No restriction on sharing. If a material helps you, pass it on.",
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

        <div className="mt-10 flex flex-col gap-3.5 sm:flex-row sm:gap-8">
          <a
            href="https://www.apostolicfaith.org"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-[13px] font-medium text-ink-3 transition-colors hover:text-ink"
          >
            Learn more about The Apostolic Faith Church <Arrow />
          </a>
          <a
            href="https://apostolicfaithweca.org"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-[13px] font-medium text-ink-3 transition-colors hover:text-ink"
          >
            Visit the West &amp; Central Africa website <Arrow />
          </a>
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
