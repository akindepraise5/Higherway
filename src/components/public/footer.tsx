import Link from "next/link"
import { hasSubmissions } from "../../lib/env"
import { topicList } from "../../server/materials/queries"
import { Logo } from "./logo"

/**
 * The footer, built from the same data as the rest of the site — the topics
 * listed here are whatever the archive actually holds, not a hand-kept list.
 */
export async function Footer() {
  const topics = await topicList(6)

  return (
    <footer className="border-t border-line-dark bg-forest pb-8 pt-[clamp(40px,5vw,64px)] text-[rgba(251,248,243,.6)]">
      <div className="mx-auto max-w-(--measure) px-(--gutter)">
        <div className="grid gap-[clamp(24px,3vw,48px)] sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo className="h-[40px] w-[130px] text-paper-2" />
            <p className="mt-4 max-w-[34ch] text-sm leading-relaxed">
              A free archive of the Higherway publication. Read any material in full, or take the
              file with you.
            </p>
          </div>

          <div>
            <h2 className="mb-4 text-[11px] font-medium uppercase tracking-[.2em] text-[rgba(251,248,243,.4)]">
              Browse
            </h2>
            <ul className="space-y-2.5">
              <li>
                <Link href="/library" className="text-sm transition-colors hover:text-paper-2">
                  All materials
                </Link>
              </li>
              <li>
                <Link href="/about" className="text-sm transition-colors hover:text-paper-2">
                  About Higherway
                </Link>
              </li>
              {/* Only when submissions are actually open. A link to a page that
                  explains it is closed is a small broken promise, and the page
                  is a 404-with-an-explanation rather than a disabled form. */}
              {hasSubmissions ? (
                <li>
                  <Link href="/submit" className="text-sm transition-colors hover:text-paper-2">
                    Send us something
                  </Link>
                </li>
              ) : null}
            </ul>
          </div>

          <div>
            <h2 className="mb-4 text-[11px] font-medium uppercase tracking-[.2em] text-[rgba(251,248,243,.4)]">
              Topics
            </h2>
            <ul className="space-y-2.5">
              {topics.map((topic) => (
                <li key={topic.slug}>
                  <Link
                    href={`/topics/${topic.slug}`}
                    className="text-sm transition-colors hover:text-paper-2"
                  >
                    {topic.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-[clamp(36px,4vw,56px)] flex flex-wrap items-center justify-between gap-4 border-t border-line-dark pt-6 text-[12.5px] text-[rgba(251,248,243,.42)]">
          <span>
            &copy; {new Date().getFullYear()} Higherway. Published for the church and its friends.
          </span>
          <span>Free to read, free to download.</span>
        </div>
      </div>
    </footer>
  )
}
