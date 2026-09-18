"use client"

import { AlertCircle, Check, FileUp, Loader2, X } from "lucide-react"
import Script from "next/script"
import { useEffect, useRef, useState } from "react"
import { MAX_SUBMISSION, titleFromFilename } from "../../lib/upload/batch"
import { finishSubmission, startSubmission } from "../../server/services/submissions"
import { pool, putWithProgress } from "../admin/upload-queue"

/**
 * Sending something in.
 *
 * **Short on purpose**, and the reason is recorded from the owner rather than
 * invented: anyone who arrives wanting to contribute is doing us a favour, and
 * every field is a chance for them to decide it is not worth the time. So it
 * asks for the files, and then for nothing that is required. A title we can
 * correct later beats a form nobody finishes; the topic, the author and the year
 * are either inferred, filled in during review, or go unasked. The review queue
 * exists to catch what is missing, so the form does not have to.
 *
 * It reuses the admin queue's mechanics — `putWithProgress` because `fetch`
 * cannot report upload progress, and `pool` because fifty parallel PUTs from one
 * phone finish no sooner and make all of them look stalled. What it does not
 * reuse is the admin form's shape: an editor is filing, a visitor is giving.
 */

type Stage = "waiting" | "uploading" | "sending" | "done" | "failed"

type Item = {
  key: string
  file: File
  title: string
  stage: Stage
  progress: number
  message?: string
}

/** Cloudflare's widget, once it has loaded. */
declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string
      reset: (id?: string) => void
    }
  }
}

export function SubmitForm({ siteKey }: { siteKey: string }) {
  const [items, setItems] = useState<Item[]>([])
  const [from, setFrom] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [token, setToken] = useState("")
  /**
   * Set when the widget itself cannot run.
   *
   * Without this the form is a **dead button with no explanation**: the check
   * never completes, Send stays disabled for ever, and nothing on the page says
   * why. It happens for ordinary reasons — a site key not allowed for this
   * hostname (Turnstile error 110200, which is exactly what a first deploy
   * hits), a privacy extension blocking challenges.cloudflare.com, a network
   * that does not reach it. None of those are the visitor's fault and all of
   * them look identical to a broken site.
   */
  const [checkFailed, setCheckFailed] = useState(false)

  const fileInput = useRef<HTMLInputElement>(null)
  const widget = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const [scriptReady, setScriptReady] = useState(false)

  /**
   * Rendered explicitly rather than by the `cf-turnstile` class, so the token
   * lands in React state instead of a hidden input this form never reads.
   *
   * **Waiting for the script is the whole point of `scriptReady`.** The first
   * version ran this on mount alone, so it only worked when the Turnstile script
   * happened to be loaded already — from cache, or on a fast connection. On a
   * cold load `window.turnstile` was still undefined, the effect returned, and
   * nothing ever ran it again: no widget, no token, and a Send button that could
   * never be enabled. It failed exactly for the visitors least likely to try
   * twice.
   */
  useEffect(() => {
    const el = widget.current
    if (!scriptReady || !el || widgetId.current || !window.turnstile) return
    widgetId.current = window.turnstile.render(el, {
      sitekey: siteKey,
      callback: (value: string) => {
        setToken(value)
        setCheckFailed(false)
      },
      "expired-callback": () => setToken(""),
      "error-callback": () => {
        setToken("")
        setCheckFailed(true)
      },
      theme: "light",
    })
  }, [siteKey, scriptReady])

  const patch = (key: string, change: Partial<Item>) =>
    setItems((current) => current.map((i) => (i.key === key ? { ...i, ...change } : i)))

  const add = (chosen: FileList | null) => {
    if (!chosen?.length) return
    setNotice(null)

    const room = MAX_SUBMISSION - items.length
    const taking = Array.from(chosen).slice(0, Math.max(room, 0))
    if (taking.length < chosen.length) {
      setNotice({
        ok: false,
        text: `Up to ${MAX_SUBMISSION} at a time, so ${chosen.length - taking.length} were left out. Send those in a second batch.`,
      })
    }

    setItems((current) => [
      ...current,
      ...taking.map<Item>((file) => ({
        key: crypto.randomUUID(),
        file,
        title: titleFromFilename(file.name),
        stage: "waiting",
        progress: 0,
      })),
    ])
    if (fileInput.current) fileInput.current.value = ""
  }

  const send = async () => {
    const queue = items.filter((i) => i.stage !== "done")
    if (queue.length === 0) return
    if (!token) {
      return setNotice({ ok: false, text: "Please complete the check below first." })
    }

    setNotice(null)
    setBusy(true)

    const issued = await startSubmission({ token, count: queue.length })

    /**
     * The token is spent either way — Turnstile tokens are single use, so a
     * refusal leaves this one dead. Resetting the widget gives a fresh
     * challenge rather than a second press that fails identically and looks
     * like the form is broken.
     */
    setToken("")
    window.turnstile?.reset(widgetId.current ?? undefined)

    if (!issued.ok) {
      setBusy(false)
      return setNotice({ ok: false, text: issued.error })
    }

    await pool(queue, 3, async (item, index) => {
      const ticket = issued.tickets[index]
      if (!ticket) return patch(item.key, { stage: "failed", message: "No slot was issued." })

      patch(item.key, { stage: "uploading" })
      try {
        await putWithProgress(ticket.url, item.file, (fraction) =>
          patch(item.key, { progress: fraction }),
        )
      } catch (error) {
        return patch(item.key, {
          stage: "failed",
          message: error instanceof Error ? error.message : "The upload failed.",
        })
      }

      patch(item.key, { stage: "sending" })
      const result = await finishSubmission({
        uploadId: ticket.uploadId,
        filename: item.file.name,
        title: item.title,
        from,
        note,
      })
      patch(item.key, {
        stage: result.ok ? "done" : "failed",
        message: result.ok ? result.message : result.error,
      })
    })

    setBusy(false)
  }

  const sent = items.filter((i) => i.stage === "done").length
  const pending = items.filter((i) => i.stage !== "done")

  return (
    <div className="mt-8 max-w-xl">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        // `onReady` rather than `onLoad`: it fires on a cached script too, where
        // `onLoad` may not, and a cached script is the common case for anyone
        // who has been on the site before.
        onReady={() => setScriptReady(true)}
      />

      <label htmlFor="files" className="block text-[14px] text-ink-2">
        {items.length === 0 ? "Choose the PDFs" : "Add more"}
      </label>
      <input
        ref={fileInput}
        id="files"
        type="file"
        multiple
        accept="application/pdf,.pdf"
        disabled={busy}
        onChange={(e) => add(e.target.files)}
        className="mt-1.5 w-full rounded-[4px] border border-line bg-paper-2 px-3.5 py-2.5 text-[14px] file:mr-3 file:rounded-full file:border-0 file:bg-ink file:px-4 file:py-1.5 file:text-[13px] file:text-paper-2 disabled:opacity-40"
      />
      <p className="mt-1.5 text-[12.5px] text-taupe">
        Up to {MAX_SUBMISSION} at a time. We will read them, check them against what is already
        here, and put them in the library — nothing appears until someone has looked at it.
      </p>

      {items.length > 0 ? (
        <ul className="mt-5 flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.key} className="rounded-[4px] border border-line px-3.5 py-3">
              <div className="flex items-start gap-3">
                <FileUp size={15} className="mt-0.5 flex-none text-taupe" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px]">{item.title}</p>
                  <p className="mt-0.5 truncate text-[11.5px] text-taupe">{item.file.name}</p>
                </div>
                {item.stage === "waiting" && !busy ? (
                  <button
                    type="button"
                    onClick={() => setItems((c) => c.filter((i) => i.key !== item.key))}
                    aria-label={`Remove ${item.file.name}`}
                    className="flex-none text-taupe transition-colors hover:text-[#8c2f22]"
                  >
                    <X size={14} />
                  </button>
                ) : null}
              </div>

              {item.stage === "uploading" ? (
                <div
                  className="mt-2 h-1 overflow-hidden rounded-full bg-paper-3"
                  role="progressbar"
                  aria-valuenow={Math.round(item.progress * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label="Upload progress"
                >
                  <div
                    className="h-full bg-gold transition-[width] duration-200"
                    style={{ width: `${Math.round(item.progress * 100)}%` }}
                  />
                </div>
              ) : null}

              {item.stage === "sending" || item.stage === "done" || item.stage === "failed" ? (
                <p
                  role="status"
                  className={`mt-2 flex items-start gap-1.5 text-[11.5px] ${
                    item.stage === "failed"
                      ? "text-[#8c2f22]"
                      : item.stage === "done"
                        ? "text-forest"
                        : "text-taupe"
                  }`}
                >
                  {item.stage === "failed" ? (
                    <AlertCircle size={13} className="mt-0.5 flex-none" aria-hidden="true" />
                  ) : item.stage === "done" ? (
                    <Check size={13} className="mt-0.5 flex-none" aria-hidden="true" />
                  ) : (
                    <Loader2
                      size={13}
                      className="mt-0.5 flex-none animate-spin"
                      aria-hidden="true"
                    />
                  )}
                  <span>{item.message ?? "Sending…"}</span>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {/* Everything below here is optional, and says so. The owner's rule: ask
          for the file and almost nothing else. */}
      <div className="mt-6 border-t border-line-soft pt-5">
        <label htmlFor="from" className="block text-[13px] text-ink-2">
          Your name or email <span className="text-taupe">— optional</span>
        </label>
        <input
          id="from"
          value={from}
          disabled={busy}
          onChange={(e) => setFrom(e.target.value)}
          placeholder="So we can thank you, or ask if something is unclear"
          className="mt-1.5 w-full rounded-[4px] border border-line bg-paper-2 px-3.5 py-2.5 text-[14px] outline-none transition-colors focus:border-ink disabled:opacity-40"
        />

        <label htmlFor="note" className="mt-4 block text-[13px] text-ink-2">
          Anything we should know <span className="text-taupe">— optional</span>
        </label>
        <textarea
          id="note"
          rows={2}
          value={note}
          disabled={busy}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What it is, when it is from, who wrote it — whatever you happen to know"
          className="mt-1.5 w-full rounded-[4px] border border-line bg-paper-2 px-3.5 py-2.5 text-[14px] outline-none transition-colors focus:border-ink disabled:opacity-40"
        />
      </div>

      <div ref={widget} className="mt-5" />

      {checkFailed ? (
        <div className="mt-3 rounded-[4px] border-l-2 border-gold bg-paper-2 px-4 py-3">
          <p className="text-[13.5px] leading-relaxed text-ink-2">
            The spam check could not load, so this form cannot be sent right now. A privacy
            extension or a strict network will sometimes block it.
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-taupe">
            Please email what you have to the address on the{" "}
            <a href="/about" className="border-b border-line text-ink-3 hover:border-ink">
              about page
            </a>{" "}
            instead — we would still very much like it.
          </p>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={send}
          disabled={busy || pending.length === 0 || !token}
          className="rounded-full bg-ink px-5 py-2.5 text-[14px] font-medium text-paper-2 transition-colors hover:bg-forest-2 disabled:opacity-40"
        >
          {busy
            ? "Sending…"
            : pending.length > 1
              ? `Send ${pending.length} materials`
              : "Send it in"}
        </button>

        {notice ? (
          <p role="status" className={`text-[13px] ${notice.ok ? "text-ink-3" : "text-[#8c2f22]"}`}>
            {notice.text}
          </p>
        ) : null}

        {sent > 0 && pending.length === 0 ? (
          <p role="status" className="text-[13px] text-forest">
            {sent === 1 ? "Sent. Thank you." : `All ${sent} sent. Thank you.`}
          </p>
        ) : null}
      </div>
    </div>
  )
}
