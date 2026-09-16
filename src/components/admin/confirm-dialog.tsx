"use client"

import { AlertTriangle } from "lucide-react"
import { useEffect, useRef, useState } from "react"

/**
 * Confirmation before an action that is hard or impossible to take back.
 *
 * This exists because it was missing. Category merge shipped behind a `<select>`
 * whose onChange fired immediately, and a single stray click moved 42 materials
 * out of Faith. Reversing it was only possible because the v1 spreadsheet still
 * records the original filing — a category created after the import would have
 * been unrecoverable, because merge moves rows with an UPDATE and the audit
 * entry records how many moved, not which.
 *
 * So for the destructive cases the dialog asks for the category's name to be
 * typed. A button press is one slip; typing "Faith" is a decision.
 *
 * Built on the native <dialog>, which gives focus trapping, Escape to close and
 * correct semantics without a library or a focus-management hook.
 */

export type ConfirmProps = {
  open: boolean
  title: string
  /** What will happen, in plain words, including anything irreversible. */
  description: React.ReactNode
  confirmLabel: string
  /** When set, the action stays disabled until this exact text is typed. */
  confirmPhrase?: string
  destructive?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  confirmPhrase,
  destructive = true,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const [typed, setTyped] = useState("")

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return

    if (open && !dialog.open) {
      setTyped("")
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  const ready = !confirmPhrase || typed.trim() === confirmPhrase

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault()
        onCancel()
      }}
      className="m-auto w-[min(92vw,30rem)] rounded-[4px] border border-line bg-paper p-0 text-ink backdrop:bg-forest/40 backdrop:backdrop-blur-[2px]"
    >
      {/* Escape is handled by onCancel above; the backdrop is inert by
          design rather than carrying a mouse-only dismiss handler. */}
      <div className="p-6">
        <div className="flex items-start gap-3">
          {destructive ? (
            <span className="mt-0.5 text-[#8c2f22]">
              <AlertTriangle size={20} strokeWidth={1.75} />
            </span>
          ) : null}
          <div>
            <h2 className="font-serif text-[22px] font-light tracking-[-0.015em]">{title}</h2>
            <div className="mt-2.5 text-[14px] leading-relaxed text-ink-2">{description}</div>
          </div>
        </div>

        {confirmPhrase ? (
          <div className="mt-5">
            <label htmlFor="confirm-phrase" className="text-[12.5px] text-ink-3">
              Type <span className="font-medium text-ink">{confirmPhrase}</span> to continue
            </label>
            <input
              id="confirm-phrase"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              className="mt-2 w-full rounded border border-line bg-paper-2 px-3 py-2.5 text-[14px] outline-none transition-colors focus:border-ink"
            />
          </div>
        ) : null}

        <div className="mt-6 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-line px-5 py-2.5 text-[13.5px] transition-colors hover:border-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!ready || busy}
            onClick={onConfirm}
            className={`rounded-full px-5 py-2.5 text-[13.5px] font-medium text-paper-2 transition-colors disabled:opacity-40 ${
              destructive ? "bg-[#8c2f22] hover:bg-[#6f2419]" : "bg-ink hover:bg-forest-2"
            }`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  )
}
