"use client"

import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { USABLE_THRESHOLD } from "../../lib/text/quality"

/**
 * Reading a material, rather than judging it by its title.
 *
 * Filing something under the right topic usually means looking inside it, and a
 * 4-up contact sheet of phone photographs is not readable. Clicking any page
 * opens it full size with the rest a keystroke away.
 *
 * Built on the native <dialog>: focus trapping, Escape and correct semantics
 * without a library, the same as `confirm-dialog.tsx`. The backdrop is inert by
 * design — a mis-click while reading should not throw you out of the material.
 *
 * The OCR text is deliberately not shipped here. At ~3 KB a page, a 48-page
 * booklet would put 150 KB of text into the payload for a panel most visits
 * never open; the pages themselves are the read.
 */

export type ReaderPage = {
  pageNumber: number
  url: string
  width: number | null
  height: number | null
  ocrQuality: number | null
}

export function PageReader({ title, pages }: { title: string; pages: ReaderPage[] }) {
  const [index, setIndex] = useState<number | null>(null)
  const ref = useRef<HTMLDialogElement>(null)

  const open = index !== null
  const current = open ? pages[index] : undefined

  const go = useCallback(
    (delta: number) => {
      setIndex((i) => {
        if (i === null) return i
        const next = i + delta
        // Stop at the ends rather than wrapping: page 1 and the last page are
        // meaningful places, and silently looping loses them.
        return next < 0 || next >= pages.length ? i : next
      })
    },
    [pages.length],
  )

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault()
        go(1)
      } else if (e.key === "ArrowLeft") {
        e.preventDefault()
        go(-1)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open, go])

  if (pages.length === 0) return null

  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {pages.map((page, i) => (
          <button
            key={page.pageNumber}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`Read page ${page.pageNumber} of ${title}`}
            className="group overflow-hidden rounded-[3px] border border-line-soft text-left transition-colors hover:border-ink"
          >
            {/* biome-ignore lint/performance/noImgElement: already sized by our pipeline, served free from R2 */}
            <img
              src={page.url}
              alt={`Page ${page.pageNumber}`}
              width={page.width ?? 1400}
              height={page.height ?? 1980}
              loading="lazy"
              className="h-auto w-full bg-paper-3"
            />
            <span className="flex items-center justify-between px-2.5 py-2 text-[11px] text-taupe">
              <span>p{page.pageNumber}</span>
              <span
                className={
                  page.ocrQuality !== null && page.ocrQuality < USABLE_THRESHOLD
                    ? "text-[#8c2f22]"
                    : ""
                }
              >
                {page.ocrQuality !== null ? `${Math.round(page.ocrQuality * 100)}%` : "—"}
              </span>
            </span>
          </button>
        ))}
      </div>

      <dialog
        ref={ref}
        onCancel={(e) => {
          e.preventDefault()
          setIndex(null)
        }}
        aria-label={`${title} — reader`}
        className="m-auto max-h-none max-w-none bg-transparent p-0 text-paper-2 backdrop:bg-forest/80 backdrop:backdrop-blur-[3px]"
      >
        {/* Both guards are needed: narrowing `current` tells TypeScript nothing
            about `index`, which the counter and the end-stops below read. */}
        {current && index !== null ? (
          <div className="flex h-[100dvh] w-[100vw] flex-col">
            <div className="flex flex-none items-center gap-4 px-4 py-3 sm:px-6">
              <div className="min-w-0">
                <p className="truncate font-serif text-[15px] text-paper-2">{title}</p>
                <p className="text-[12px] text-[rgba(251,248,243,.6)]">
                  Page {current.pageNumber} — {index + 1} of {pages.length}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIndex(null)}
                aria-label="Close the reader"
                className="ml-auto grid h-9 w-9 flex-none place-items-center rounded-full border border-[rgba(251,248,243,.25)] transition-colors hover:border-paper-2"
              >
                <X size={16} />
              </button>
            </div>

            <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-4 sm:px-16">
              {/* biome-ignore lint/performance/noImgElement: already sized by our pipeline, served free from R2 */}
              <img
                src={current.url}
                alt={`${title}, page ${current.pageNumber}`}
                width={current.width ?? 1400}
                height={current.height ?? 1980}
                className="max-h-full w-auto max-w-full rounded-[2px] bg-paper-3 object-contain shadow-[0_24px_60px_-30px_rgba(0,0,0,.8)]"
              />

              <button
                type="button"
                onClick={() => go(-1)}
                disabled={index === 0}
                aria-label="Previous page"
                className="absolute left-1 grid h-11 w-11 place-items-center rounded-full border border-[rgba(251,248,243,.25)] bg-forest/60 backdrop-blur-[2px] transition-colors hover:border-paper-2 disabled:pointer-events-none disabled:opacity-25 sm:left-4"
              >
                <ChevronLeft size={20} />
              </button>

              <button
                type="button"
                onClick={() => go(1)}
                disabled={index === pages.length - 1}
                aria-label="Next page"
                className="absolute right-1 grid h-11 w-11 place-items-center rounded-full border border-[rgba(251,248,243,.25)] bg-forest/60 backdrop-blur-[2px] transition-colors hover:border-paper-2 disabled:pointer-events-none disabled:opacity-25 sm:right-4"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        ) : null}
      </dialog>
    </>
  )
}
