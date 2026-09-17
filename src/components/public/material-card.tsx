import Link from "next/link"
import type { MaterialCard as Card } from "../../server/materials/queries"
import { Cover } from "./cover"

/**
 * One material in a grid or a rail. The card *is* the cover: the title is set
 * on the artwork rather than beneath it, as in the printed publication.
 *
 * A link to /m/[slug], not to the file — v1 sent people straight to Google
 * Drive, which meant leaving the site to read anything. ARCHITECTURE.md §9.
 */
export function MaterialCard({
  material,
  shelf,
  matchedPage,
}: {
  material: Card
  shelf?: string
  /**
   * The page a search matched on, when it matched the text rather than the
   * title. It answers "why is this here?" for a result whose title says nothing
   * about what was typed — which, in an archive of photographed pages, is most
   * of them.
   */
  matchedPage?: number | null
}) {
  const topic = shelf ?? material.topics[0]?.name

  return (
    <Link href={`/m/${material.slug}`} className="group block" aria-label={material.title}>
      <div className="overflow-hidden rounded-[2px] bg-paper-3">
        <div className="transition-transform duration-700 ease-hw-out group-hover:scale-[1.035]">
          <Cover seed={material.slug} look={material.look} title={material.title} topic={topic} />
        </div>
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-2 text-[12.5px] text-taupe">
        <span>{material.author || topic || "Higherway"}</span>
        {material.pageCount ? (
          <>
            <i className="h-[3px] w-[3px] rounded-full bg-current opacity-50" />
            <span>
              {material.pageCount} {material.pageCount === 1 ? "page" : "pages"}
            </span>
          </>
        ) : null}
        {matchedPage ? (
          <>
            <i className="h-[3px] w-[3px] rounded-full bg-current opacity-50" />
            <span className="text-gold">found on page {matchedPage}</span>
          </>
        ) : null}
      </div>
    </Link>
  )
}
