"use client"

import { Combobox } from "@base-ui/react/combobox"
import { Check, ChevronsUpDown, Plus } from "lucide-react"
import { useCallback, useMemo, useState } from "react"

/**
 * Choosing a topic, from a list you can actually see.
 *
 * This replaces a bare text input whose menu only appeared once you had typed
 * something. With 69 topics and no way to open the list, filing meant guessing
 * a name — and "Uncategorised" is already the archive's largest shelf at 340
 * materials, so the picker is not the place to make someone guess.
 *
 * It is a select that can be searched, not a search that happens to select:
 * pressing it shows every topic, and typing narrows them. That is Base UI's
 * "input inside popup" arrangement, chosen over an input with a menu under it
 * because on a phone a popup can use the whole screen while an inline menu is
 * pinned beneath a field that the keyboard is about to cover.
 *
 * **It never renders chips of its own.** Both surfaces that use it already show
 * what is chosen underneath — the material page as rows naming who filed each
 * topic and when, the add form as removable pills — and a third copy inside the
 * control would be the same fact in two places, free to disagree.
 *
 * **The popup portals into the nearest `<dialog>`, not to `<body>`.** A dialog
 * opened with `showModal()` is in the browser's *top layer*, which sits above
 * everything in the normal stacking context no matter what `z-index` says. A
 * popup portalled to `<body>` therefore renders underneath it: invisible, and
 * inert to clicks. That is not a styling bug with a `z-index` fix — the top
 * layer is outside the z-index system entirely. It shipped exactly that way and
 * made the topic picker in the add drawer impossible to open.
 */

export type Topic = { id: string; name: string; total?: number }

/** A row that is not a topic yet. `creating` holds the name to create. */
type Row = Topic & { creating?: string }

export function TopicSelect({
  topics,
  selected,
  onSelect,
  onDeselect,
  onCreate,
  disabled = false,
  placeholder = "Choose a topic…",
  label,
  id,
}: {
  topics: Topic[]
  /** Ids already chosen. Drives the ticks, and what selecting again removes. */
  selected: string[]
  onSelect: (topic: Topic) => void
  onDeselect: (topic: Topic) => void
  /**
   * Owner only. Absent for everyone else, because a topic is a public URL and a
   * shelf in the library — see the note in `services/categories.ts`.
   */
  onCreate?: (name: string) => void
  disabled?: boolean
  placeholder?: string
  /** Rendered as a real label when there is no other visible one. */
  label?: string
  id?: string
}) {
  const [query, setQuery] = useState("")

  /**
   * The nearest dialog ancestor, or null to portal to `<body>` as usual.
   *
   * Found from the trigger rather than passed in: every call site would
   * otherwise have to know whether it happens to be inside a drawer, and the
   * one that forgot would fail silently and invisibly, which is precisely how
   * this went unnoticed.
   */
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const anchor = useCallback((node: HTMLButtonElement | null) => {
    setContainer(node?.closest("dialog") ?? null)
  }, [])

  const chosen = useMemo(() => new Set(selected), [selected])
  const trimmed = query.trim()

  /**
   * The create row is appended to the items rather than rendered beside them,
   * so it takes its turn in the keyboard order instead of being reachable only
   * by pointer.
   *
   * Offered only when nothing matches **exactly**, so a near-duplicate topic is
   * seen before another one is made. 19 of the 69 topics are used exactly once
   * already; the picker should not be an easy way to add a twentieth.
   */
  const rows = useMemo<Row[]>(() => {
    const exact = topics.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())
    if (!onCreate || trimmed.length < 2 || exact) return topics
    return [...topics, { id: `create:${trimmed.toLowerCase()}`, name: trimmed, creating: trimmed }]
  }, [topics, trimmed, onCreate])

  const value = useMemo(() => topics.filter((t) => chosen.has(t.id)), [topics, chosen])

  return (
    <Combobox.Root
      items={rows}
      multiple
      value={value}
      disabled={disabled}
      inputValue={query}
      onInputValueChange={setQuery}
      isItemEqualToValue={(a: Row, b: Row) => a.id === b.id}
      itemToStringLabel={(t: Row) => t.name}
      onOpenChange={(open) => {
        // A stale query is a list that opens already filtered to something the
        // person typed minutes ago and has forgotten about.
        if (!open) setQuery("")
      }}
      onValueChange={(next: Row[]) => {
        const creating = next.find((t) => t.creating)
        if (creating?.creating) {
          onCreate?.(creating.creating)
          setQuery("")
          return
        }

        const after = new Set(next.map((t) => t.id))
        const added = next.find((t) => !chosen.has(t.id))
        if (added) return onSelect(added)

        const removed = value.find((t) => !after.has(t.id))
        if (removed) onDeselect(removed)
      }}
    >
      {label ? (
        <Combobox.Label className="mb-1.5 block text-[13px] text-ink-2">{label}</Combobox.Label>
      ) : null}

      <Combobox.Trigger
        ref={anchor}
        id={id}
        className="flex w-full min-h-11 cursor-default items-center justify-between gap-3 rounded-[4px] border border-line bg-paper-2 px-3.5 py-2.5 text-left text-[14px] text-ink-2 transition-colors select-none hover:border-ink focus-visible:border-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink disabled:opacity-40"
      >
        <span className="truncate">{placeholder}</span>
        <Combobox.Icon className="flex-none text-taupe">
          <ChevronsUpDown size={15} />
        </Combobox.Icon>
      </Combobox.Trigger>

      <Combobox.Portal container={container}>
        <Combobox.Positioner align="start" sideOffset={4} className="z-50 outline-none">
          <Combobox.Popup
            aria-label="Topics"
            className="max-h-[min(22rem,var(--available-height))] w-[var(--anchor-width)] min-w-[15rem] max-w-[var(--available-width)] origin-[var(--transform-origin)] overflow-hidden rounded-[4px] border border-line bg-paper shadow-lg"
          >
            <Combobox.Input
              placeholder="Search topics…"
              /* 16px on a coarse pointer: below that, iOS zooms the page in on
                 focus and the popup is left half off-screen. */
              className="h-11 w-full border-b border-line-soft bg-paper-2 px-3.5 text-[14px] any-pointer-coarse:text-[16px] text-ink outline-none placeholder:text-taupe"
            />

            <Combobox.Empty className="px-3.5 py-3 text-[13px] text-taupe empty:p-0">
              {onCreate
                ? "No topic matches that."
                : "No topic matches that, and only an Owner can add one."}
            </Combobox.Empty>

            <Combobox.List className="max-h-[min(18rem,calc(var(--available-height)-2.75rem))] overflow-y-auto overscroll-contain py-1">
              {(topic: Row) => (
                <Combobox.Item
                  key={topic.id}
                  value={topic}
                  className={`flex min-h-11 cursor-default items-center gap-2.5 px-3.5 py-2 text-[14px] outline-none select-none data-highlighted:bg-paper-3 ${
                    topic.creating ? "border-t border-line-soft text-gold" : "text-ink-2"
                  }`}
                >
                  <span className="flex w-4 flex-none justify-center text-gold">
                    {topic.creating ? (
                      <Plus size={14} />
                    ) : (
                      <Combobox.ItemIndicator>
                        <Check size={14} />
                      </Combobox.ItemIndicator>
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {topic.creating ? `Create “${topic.creating}”` : topic.name}
                  </span>
                  {topic.total !== undefined && !topic.creating ? (
                    <span className="flex-none text-[11.5px] text-taupe">{topic.total}</span>
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
