"use client"

import { Check, Copy, Mail, MessageCircle, Share2, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"

/**
 * Sharing a material.
 *
 * This archive travels by word of mouth — someone reads a teaching and sends it
 * to a friend or a church group — so the share panel shows exactly what the
 * other person will receive before anything leaves: the title, who wrote it,
 * and the plain link. No tracking parameters are added, and nothing is sent
 * from here; every option hands off to the reader's own app.
 *
 * The URL comes from `window.location.href` rather than a configured base, so
 * the day the archive moves to its own domain this keeps working with nothing
 * to edit.
 */

type Props = {
  title: string
  author?: string
  topic?: string
  pageCount?: number | null
}

export function Share({ title, author, topic, pageCount }: Props) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [url, setUrl] = useState("")
  const [canNativeShare, setCanNativeShare] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Read on the client only: the server has no window, and rendering a URL
  // there would mean a hydration mismatch on every page.
  useEffect(() => {
    setUrl(window.location.href)
    setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function")
  }, [])

  useEffect(() => {
    if (!open) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }

    document.addEventListener("keydown", onKey)
    // Deferred, so the click that opened the panel does not immediately close it.
    const id = setTimeout(() => document.addEventListener("mousedown", onClick), 0)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("mousedown", onClick)
      clearTimeout(id)
    }
  }, [open])

  const line = [
    author,
    topic,
    pageCount ? `${pageCount} ${pageCount === 1 ? "page" : "pages"}` : null,
  ]
    .filter(Boolean)
    .join(" · ")

  const message = `${title}${author ? ` — ${author}` : ""}\n${url}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard access can be refused outright (insecure context, permissions).
      // The link sits in a selectable field below, so there is still a way through.
      setCopied(false)
    }
  }

  const nativeShare = async () => {
    try {
      await navigator.share({ title, text: title, url })
    } catch {
      // A cancelled share rejects. That is a choice, not a failure.
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="mt-3 flex w-full items-center justify-center gap-2.5 rounded-full border border-line px-6 py-3.5 text-[14.5px] text-ink-2 transition-colors hover:border-ink hover:text-ink"
      >
        <Share2 size={16} />
        Share this
      </button>

      {open ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Share this material"
          className="absolute bottom-full left-0 right-0 z-40 mb-2 rounded-[6px] border border-line bg-paper p-4 shadow-[0_1px_2px_rgba(20,26,23,.08),0_24px_50px_-28px_rgba(20,26,23,.5)]"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-[11px] font-medium uppercase tracking-[.18em] text-taupe">
              They will receive
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="-mr-1 -mt-1 p-1 text-taupe transition-colors hover:text-ink"
            >
              <X size={14} />
            </button>
          </div>

          {/* The preview. What the other person sees, before it is sent. */}
          <div className="mt-2.5 rounded-[4px] border border-line-soft bg-paper-2 p-3">
            <p className="font-serif text-[15px] leading-snug text-ink">{title}</p>
            {line ? <p className="mt-1 text-[12px] text-taupe">{line}</p> : null}
            <p className="mt-2 break-all font-mono text-[11px] leading-relaxed text-ink-3">{url}</p>
          </div>

          <p className="mt-2.5 text-[12px] leading-relaxed text-taupe">
            Anyone with this link can read it. No account is needed.
          </p>

          <div className="mt-3 flex flex-col gap-1.5">
            <button
              type="button"
              onClick={copy}
              className="flex items-center gap-2.5 rounded-[3px] px-2.5 py-2 text-left text-[13.5px] text-ink-2 transition-colors hover:bg-paper-2"
            >
              {copied ? <Check size={15} className="text-forest" /> : <Copy size={15} />}
              {copied ? "Link copied" : "Copy the link"}
            </button>

            <a
              href={`https://wa.me/?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 rounded-[3px] px-2.5 py-2 text-[13.5px] text-ink-2 transition-colors hover:bg-paper-2"
            >
              <MessageCircle size={15} />
              Send on WhatsApp
            </a>

            <a
              href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(message)}`}
              className="flex items-center gap-2.5 rounded-[3px] px-2.5 py-2 text-[13.5px] text-ink-2 transition-colors hover:bg-paper-2"
            >
              <Mail size={15} />
              Send by email
            </a>

            {canNativeShare ? (
              <button
                type="button"
                onClick={nativeShare}
                className="flex items-center gap-2.5 rounded-[3px] px-2.5 py-2 text-left text-[13.5px] text-ink-2 transition-colors hover:bg-paper-2"
              >
                <Share2 size={15} />
                More…
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
