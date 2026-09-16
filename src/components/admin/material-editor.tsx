"use client"

import { useState, useTransition } from "react"
import {
  archiveMaterial,
  publishMaterial,
  setTextPublic,
  unarchiveMaterial,
  updateMaterial,
} from "../../server/services/materials"
import { ConfirmDialog } from "./confirm-dialog"

/**
 * Correcting a material, and deciding whether it is in the library.
 *
 * The services behind all of this already existed and audited every change;
 * nothing on the page called them, so a title imported from a filename could
 * not be fixed without a database client.
 *
 * The two halves are gated differently on the server and shown differently
 * here: anyone may correct details, while publishing and archiving are Admin
 * work, because they decide what the archive says in public.
 *
 * Archiving asks for a reason in the dialog itself. CLAUDE.md defines archiving
 * as a soft state with a reason and an actor, and a reason collected after the
 * fact is a reason nobody writes.
 */

type Props = {
  materialId: string
  title: string
  author: string | null
  summary: string | null
  status: string
  archived: boolean
  hasFile: boolean
  textPublic: boolean
  canModerate: boolean
}

type Notice = { ok: boolean; text: string } | null

export function MaterialEditor({
  materialId,
  title,
  author,
  summary,
  status,
  archived,
  hasFile,
  textPublic,
  canModerate,
}: Props) {
  const [pending, start] = useTransition()
  const [notice, setNotice] = useState<Notice>(null)

  const [nextTitle, setNextTitle] = useState(title)
  const [nextAuthor, setNextAuthor] = useState(author ?? "")
  const [nextSummary, setNextSummary] = useState(summary ?? "")

  const [confirming, setConfirming] = useState<null | "archive" | "publish">(null)
  const [reason, setReason] = useState("")

  const run = (action: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const result = await action()
      setNotice({
        ok: result.ok,
        text: result.ok ? (result.message ?? "Done.") : (result.error ?? "That did not work."),
      })
      if (result.ok) setConfirming(null)
    })

  const dirty =
    nextTitle.trim() !== title ||
    nextAuthor.trim() !== (author ?? "") ||
    nextSummary.trim() !== (summary ?? "")

  return (
    <div className="mt-10 border-t border-line-soft pt-8">
      <h2 className="text-[11px] font-medium uppercase tracking-[.2em] text-taupe">Details</h2>

      <form
        className="mt-4 max-w-xl"
        onSubmit={(e) => {
          e.preventDefault()
          run(() =>
            updateMaterial(materialId, {
              title: nextTitle,
              author: nextAuthor,
              summary: nextSummary,
            }),
          )
        }}
      >
        <label htmlFor="title" className="block text-[13px] text-ink-2">
          Title
        </label>
        <input
          id="title"
          value={nextTitle}
          onChange={(e) => setNextTitle(e.target.value)}
          className="mt-1.5 w-full rounded-[4px] border border-line bg-paper-2 px-3.5 py-2.5 text-[14.5px] outline-none transition-colors focus:border-ink"
        />
        <p className="mt-1.5 text-[12px] text-taupe">
          Many titles came from filenames. The public URL does not change when you fix one.
        </p>

        <label htmlFor="author" className="mt-5 block text-[13px] text-ink-2">
          Author
        </label>
        <input
          id="author"
          value={nextAuthor}
          onChange={(e) => setNextAuthor(e.target.value)}
          placeholder="Unknown"
          className="mt-1.5 w-full rounded-[4px] border border-line bg-paper-2 px-3.5 py-2.5 text-[14.5px] outline-none transition-colors focus:border-ink"
        />

        <label htmlFor="summary" className="mt-5 block text-[13px] text-ink-2">
          Summary
        </label>
        <textarea
          id="summary"
          value={nextSummary}
          onChange={(e) => setNextSummary(e.target.value)}
          rows={3}
          placeholder="A sentence or two. Shown on the material's page and in search results."
          className="mt-1.5 w-full resize-y rounded-[4px] border border-line bg-paper-2 px-3.5 py-2.5 text-[14.5px] leading-relaxed outline-none transition-colors focus:border-ink"
        />

        <div className="mt-4 flex items-center gap-3">
          <button
            type="submit"
            disabled={pending || !dirty}
            className="rounded-full bg-ink px-5 py-2.5 text-[13.5px] font-medium text-paper-2 transition-colors hover:bg-forest-2 disabled:opacity-40"
          >
            {pending ? "Saving…" : "Save details"}
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

      <div className="mt-8 border-t border-line-soft pt-6">
        <label className="flex max-w-xl cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={textPublic}
            disabled={pending}
            onChange={(e) => run(() => setTextPublic(materialId, e.target.checked))}
            className="mt-0.5 h-4 w-4 flex-none accent-[#1A231E]"
          />
          <span>
            <span className="block text-[13.5px] text-ink-2">Show the read text publicly</span>
            <span className="mt-0.5 block text-[12px] leading-relaxed text-taupe">
              It is what makes a photographed page findable on Google. Turn it off when a read has
              come out badly, until it can be run again.
            </span>
          </span>
        </label>
      </div>

      {canModerate ? (
        <div className="mt-8 border-t border-line-soft pt-6">
          <h2 className="text-[11px] font-medium uppercase tracking-[.2em] text-taupe">
            In the library
          </h2>
          <p className="mt-2 text-[13px] text-ink-3">
            This material is <span className="text-ink">{status}</span>.
          </p>

          <div className="mt-4 flex flex-wrap gap-2.5">
            {!archived && status !== "published" ? (
              <button
                type="button"
                disabled={pending || !hasFile}
                onClick={() => setConfirming("publish")}
                className="rounded-full bg-ink px-5 py-2.5 text-[13.5px] font-medium text-paper-2 transition-colors hover:bg-forest-2 disabled:opacity-40"
              >
                Publish
              </button>
            ) : null}

            {!archived ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirming("archive")}
                className="rounded-full border border-line px-5 py-2.5 text-[13.5px] transition-colors hover:border-[#8c2f22] hover:text-[#8c2f22] disabled:opacity-40"
              >
                Take out of the library
              </button>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => unarchiveMaterial(materialId))}
                className="rounded-full border border-line px-5 py-2.5 text-[13.5px] transition-colors hover:border-ink disabled:opacity-40"
              >
                Restore it
              </button>
            )}
          </div>

          {!hasFile && status !== "published" ? (
            <p className="mt-3 text-[12.5px] text-taupe">
              There is no file in storage for this one yet, so it cannot be published.
            </p>
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirming === "publish"}
        title="Publish this material?"
        description="It becomes readable by anyone, and appears in the library and in search engines."
        confirmLabel="Publish"
        destructive={false}
        busy={pending}
        onConfirm={() => run(() => publishMaterial(materialId))}
        onCancel={() => setConfirming(null)}
      />

      <ConfirmDialog
        open={confirming === "archive"}
        title="Take it out of the library?"
        description={
          <>
            <p>
              It stops being public straight away. Nothing is deleted, and it can be restored — but
              whoever finds it later will only have what you write here to go on.
            </p>
            <label htmlFor="archive-reason" className="mt-4 block text-[12.5px] text-ink-3">
              Why is it being archived?
            </label>
            <input
              id="archive-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoComplete="off"
              placeholder="A duplicate of another material, a bad scan…"
              className="mt-2 w-full rounded border border-line bg-paper-2 px-3 py-2.5 text-[14px] outline-none transition-colors focus:border-ink"
            />
          </>
        }
        confirmLabel="Take it out"
        busy={pending}
        onConfirm={() => run(() => archiveMaterial(materialId, reason))}
        onCancel={() => {
          setConfirming(null)
          setReason("")
        }}
      />
    </div>
  )
}
