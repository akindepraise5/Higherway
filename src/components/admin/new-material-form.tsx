"use client"

import { AlertCircle, Check, ChevronDown, FileUp, Link2, Loader2, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useCallback, useMemo, useRef, useState } from "react"
import {
  MAX_BATCH,
  titleFromFilename,
  titleFromUrl,
  titleIsUsable,
  UPLOAD_CONCURRENCY,
} from "../../lib/upload/batch"
import { finishUpload, importFromUrl, startUploads } from "../../server/services/uploads"
import { TopicSelect } from "./topic-select"
import { pool, putWithProgress } from "./upload-queue"

/**
 * Adding materials: files from this machine, or links.
 *
 * The files never pass through the app. `startUploads` returns one presigned URL
 * per file and the browser PUTs straight to R2, because Vercel refuses request
 * bodies over 4.5 MB and 8.6% of this archive is larger than 10 MB.
 *
 * **Several at a time, because that is how the archive arrives.** It used to
 * take exactly one file and one set of fields, so a folder of forty scans was
 * forty passes through the same form. A batch is not a new mechanism — the bytes
 * already bypass the server, so it is N parallel PUTs and N independent tasks —
 * what it needs is a queue, progress on each row, and a retry for the one that
 * fails without disturbing the rest.
 *
 * **Each row carries its own title, author and topics.** The obvious design is
 * one author and one set of topics for the whole batch, and it is wrong: a
 * folder of scans routinely holds several authors. *Apply to all* is offered as
 * a shortcut for when a batch does share one, and it fills the rows rather than
 * replacing them, so any row can still be corrected afterwards.
 *
 * Nothing here is made optional to make a batch bearable. The title is the only
 * field that is required, and it is *inferred* — from the filename, which is
 * where most of this archive's titles came from in the first place.
 */

export type PickableTopic = { id: string; name: string; total: number }

type Mode = "file" | "link"

type Stage = "waiting" | "uploading" | "handing over" | "done" | "failed"

type Item = {
  /** Local only. `crypto.randomUUID` so re-ordering never reuses a key. */
  key: string
  source: { kind: "file"; file: File } | { kind: "link"; url: string }
  title: string
  author: string
  topics: string[]
  stage: Stage
  /** 0–1 while uploading. Only a file has one; a link is fetched server-side. */
  progress: number
  message?: string
}

const labelOf = (item: Item) =>
  item.source.kind === "file" ? item.source.file.name : item.source.url

/**
 * A size a person can read. Below a megabyte it is shown in KB, because a
 * 400 KB scan rendered as "0.4 MB" is fine but a 40 KB one as "0.0 MB" reads as
 * an empty file.
 */
const sizeOf = (item: Item) => {
  if (item.source.kind !== "file") return "link"
  const bytes = item.source.file.size
  return bytes < 1_048_576
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1_048_576).toFixed(1)} MB`
}

export function NewMaterialForm({
  jobsConfigured,
  topics,
  onBusyChange,
  onDone,
}: {
  jobsConfigured: boolean
  topics: PickableTopic[]
  /** Lets a drawer refuse to close while an upload is still in flight. */
  onBusyChange?: (busy: boolean) => void
  onDone?: () => void
}) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>("file")
  const [items, setItems] = useState<Item[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [links, setLinks] = useState("")
  const [open, setOpen] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const working = useCallback(
    (state: boolean) => {
      setBusy(state)
      onBusyChange?.(state)
    },
    [onBusyChange],
  )

  const patch = useCallback((key: string, change: Partial<Item>) => {
    setItems((current) => current.map((i) => (i.key === key ? { ...i, ...change } : i)))
  }, [])

  const pending = useMemo(() => items.filter((i) => i.stage !== "done"), [items])
  const failed = useMemo(() => items.filter((i) => i.stage === "failed"), [items])
  const ready = pending.length > 0 && pending.every((i) => titleIsUsable(i.title))

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

  const addFiles = (chosen: FileList | null) => {
    if (!chosen || chosen.length === 0) return
    setNotice(null)

    const room = MAX_BATCH - items.length
    const taking = Array.from(chosen).slice(0, Math.max(room, 0))
    if (taking.length < chosen.length) {
      setNotice({
        ok: false,
        text: `Only ${MAX_BATCH} files at a time. ${chosen.length - taking.length} were left out — send them in a second batch.`,
      })
    }

    setItems((current) => [
      ...current,
      ...taking.map<Item>((file) => ({
        key: crypto.randomUUID(),
        source: { kind: "file", file },
        title: titleFromFilename(file.name),
        author: "",
        topics: [],
        stage: "waiting",
        progress: 0,
      })),
    ])

    // Without this, choosing the same file again after removing it fires no
    // change event and nothing appears to happen.
    if (fileInput.current) fileInput.current.value = ""
  }

  const addLinks = () => {
    const urls = links
      .split(/[\n,]/)
      .map((l) => l.trim())
      .filter(Boolean)
    if (urls.length === 0) return setNotice({ ok: false, text: "Paste at least one link." })

    setNotice(null)
    setItems((current) => [
      ...current,
      ...urls.slice(0, MAX_BATCH - current.length).map<Item>((url) => ({
        key: crypto.randomUUID(),
        source: { kind: "link", url },
        title: titleFromUrl(url),
        author: "",
        topics: [],
        stage: "waiting",
        progress: 0,
      })),
    ])
    setLinks("")
  }

  /** Fill every row that has not been given one. Never overwrites an answer. */
  const applyToAll = (change: { author?: string; topics?: string[] }) => {
    setItems((current) =>
      current.map((i) =>
        i.stage === "done"
          ? i
          : {
              ...i,
              author: change.author !== undefined && !i.author ? change.author : i.author,
              topics:
                change.topics !== undefined && i.topics.length === 0 ? change.topics : i.topics,
            },
      ),
    )
  }

  const send = async () => {
    const queue = items.filter((i) => i.stage !== "done" && i.stage !== "uploading")
    if (queue.length === 0) return

    setNotice(null)
    working(true)

    const files = queue.filter((i) => i.source.kind === "file")
    const linked = queue.filter((i) => i.source.kind === "link")

    /**
     * Tickets for the whole batch in one call. They are matched to rows by
     * position, so nothing here may reorder `files` after this point.
     */
    let tickets: { uploadId: string; url: string }[] = []
    if (files.length > 0) {
      const issued = await startUploads(files.length)
      if (!issued.ok) {
        working(false)
        return setNotice({ ok: false, text: issued.error })
      }
      tickets = issued.tickets
    }

    for (const item of queue) patch(item.key, { stage: "waiting", progress: 0, message: undefined })

    await pool(files, UPLOAD_CONCURRENCY, async (item, index) => {
      const ticket = tickets[index]
      if (!ticket)
        return patch(item.key, { stage: "failed", message: "No upload slot was issued." })

      patch(item.key, { stage: "uploading" })
      try {
        if (item.source.kind !== "file") return
        await putWithProgress(ticket.url, item.source.file, (fraction) =>
          patch(item.key, { progress: fraction }),
        )
      } catch (error) {
        return patch(item.key, {
          stage: "failed",
          message: error instanceof Error ? error.message : "The upload failed.",
        })
      }

      patch(item.key, { stage: "handing over" })
      const result = await finishUpload({
        uploadId: ticket.uploadId,
        title: item.title,
        author: item.author,
        categoryIds: item.topics,
      })
      patch(item.key, {
        stage: result.ok ? "done" : "failed",
        message: result.ok ? result.message : result.error,
      })
    })

    await pool(linked, UPLOAD_CONCURRENCY, async (item) => {
      if (item.source.kind !== "link") return
      patch(item.key, { stage: "handing over" })
      const result = await importFromUrl({
        url: item.source.url,
        title: item.title.trim() || undefined,
        author: item.author.trim() || undefined,
        categoryIds: item.topics,
      })
      patch(item.key, {
        stage: result.ok ? "done" : "failed",
        message: result.ok ? result.message : result.error,
      })
    })

    working(false)
    router.refresh()
  }

  const done = items.filter((i) => i.stage === "done").length
  const settled = items.length > 0 && !busy && pending.length === 0

  return (
    <div className="mt-8 max-w-xl">
      <div className="flex gap-2">
        {(
          [
            ["file", "Upload files", FileUp],
            ["link", "Import links", Link2],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            disabled={busy}
            onClick={() => {
              setMode(value)
              setNotice(null)
            }}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13.5px] transition-colors disabled:opacity-40 ${
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

      <div className="mt-6">
        {mode === "file" ? (
          <>
            <label htmlFor="pdf" className="block text-[13px] text-ink-2">
              {/* The input clears itself after each pick, so that choosing the
                  same file twice still fires a change event. Left saying "The
                  PDFs" it would then read "No file chosen" above a queue of
                  forty, so it says what the control does now instead. */}
              {items.length === 0 ? "The PDFs — choose as many as you like" : "Add more PDFs"}
            </label>
            <input
              ref={fileInput}
              id="pdf"
              type="file"
              multiple
              accept="application/pdf,.pdf"
              disabled={busy}
              onChange={(e) => addFiles(e.target.files)}
              className="mt-1.5 w-full rounded-[4px] border border-line bg-paper-2 px-3.5 py-2.5 text-[14px] file:mr-3 file:rounded-full file:border-0 file:bg-ink file:px-4 file:py-1.5 file:text-[13px] file:text-paper-2 disabled:opacity-40"
            />
            <p className="mt-1.5 text-[12px] text-taupe">
              Each one keeps its own title, author and topics. Up to {MAX_BATCH} at a time
              {items.length > 0 ? ` — ${MAX_BATCH - items.length} left` : ""}.
            </p>
          </>
        ) : (
          <>
            <label htmlFor="links" className="block text-[13px] text-ink-2">
              Links to PDFs — one per line
            </label>
            <textarea
              id="links"
              rows={3}
              value={links}
              disabled={busy}
              onChange={(e) => setLinks(e.target.value)}
              placeholder={"https://example.com/a-material.pdf\nhttps://example.com/another.pdf"}
              className="mt-1.5 w-full rounded-[4px] border border-line bg-paper-2 px-3.5 py-2.5 text-[14px] outline-none transition-colors focus:border-ink disabled:opacity-40"
            />
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={addLinks}
                disabled={busy || links.trim().length === 0}
                className="rounded-full border border-line px-4 py-2 text-[13px] text-ink-2 transition-colors hover:border-ink disabled:opacity-40"
              >
                Add to the queue
              </button>
              <p className="text-[12px] text-taupe">
                Each is checked as a real PDF by its own header, and private addresses are refused.
              </p>
            </div>
          </>
        )}
      </div>

      {items.length > 1 ? (
        <ApplyToAll topics={topics} disabled={busy} onApply={applyToAll} count={items.length} />
      ) : null}

      {items.length > 0 ? (
        <ul className="mt-5 flex flex-col gap-2">
          {items.map((item) => (
            <Row
              key={item.key}
              item={item}
              topics={topics}
              /* A lone file behaves exactly as the old single form did: its
                 fields are simply there, with nothing to open first. */
              expanded={items.length === 1 || open === item.key}
              onToggle={() => setOpen((current) => (current === item.key ? null : item.key))}
              onChange={(change) => patch(item.key, change)}
              onRemove={() => setItems((c) => c.filter((i) => i.key !== item.key))}
              busy={busy}
              label={labelOf(item)}
              size={sizeOf(item)}
            />
          ))}
        </ul>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={send}
          disabled={busy || !ready}
          className="rounded-full bg-ink px-5 py-2.5 text-[13.5px] font-medium text-paper-2 transition-colors hover:bg-forest-2 disabled:opacity-40"
        >
          {busy
            ? "Sending…"
            : failed.length > 0 && failed.length === pending.length
              ? `Try ${failed.length === 1 ? "it" : `those ${failed.length}`} again`
              : pending.length > 1
                ? `Send ${pending.length} materials`
                : "Send it"}
        </button>

        {settled ? (
          <button
            type="button"
            onClick={() => {
              setItems([])
              onDone?.()
            }}
            className="rounded-full border border-line px-4 py-2 text-[13px] text-ink-2 transition-colors hover:border-ink"
          >
            Close
          </button>
        ) : null}

        {notice ? (
          <p role="status" className={`text-[13px] ${notice.ok ? "text-ink-3" : "text-[#8c2f22]"}`}>
            {notice.text}
          </p>
        ) : null}

        {/* One line for the batch, so a queue of fifty does not have to be
            scrolled to learn whether it worked. */}
        {done > 0 ? (
          <p role="status" className="text-[13px] text-ink-3">
            {done} of {items.length} sent
            {failed.length > 0 ? `, ${failed.length} to retry` : ""}.
          </p>
        ) : null}
      </div>

      <p className="mt-6 text-[12.5px] leading-relaxed text-taupe">
        Each arrives waiting to be published, not in the library. A file the archive already holds
        byte for byte is recognised and refused rather than added twice.
      </p>
    </div>
  )
}

/**
 * The shortcut for a batch that really does share an author or a topic.
 *
 * It fills rows that have been left empty and never overwrites one that has
 * been answered, because the whole reason the fields are per-file is that a
 * folder of scans holds several authors — a control that flattened them would
 * undo the thing it sits above.
 */
function ApplyToAll({
  topics,
  count,
  disabled,
  onApply,
}: {
  topics: PickableTopic[]
  count: number
  disabled: boolean
  onApply: (change: { author?: string; topics?: string[] }) => void
}) {
  const [author, setAuthor] = useState("")
  const [chosen, setChosen] = useState<string[]>([])

  const nothingToApply = author.trim().length === 0 && chosen.length === 0

  return (
    <div className="mt-5 rounded-[4px] border border-line-soft bg-paper-2 px-4 py-3.5">
      <p className="text-[13px] text-ink-2">Same for all {count}?</p>
      <p className="mt-1 text-[12px] leading-relaxed text-taupe">
        Optional. This fills the rows you have left empty — anything already answered stays as it
        is, and every row can still be changed afterwards.
      </p>

      <div className="mt-3 flex flex-col gap-2.5">
        <div>
          <label htmlFor="all-author" className="sr-only">
            Author for all {count}
          </label>
          <input
            id="all-author"
            value={author}
            disabled={disabled}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Author"
            className="w-full rounded-[4px] border border-line bg-paper px-3.5 py-2.5 text-[14px] outline-none transition-colors focus:border-ink disabled:opacity-40"
          />
        </div>

        <TopicSelect
          id="all-topics"
          topics={topics}
          selected={chosen}
          disabled={disabled}
          onSelect={(t) => setChosen((c) => [...c, t.id])}
          onDeselect={(t) => setChosen((c) => c.filter((x) => x !== t.id))}
          placeholder={chosen.length === 0 ? "Topics" : `${chosen.length} topics`}
        />

        <button
          type="button"
          disabled={disabled || nothingToApply}
          onClick={() => {
            onApply({
              author: author.trim() || undefined,
              topics: chosen.length > 0 ? chosen : undefined,
            })
            setAuthor("")
            setChosen([])
          }}
          className="self-start rounded-full border border-line px-4 py-2 text-[13px] text-ink-2 transition-colors hover:border-ink disabled:opacity-40"
        >
          Apply to all {count}
        </button>
      </div>
    </div>
  )
}

/** One queued file or link: what it will be called, and how it is getting on. */
function Row({
  item,
  topics,
  expanded,
  onToggle,
  onChange,
  onRemove,
  busy,
  label,
  size,
}: {
  item: Item
  topics: PickableTopic[]
  expanded: boolean
  onToggle: () => void
  onChange: (change: Partial<Item>) => void
  onRemove: () => void
  busy: boolean
  label: string
  size: string
}) {
  const locked = busy || item.stage === "done"
  const titleId = `title-${item.key}`
  const authorId = `author-${item.key}`

  return (
    <li className="rounded-[4px] border border-line px-3.5 py-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor={titleId} className="sr-only">
            Title for {label}
          </label>
          <input
            id={titleId}
            value={item.title}
            disabled={locked}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Give it a title"
            aria-invalid={!titleIsUsable(item.title)}
            className="w-full rounded-[4px] border border-line bg-paper-2 px-3 py-2 text-[14px] outline-none transition-colors focus:border-ink disabled:opacity-60 aria-[invalid=true]:border-[#8c2f22]"
          />
          <p className="mt-1 truncate text-[11.5px] text-taupe" title={label}>
            {label} · {size}
          </p>
        </div>

        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          aria-label={`Remove ${label}`}
          className="mt-1.5 flex-none text-taupe transition-colors hover:text-[#8c2f22] disabled:opacity-30"
        >
          <X size={14} />
        </button>
      </div>

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={`details-${item.key}`}
        className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-taupe transition-colors hover:text-ink"
      >
        <ChevronDown
          size={13}
          className={`transition-transform ${expanded ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
        {item.author || item.topics.length > 0
          ? [item.author, item.topics.length > 0 ? `${item.topics.length} topics` : null]
              .filter(Boolean)
              .join(" · ")
          : "Author and topics"}
      </button>

      {expanded ? (
        <div id={`details-${item.key}`} className="mt-2.5 flex flex-col gap-2.5">
          <div>
            <label htmlFor={authorId} className="sr-only">
              Author for {label}
            </label>
            <input
              id={authorId}
              value={item.author}
              disabled={locked}
              onChange={(e) => onChange({ author: e.target.value })}
              placeholder="Author (leave empty if it is not credited)"
              className="w-full rounded-[4px] border border-line bg-paper-2 px-3 py-2 text-[13.5px] outline-none transition-colors focus:border-ink disabled:opacity-60"
            />
          </div>

          <TopicSelect
            topics={topics}
            selected={item.topics}
            disabled={locked}
            onSelect={(t) => onChange({ topics: [...item.topics, t.id] })}
            onDeselect={(t) => onChange({ topics: item.topics.filter((x) => x !== t.id) })}
            placeholder={
              item.topics.length === 0
                ? "Uncategorised — choose topics"
                : `${item.topics.length} ${item.topics.length === 1 ? "topic" : "topics"}`
            }
          />
        </div>
      ) : null}

      <Status item={item} />
    </li>
  )
}

function Status({ item }: { item: Item }) {
  if (item.stage === "waiting") return null

  if (item.stage === "uploading") {
    return (
      <div className="mt-2.5">
        <div
          className="h-1 w-full overflow-hidden rounded-full bg-paper-3"
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
        <p className="mt-1 text-[11.5px] text-taupe">
          Uploading {Math.round(item.progress * 100)}%
        </p>
      </div>
    )
  }

  const tone =
    item.stage === "failed"
      ? "text-[#8c2f22]"
      : item.stage === "done"
        ? "text-forest"
        : "text-taupe"

  const Icon = item.stage === "failed" ? AlertCircle : item.stage === "done" ? Check : Loader2

  return (
    <p role="status" className={`mt-2.5 flex items-start gap-1.5 text-[11.5px] ${tone}`}>
      <Icon
        size={13}
        className={`mt-0.5 flex-none ${item.stage === "handing over" ? "animate-spin" : ""}`}
        aria-hidden="true"
      />
      <span>{item.message ?? (item.stage === "done" ? "Sent." : "Handing it over…")}</span>
    </p>
  )
}
