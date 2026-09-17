"use client"

import { FileUp, Link2, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { finishUpload, importFromUrl, startUpload } from "../../server/services/uploads"
import { TopicSelect } from "./topic-select"

/**
 * Adding a material: a file from this machine, or a link.
 *
 * The file never passes through the app. `startUpload` returns a presigned URL
 * and the browser PUTs straight to R2, because Vercel refuses request bodies
 * over 4.5 MB and 8.6% of this archive is larger than 10 MB.
 *
 * That URL is signed for `application/pdf` specifically, so the PUT has to send
 * exactly that content type — a different one, or none, and R2 rejects the
 * signature rather than the file, which reads as a baffling 403.
 *
 * Neither path renders anything here. Both hand off to the background task and
 * return, so a slow scan does not hold a page open.
 *
 * Topics are chosen here rather than afterwards, because "I will file it later"
 * is how 367 of the 651 imported materials ended up with no topic at all.
 */

export type PickableTopic = { id: string; name: string; total: number }

type Mode = "file" | "link"
type Notice = { ok: boolean; text: string } | null

export function NewMaterialForm({
  jobsConfigured,
  topics,
  onBusyChange,
  onDone,
}: {
  jobsConfigured: boolean
  topics: PickableTopic[]
  /** Lets a drawer refuse to close while a file is still going up. */
  onBusyChange?: (busy: boolean) => void
  onDone?: () => void
}) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>("file")
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice>(null)

  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState("")
  const [author, setAuthor] = useState("")
  const [url, setUrl] = useState("")

  const [chosen, setChosen] = useState<string[]>([])

  const byId = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics])

  /** One place to set it, so the drawer above is always told. */
  const working = (state: string | null) => {
    setBusy(state)
    onBusyChange?.(state !== null)
  }

  const succeeded = (message: string) => {
    setNotice({ ok: true, text: message })
    setFile(null)
    setTitle("")
    setAuthor("")
    setUrl("")
    setChosen([])
    router.refresh()
    // Long enough to read the confirmation before the drawer closes.
    setTimeout(() => onDone?.(), 1400)
  }

  if (!jobsConfigured) {
    return (
      <div className="mt-8 max-w-xl rounded-[4px] border-l-2 border-gold bg-paper-2 px-5 py-4">
        <p className="text-[14px] leading-relaxed text-ink-2">
          Adding materials is turned off until{" "}
          <span className="font-mono text-[13px]">TRIGGER_SECRET_KEY</span> and{" "}
          <span className="font-mono text-[13px]">TRIGGER_PROJECT_REF</span> are set.
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-taupe">
          Reading a PDF runs off Vercel so it is never cut short by a function timeout. Without it a
          file would upload and then sit unprocessed, which is worse than not accepting it.
        </p>
      </div>
    )
  }

  const submitFile = async () => {
    if (!file) return setNotice({ ok: false, text: "Choose a PDF first." })
    if (title.trim().length < 2) {
      return setNotice({ ok: false, text: "Give it a title of at least two characters." })
    }

    setNotice(null)
    working("Preparing…")
    const ticket = await startUpload()
    if (!ticket.ok) {
      working(null)
      return setNotice({ ok: false, text: ticket.error })
    }

    working("Uploading…")
    try {
      const response = await fetch(ticket.url, {
        method: "PUT",
        body: file,
        // Must match what the URL was signed for, exactly.
        headers: { "Content-Type": "application/pdf" },
      })
      if (!response.ok) throw new Error(`R2 returned ${response.status}`)
    } catch (error) {
      working(null)
      return setNotice({
        ok: false,
        text: `The upload failed: ${error instanceof Error ? error.message : "unknown error"}`,
      })
    }

    working("Handing it over…")
    const result = await finishUpload({
      uploadId: ticket.uploadId,
      title,
      author,
      categoryIds: chosen,
    })
    working(null)
    if (result.ok) succeeded(result.message)
    else setNotice({ ok: false, text: result.error })
  }

  const submitLink = async () => {
    if (!url.trim()) return setNotice({ ok: false, text: "Paste a link first." })

    setNotice(null)
    working("Fetching…")
    const result = await importFromUrl({
      url,
      title: title.trim() || undefined,
      author: author.trim() || undefined,
      categoryIds: chosen,
    })
    working(null)
    if (result.ok) succeeded(result.message)
    else setNotice({ ok: false, text: result.error })
  }

  return (
    <div className="mt-8 max-w-xl">
      <div className="flex gap-2">
        {(
          [
            ["file", "Upload a file", FileUp],
            ["link", "Import a link", Link2],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setMode(value)
              setNotice(null)
            }}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13.5px] transition-colors ${
              mode === value
                ? "border-ink bg-ink text-paper-2"
                : "border-line text-ink-2 hover:border-ink"
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      <form
        className="mt-6"
        onSubmit={(e) => {
          e.preventDefault()
          if (mode === "file") submitFile()
          else submitLink()
        }}
      >
        {mode === "file" ? (
          <>
            <label htmlFor="pdf" className="block text-[13px] text-ink-2">
              The PDF
            </label>
            <input
              id="pdf"
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => {
                const picked = e.target.files?.[0] ?? null
                setFile(picked)
                // A filename is a decent first guess at a title, and most of
                // this archive's titles began life exactly that way.
                if (picked && !title) {
                  setTitle(
                    picked.name
                      .replace(/\.pdf$/i, "")
                      .replace(/[-_]+/g, " ")
                      .trim(),
                  )
                }
              }}
              className="mt-1.5 w-full rounded-[4px] border border-line bg-paper-2 px-3.5 py-2.5 text-[14px] file:mr-3 file:rounded-full file:border-0 file:bg-ink file:px-4 file:py-1.5 file:text-[13px] file:text-paper-2"
            />
          </>
        ) : (
          <>
            <label htmlFor="url" className="block text-[13px] text-ink-2">
              Link to a PDF
            </label>
            <input
              id="url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/a-material.pdf"
              className="mt-1.5 w-full rounded-[4px] border border-line bg-paper-2 px-3.5 py-2.5 text-[14.5px] outline-none transition-colors focus:border-ink"
            />
            <p className="mt-1.5 text-[12px] text-taupe">
              The server fetches it, checks it really is a PDF by its own header, and refuses
              private addresses.
            </p>
          </>
        )}

        <label htmlFor="new-title" className="mt-5 block text-[13px] text-ink-2">
          Title {mode === "link" ? <span className="text-taupe">(optional)</span> : null}
        </label>
        <input
          id="new-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={mode === "link" ? "Taken from the link if left empty" : "What it is called"}
          className="mt-1.5 w-full rounded-[4px] border border-line bg-paper-2 px-3.5 py-2.5 text-[14.5px] outline-none transition-colors focus:border-ink"
        />

        {/* Optional, and asked for here rather than only on the edit screen:
            whoever is adding the material is the person most likely to know,
            and "I will fill that in later" is how 367 materials ended up with
            no topic. Readers follow authors, so it is worth a field. */}
        <label htmlFor="new-author" className="mt-5 block text-[13px] text-ink-2">
          Author <span className="text-taupe">(optional)</span>
        </label>
        <input
          id="new-author"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="Leave empty if it is not credited"
          className="mt-1.5 w-full rounded-[4px] border border-line bg-paper-2 px-3.5 py-2.5 text-[14.5px] outline-none transition-colors focus:border-ink"
        />

        <div className="mt-6 border-t border-line-soft pt-5">
          <p className="text-[13px] text-ink-2">Topics</p>
          <p className="mt-1 text-[12px] leading-relaxed text-taupe">
            Leave this empty and it arrives Uncategorised — which is fine, and fixable later. It is
            simply easier to file now, while you know what it is.
          </p>

          {chosen.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {chosen.map((id) => (
                <span
                  key={id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[12.5px] text-ink-2"
                >
                  {byId.get(id)?.name ?? "Unknown topic"}
                  <button
                    type="button"
                    onClick={() => setChosen((c) => c.filter((x) => x !== id))}
                    aria-label={`Remove ${byId.get(id)?.name ?? "topic"}`}
                    className="text-taupe transition-colors hover:text-[#8c2f22]"
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-3">
            <TopicSelect
              id="topic-filter"
              topics={topics}
              selected={chosen}
              onSelect={(topic) => setChosen((c) => [...c, topic.id])}
              onDeselect={(topic) => setChosen((c) => c.filter((x) => x !== topic.id))}
              placeholder={
                chosen.length === 0
                  ? `Choose from ${topics.length} topics…`
                  : `${chosen.length} chosen — add another…`
              }
            />
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="submit"
            disabled={busy !== null}
            className="rounded-full bg-ink px-5 py-2.5 text-[13.5px] font-medium text-paper-2 transition-colors hover:bg-forest-2 disabled:opacity-40"
          >
            {busy ?? (mode === "file" ? "Upload" : "Import")}
          </button>
          {notice ? (
            <p
              role="status"
              className={`text-[13px] ${notice.ok ? "text-ink-3" : "text-[#8c2f22]"}`}
            >
              {notice.text}
            </p>
          ) : null}
        </div>
      </form>

      <p className="mt-6 text-[12.5px] leading-relaxed text-taupe">
        It arrives waiting to be published, not in the library. An identical file already in the
        archive is recognised and refused rather than added twice.
      </p>
    </div>
  )
}
