"use client"

import { FileUp, Link2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { finishUpload, importFromUrl, startUpload } from "../../server/services/uploads"

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
 */

type Mode = "file" | "link"
type Notice = { ok: boolean; text: string } | null

export function NewMaterialForm({ jobsConfigured }: { jobsConfigured: boolean }) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>("file")
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice>(null)

  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState("")
  const [url, setUrl] = useState("")

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
    setBusy("Preparing…")
    const ticket = await startUpload()
    if (!ticket.ok) {
      setBusy(null)
      return setNotice({ ok: false, text: ticket.error })
    }

    setBusy("Uploading…")
    try {
      const response = await fetch(ticket.url, {
        method: "PUT",
        body: file,
        // Must match what the URL was signed for, exactly.
        headers: { "Content-Type": "application/pdf" },
      })
      if (!response.ok) throw new Error(`R2 returned ${response.status}`)
    } catch (error) {
      setBusy(null)
      return setNotice({
        ok: false,
        text: `The upload failed: ${error instanceof Error ? error.message : "unknown error"}`,
      })
    }

    setBusy("Handing it over…")
    const result = await finishUpload({ uploadId: ticket.uploadId, title })
    setBusy(null)
    setNotice({ ok: result.ok, text: result.ok ? result.message : result.error })
    if (result.ok) {
      setFile(null)
      setTitle("")
      router.refresh()
    }
  }

  const submitLink = async () => {
    if (!url.trim()) return setNotice({ ok: false, text: "Paste a link first." })

    setNotice(null)
    setBusy("Fetching…")
    const result = await importFromUrl({ url, title: title.trim() || undefined })
    setBusy(null)
    setNotice({ ok: result.ok, text: result.ok ? result.message : result.error })
    if (result.ok) {
      setUrl("")
      setTitle("")
      router.refresh()
    }
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
                const chosen = e.target.files?.[0] ?? null
                setFile(chosen)
                // A filename is a decent first guess at a title, and most of
                // this archive's titles began life exactly that way.
                if (chosen && !title) {
                  setTitle(
                    chosen.name
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
