/**
 * A table that can be read on a phone.
 *
 * Every admin table used to sit in `overflow-hidden`, which does not shorten a
 * wide table — it *clips* it. On a narrow screen the right-hand columns were
 * simply unreachable, and the materials table went further and hid them at
 * `sm:`/`md:`/`lg:`, so the data did not exist rather than sitting off-screen.
 *
 * Horizontal scroll instead, with the first column pinned. A table you scroll
 * sideways is only useful if you can still tell which row you are on, and the
 * first column is always the thing the row is about — the material, the topic,
 * the person.
 *
 * `minWidth` is what stops the columns squeezing into unreadable slivers
 * instead of scrolling. Below it the table scrolls; above it nothing moves and
 * the desktop layout is unchanged.
 */
export function TableScroll({
  minWidth = "48rem",
  className = "",
  children,
}: {
  /** The width below which the table scrolls rather than compresses. */
  minWidth?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={`overflow-x-auto rounded-[3px] border border-line-soft ${className}`}>
      <table className="w-full border-collapse text-left" style={{ minWidth }}>
        {children}
      </table>
    </div>
  )
}

/**
 * The classes that pin a cell to the left edge while the rest scrolls under it.
 *
 * A pinned cell needs its own opaque background — the row's sits behind it and
 * would let the scrolling columns show through. For the same reason the row
 * hover has to be reapplied here through `group-hover`, or the pinned cell
 * stays pale while the rest of its row lights up.
 */
export const stickyHead = "sticky left-0 z-20 bg-paper-2 border-r border-line-soft"
export const stickyCell =
  "sticky left-0 z-10 bg-paper border-r border-line-soft group-hover:bg-paper-2"
