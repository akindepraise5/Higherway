import { Logo } from "./logo"
import { Arrow } from "./masthead"

const CHURCH_URL = "https://www.apostolicfaith.org/"
const CHURCH_FAITH_URL = "https://www.apostolicfaith.org/our-faith"
const WECA_URL = "https://apostolicfaithweca.org/"
const WECA_CONTACT_URL = "https://apostolicfaithweca.org/form/contact"

/**
 * The footer. The Higherway column stays data-driven; the church block below
 * it is fixed content — the address, phone, email and every church link come
 * from the church itself, not from anything the archive tracks, so there is
 * nothing here to query.
 */
export function Footer() {
  return (
    <footer className="border-t border-line-dark bg-forest pb-8 pt-[clamp(40px,5vw,64px)] text-[rgba(251,248,243,.6)]">
      <div className="mx-auto max-w-(--measure) px-(--gutter)">
        <div className="grid gap-[clamp(28px,3.5vw,52px)] sm:grid-cols-2 lg:grid-cols-[1.25fr_1.3fr_1fr]">
          <div>
            <Logo className="h-[40px] w-[130px] text-paper-2" />
            <p className="mt-4 max-w-[36ch] text-sm leading-relaxed">
              A free digital archive of Higherway publications from The Apostolic Faith Church.
              Explore the collection, discover teachings, and access the original materials freely.
            </p>
          </div>

          <div>
            <h2 className="text-[11px] font-medium uppercase tracking-[.2em] text-[rgba(251,248,243,.4)]">
              The Apostolic Faith Church
            </h2>
            <p className="mt-2 font-serif text-[15px] font-normal text-paper-2">
              West &amp; Central Africa Headquarters
            </p>

            <ul className="mt-4 space-y-2.5 text-sm leading-relaxed">
              <li>
                1 Campground Road, Anthony Village
                <br />
                Lagos, Nigeria
              </li>
              <li>
                <a href="tel:+2347007000800" className="transition-colors hover:text-paper-2">
                  0700-7000-800 (+234 700-7000-800)
                </a>
              </li>
              <li>
                <a
                  href="mailto:info@apostolicfaithweca.org"
                  className="transition-colors hover:text-paper-2"
                >
                  info@apostolicfaithweca.org
                </a>
              </li>
              <li>
                <a
                  href="https://wa.me/2349077373624"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-paper-2"
                >
                  WhatsApp: +234 907 737 3624
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h2 className="mb-4 text-[11px] font-medium uppercase tracking-[.2em] text-[rgba(251,248,243,.4)]">
              Church
            </h2>
            <ul className="space-y-2.5">
              <li>
                <a
                  href={CHURCH_FAITH_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm transition-colors hover:text-paper-2"
                >
                  About The Apostolic Faith Church
                </a>
              </li>
              <li>
                <a
                  href={WECA_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm transition-colors hover:text-paper-2"
                >
                  West &amp; Central Africa
                </a>
              </li>
              <li>
                <a
                  href={CHURCH_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm transition-colors hover:text-paper-2"
                >
                  International Headquarters
                </a>
              </li>
              <li>
                <a
                  href={WECA_CONTACT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm transition-colors hover:text-paper-2"
                >
                  Contact the Church
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-[clamp(36px,4vw,56px)] flex flex-col gap-4 border-t border-line-dark pt-6 text-[12.5px] text-[rgba(251,248,243,.42)] sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="space-y-2 sm:flex sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-2 sm:space-y-0">
            <p>
              &copy; {new Date().getFullYear()} Higherway. Materials published by The Apostolic
              Faith Church.
            </p>
            <p>Free to read. Free to download.</p>
          </div>
          <a
            href={WECA_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 font-medium text-[rgba(251,248,243,.6)] transition-colors hover:text-paper-2"
          >
            Learn more about The Apostolic Faith Church <Arrow className="h-3 w-3" />
          </a>
        </div>
      </div>
    </footer>
  )
}
