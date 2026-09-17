"use client"

import { useCallback, useState } from "react"

/**
 * The parts `TopicSelect` and `AuthorSelect` share.
 *
 * They are the same control with different meanings — pick from what exists, or
 * name something new — so the mechanics and the look live here and the two keep
 * their own semantics. A topic is a shared entity with a public URL and an Owner
 * gate on creating one; an author is a piece of text on a single material that
 * anyone editing it may set. Forcing those into one component would mean a
 * component that has to be told which of them it is.
 */

/**
 * The nearest `<dialog>` ancestor, or `undefined` to portal to `<body>` as usual.
 *
 * **A dialog opened with `showModal()` is in the browser's top layer**, which
 * sits above everything in the normal stacking context regardless of `z-index`.
 * A popup portalled to `<body>` therefore renders underneath it: invisible, and
 * inert to clicks. It is not a `z-index` problem and no `z-index` fixes it — the
 * top layer is outside that system entirely.
 *
 * Found from the trigger rather than passed in as a prop, because otherwise
 * every call site has to know whether it happens to be inside a drawer, and the
 * one that forgets fails silently and invisibly. That is exactly how the topic
 * picker shipped unopenable in the add drawer.
 *
 * **`undefined`, never `null`, when there is no dialog.** Base UI reads an
 * explicit `container={null}` as "nowhere" rather than "the default", so the
 * popup mounts into nothing: `aria-expanded` flips to true, no listbox is
 * rendered, and the control looks dead in exactly the way it does when it is
 * hidden under a dialog. The first version of this fix returned `null` and so
 * broke every picker *outside* a drawer while fixing the one inside it.
 */
export function useDialogContainer() {
  const [container, setContainer] = useState<HTMLElement | undefined>(undefined)
  const ref = useCallback((node: HTMLElement | null) => {
    setContainer(node?.closest("dialog") ?? undefined)
  }, [])
  return { container, ref }
}

/** `min-h-11` is a 44px touch target — most of this admin is used on a phone. */
export const TRIGGER_CLASS =
  "flex w-full min-h-11 cursor-default items-center justify-between gap-3 rounded-[4px] border border-line bg-paper-2 px-3.5 py-2.5 text-left text-[14px] transition-colors select-none hover:border-ink focus-visible:border-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink disabled:opacity-40"

export const POPUP_CLASS =
  "max-h-[min(22rem,var(--available-height))] w-[var(--anchor-width)] min-w-[15rem] max-w-[var(--available-width)] origin-[var(--transform-origin)] overflow-hidden rounded-[4px] border border-line bg-paper shadow-lg"

/**
 * 16px on a coarse pointer. Below that, iOS zooms the page in on focus and
 * leaves the popup half off-screen.
 */
export const SEARCH_CLASS =
  "h-11 w-full border-b border-line-soft bg-paper-2 px-3.5 text-[14px] any-pointer-coarse:text-[16px] text-ink outline-none placeholder:text-taupe"

export const LIST_CLASS =
  "max-h-[min(18rem,calc(var(--available-height)-2.75rem))] overflow-y-auto overscroll-contain py-1"

export const ITEM_CLASS =
  "flex min-h-11 cursor-default items-center gap-2.5 px-3.5 py-2 text-[14px] outline-none select-none data-highlighted:bg-paper-3"
