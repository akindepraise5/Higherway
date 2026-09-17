"use client"

import { Combobox } from "@base-ui/react/combobox"
import { Check, ChevronsUpDown, Plus, X } from "lucide-react"
import { useMemo, useState } from "react"
import {
  ITEM_CLASS,
  LIST_CLASS,
  POPUP_CLASS,
  SEARCH_CLASS,
  TRIGGER_CLASS,
  useDialogContainer,
} from "./combobox-parts"

/**
 * Choosing an author, from the ones the archive already credits.
 *
 * Typing a name out every time is how a name ends up spelled three ways. The
 * library filters by **exact** match — a chip click must not make
 * "Rev. Darrel Lee" also collect "Darrel Lee Jr" — so "Rev Darrel Lee" and
 * "Rev. Darrel Lee" are simply two different authors, each with half the
 * materials and neither findable from the other. Picking from a list is what
 * stops that happening, and it is cheap: only 4 materials are credited so far,
 * so the list is short and every entry on it should be reused rather than
 * retyped.
 *
 * **Anyone may add one, and no confirmation is asked.** Unlike a topic, an
 * author is not a shared entity with a public URL and a shelf in the library —
 * it is a piece of text on one material. Getting it wrong costs an edit.
 *
 * **Empty is a real answer.** Most of this archive is unattributed, so clearing
 * is a first-class action rather than something to work around, and it stores
 * `null` rather than `""` — an empty string passes every "is it set?" check and
 * then renders as a blank byline.
 */

type Row = { name: string; count?: number; creating?: boolean }

export function AuthorSelect({
  authors,
  value,
  onChange,
  disabled = false,
  id,
  placeholder = "Not credited",
}: {
  /** Names already used, busiest first. */
  authors: { name: string; count: number }[]
  /** The chosen name, or "" for unattributed. */
  value: string
  onChange: (name: string) => void
  disabled?: boolean
  id?: string
  placeholder?: string
}) {
  const [query, setQuery] = useState("")
  const { container, ref } = useDialogContainer()

  const trimmed = query.trim()

  const rows = useMemo<Row[]>(() => {
    const known: Row[] = authors.map((a) => ({ name: a.name, count: a.count }))
    if (trimmed.length < 2) return known

    // Offered only when nothing matches exactly, so an existing spelling is
    // seen before a second one is made — the whole point of the control.
    const exact = authors.some((a) => a.name.toLowerCase() === trimmed.toLowerCase())
    return exact ? known : [...known, { name: trimmed, creating: true }]
  }, [authors, trimmed])

  const selected = useMemo<Row | null>(
    () => (value ? (rows.find((r) => r.name === value) ?? { name: value }) : null),
    [rows, value],
  )

  return (
    <Combobox.Root
      items={rows}
      value={selected}
      disabled={disabled}
      inputValue={query}
      onInputValueChange={setQuery}
      isItemEqualToValue={(a: Row, b: Row) => a.name === b.name}
      itemToStringLabel={(row: Row) => row.name}
      onOpenChange={(open) => {
        if (!open) setQuery("")
      }}
      onValueChange={(next: Row | null) => {
        onChange(next?.name ?? "")
        setQuery("")
      }}
    >
      <div className="relative">
        <Combobox.Trigger
          ref={ref}
          id={id}
          className={`${TRIGGER_CLASS} ${value ? "text-ink-2" : "text-taupe"} ${value ? "pr-10" : ""}`}
        >
          <span className="truncate">{value || placeholder}</span>
          <Combobox.Icon className="flex-none text-taupe">
            <ChevronsUpDown size={15} />
          </Combobox.Icon>
        </Combobox.Trigger>

        {/* Clearing sits outside the trigger, not as an item in the list.
            "Unattributed" is not one author among many — it is the absence of
            one, and most of this archive is in that state. */}
        {value && !disabled ? (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Clear the author"
            title="Not credited"
            className="absolute right-9 top-1/2 -translate-y-1/2 text-taupe transition-colors hover:text-[#8c2f22]"
          >
            <X size={14} />
          </button>
        ) : null}
      </div>

      <Combobox.Portal container={container}>
        <Combobox.Positioner align="start" sideOffset={4} className="z-50 outline-none">
          <Combobox.Popup aria-label="Authors" className={POPUP_CLASS}>
            <Combobox.Input placeholder="Search or type a new name…" className={SEARCH_CLASS} />

            <Combobox.Empty className="px-3.5 py-3 text-[13px] text-taupe empty:p-0">
              {authors.length === 0
                ? "No author has been credited yet. Type a name to add the first."
                : "No author matches that."}
            </Combobox.Empty>

            <Combobox.List className={LIST_CLASS}>
              {(row: Row) => (
                <Combobox.Item
                  key={row.creating ? `create:${row.name}` : row.name}
                  value={row}
                  className={`${ITEM_CLASS} ${
                    row.creating ? "border-t border-line-soft text-gold" : "text-ink-2"
                  }`}
                >
                  <span className="flex w-4 flex-none justify-center text-gold">
                    {row.creating ? (
                      <Plus size={14} />
                    ) : (
                      <Combobox.ItemIndicator>
                        <Check size={14} />
                      </Combobox.ItemIndicator>
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {row.creating ? `Credit it to “${row.name}”` : row.name}
                  </span>
                  {row.count !== undefined && !row.creating ? (
                    <span className="flex-none text-[11.5px] text-taupe">{row.count}</span>
                  ) : null}
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}
