"use client"

import { Check, GitMerge, Pencil, Plus, Trash2, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import type { CategoryRow } from "../../server/categories/queries"
import {
  createCategory,
  deleteCategory,
  mergeCategory,
  renameCategory,
} from "../../server/services/categories"
import { ConfirmDialog } from "./confirm-dialog"
import { TableScroll } from "./table-scroll"

/**
 * Managing categories in place.
 *
 * Every action is a server action behind a transaction that also writes the
 * audit entry, so what happens here is recorded by construction rather than by
 * remembering to log it.
 *
 * All of it is Owner-only: creating, renaming, merging and deleting each change
 * how the archive is organised in public — renaming moves a topic's URL, and
 * merging moved 42 materials out of Faith by accident once. Editors and Admins
 * file materials into the topics that exist; they do not shape the shelves.
 */

type Role = "owner" | "admin" | "editor"

export function CategoryManager({ categories, role }: { categories: CategoryRow[]; role: Role }) {
  const [pending, start] = useTransition()
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [merging, setMerging] = useState<string | null>(null)
  const [filter, setFilter] = useState("")
  const [creating, setCreating] = useState(false)

  /**
   * Nothing destructive runs straight from a click. A merge or a delete is
   * staged here first and only executes once ConfirmDialog is satisfied — the
   * safeguard that was missing when a stray change on the merge picker moved
   * 42 materials out of Faith.
   */
  const [staged, setStaged] = useState<
    | { kind: "merge"; from: CategoryRow; into: CategoryRow }
    | { kind: "delete"; category: CategoryRow }
    | null
  >(null)
  const router = useRouter()

  // Owner only, all of it. A topic is a public URL and a shelf in the library,
  // so creating, renaming, merging and deleting are all structural decisions
  // rather than part of filing.
  const mayManage = role === "owner"

  const run = (action: () => Promise<{ ok: boolean; message?: string; error?: string }>) =>
    start(async () => {
      const result = await action()
      setNotice({
        ok: result.ok,
        text: result.ok ? (result.message ?? "Done.") : (result.error ?? "That did not work."),
      })
      if (result.ok) {
        setEditing(null)
        setMerging(null)
        router.refresh()
      }
    })

  const term = filter.trim().toLowerCase()
  const shown = term ? categories.filter((c) => c.name.toLowerCase().includes(term)) : categories

  // "Create X" appears only when nothing matches what was typed — the
  // search-or-create pattern, so a near-duplicate is seen before it is made.
  const exact = categories.some((c) => c.name.toLowerCase() === term)
  const canCreate = mayManage && term.length >= 2 && !exact

  return (
    <div className="mt-8">
      {notice ? (
        <p
          role="status"
          className={`mb-5 rounded-[3px] border-l-2 px-4 py-3 text-[13.5px] ${
            notice.ok
              ? "border-forest bg-paper-2 text-ink-2"
              : "border-[#8c2f22] bg-[#8c2f22]/5 text-[#8c2f22]"
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="filter" className="sr-only">
          {mayManage ? "Find or create a topic" : "Find a topic"}
        </label>
        <input
          id="filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={mayManage ? "Find a topic, or type a new name" : "Find a topic"}
          className="w-72 rounded-full border border-line bg-paper-2 px-4 py-2.5 text-[14px] outline-none transition-colors focus:border-ink"
        />
        {canCreate ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => createCategory(filter.trim()))}
            className="rounded-full bg-ink px-4 py-2.5 text-[13.5px] font-medium text-paper-2 transition-colors hover:bg-forest-2 disabled:opacity-60"
          >
            Create “{filter.trim()}”
          </button>
        ) : null}

        {/* The button above appears only once you have typed a name that does
            not exist, which is the right flow when you are already hunting for
            a topic and the wrong one when the job you came to do is "add a
            topic". This stands on its own, and takes a blurb — the search box
            cannot. */}
        {mayManage ? (
          <button
            type="button"
            onClick={() => setCreating((open) => !open)}
            aria-expanded={creating}
            className="ml-auto flex items-center gap-1.5 rounded-full border border-line px-4 py-2.5 text-[13.5px] font-medium text-ink-2 transition-colors hover:border-ink hover:text-ink"
          >
            <Plus size={15} />
            New topic
          </button>
        ) : null}
      </div>

      {creating ? (
        <form
          className="mt-3 flex flex-wrap items-end gap-3 rounded-[3px] border border-line-soft bg-paper-2 px-4 py-4"
          onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            const name = String(data.get("name") ?? "").trim()
            const blurb = String(data.get("blurb") ?? "").trim()
            if (name.length < 2) return
            run(async () => {
              const result = await createCategory(name, blurb || undefined)
              if (result.ok) setCreating(false)
              return result
            })
          }}
        >
          <div>
            <label htmlFor="new-name" className="block text-[12px] text-taupe">
              Name
            </label>
            <input
              id="new-name"
              name="name"
              required
              minLength={2}
              className="mt-1 w-56 rounded border border-line bg-paper px-3 py-2 text-[14px] outline-none focus:border-ink"
            />
          </div>

          <div className="min-w-[14rem] flex-1">
            <label htmlFor="new-blurb" className="block text-[12px] text-taupe">
              A line about it (optional)
            </label>
            <input
              id="new-blurb"
              name="blurb"
              className="mt-1 w-full rounded border border-line bg-paper px-3 py-2 text-[14px] outline-none focus:border-ink"
            />
          </div>

          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-ink px-4 py-2.5 text-[13.5px] font-medium text-paper-2 transition-colors hover:bg-forest-2 disabled:opacity-60"
          >
            Create
          </button>
          <button
            type="button"
            onClick={() => setCreating(false)}
            className="px-2 py-2.5 text-[13.5px] text-taupe transition-colors hover:text-ink"
          >
            Cancel
          </button>
        </form>
      ) : null}

      {/* Three columns, the last one a row of actions. It scrolls rather than
          squeezing the buttons into each other on a phone. Nothing is pinned:
          the first cell turns into the rename form, and a pinned form sitting
          over the scrolling columns reads as a rendering fault. */}
      <TableScroll minWidth="38rem" className="mt-6">
        <thead>
          <tr className="border-b border-line-soft bg-paper-2 text-[11px] font-medium uppercase tracking-[.14em] text-taupe">
            <th className="px-4 py-3 font-medium">Topic</th>
            <th className="px-4 py-3 font-medium">Materials</th>
            <th className="px-4 py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((category) => (
            <tr key={category.id} className="border-b border-line-soft last:border-0">
              <td className="px-4 py-3">
                {editing === category.id ? (
                  /**
                   * Name *and* sub-text together, and that is a fix as much as
                   * a feature: this was a lone name input, and renameCategory
                   * writes `blurb: blurb?.trim() || null`. Renaming without
                   * passing the blurb therefore erased it — silently, with the
                   * only record of the old text sitting in the audit trail.
                   * 57 of 69 topics have no sub-text and this would have
                   * quietly made more of them.
                   */
                  <form
                    onSubmit={(event) => {
                      event.preventDefault()
                      const data = new FormData(event.currentTarget)
                      const name = String(data.get("name") ?? "").trim()
                      const blurb = String(data.get("blurb") ?? "").trim()
                      if (name.length < 2) return
                      run(() => renameCategory(category.id, name, blurb || undefined))
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setEditing(null)
                    }}
                  >
                    <label htmlFor={`name-${category.id}`} className="sr-only">
                      Name
                    </label>
                    <input
                      id={`name-${category.id}`}
                      name="name"
                      ref={(el) => el?.focus()}
                      defaultValue={category.name}
                      required
                      minLength={2}
                      className="w-full rounded border border-ink bg-paper-2 px-2 py-1 text-[15px] outline-none"
                    />

                    <label htmlFor={`blurb-${category.id}`} className="sr-only">
                      Sub-text
                    </label>
                    <input
                      id={`blurb-${category.id}`}
                      name="blurb"
                      defaultValue={category.blurb ?? ""}
                      placeholder="A line about this topic — shown on the home page and its own page"
                      className="mt-1.5 w-full rounded border border-line bg-paper-2 px-2 py-1 text-[12.5px] outline-none focus:border-ink"
                    />

                    <div className="mt-1.5 flex items-center gap-2">
                      <button
                        type="submit"
                        disabled={pending}
                        className="rounded-full bg-ink px-3 py-1 text-[12px] font-medium text-paper-2 disabled:opacity-60"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="text-[12px] text-taupe hover:text-ink"
                      >
                        Cancel
                      </button>
                      <span className="text-[11.5px] text-taupe">
                        Renaming changes the topic's public URL.
                      </span>
                    </div>
                  </form>
                ) : (
                  <>
                    <span className="font-serif text-[16px]">{category.name}</span>
                    {category.blurb ? (
                      <span className="mt-0.5 block text-[12.5px] text-taupe">
                        {category.blurb}
                      </span>
                    ) : (
                      /* 57 of 69 topics have none, and the gap is invisible
                           until you look at the home page. Naming it here, where
                           it can be fixed, beats leaving a silent blank. */
                      <span className="mt-0.5 block text-[12.5px] text-gold">
                        No sub-text
                        {mayManage ? (
                          <button
                            type="button"
                            onClick={() => setEditing(category.id)}
                            className="ml-1.5 border-b border-gold/40 transition-colors hover:border-gold"
                          >
                            add one
                          </button>
                        ) : null}
                      </span>
                    )}
                  </>
                )}
              </td>

              <td className="px-4 py-3">
                <span
                  className={`text-[13.5px] ${category.total <= 1 ? "text-gold" : "text-ink-3"}`}
                >
                  {category.total}
                  {category.total !== category.published ? (
                    <span className="text-taupe"> ({category.published} published)</span>
                  ) : null}
                </span>
              </td>

              <td className="px-4 py-3">
                {merging === category.id ? (
                  <div className="flex items-center justify-end gap-2">
                    <label htmlFor={`into-${category.id}`} className="sr-only">
                      Merge into
                    </label>
                    <select
                      id={`into-${category.id}`}
                      defaultValue=""
                      onChange={(e) => {
                        const into = categories.find((c) => c.id === e.target.value)
                        if (into) setStaged({ kind: "merge", from: category, into })
                      }}
                      className="rounded border border-line bg-paper-2 px-2 py-1.5 text-[13px]"
                    >
                      <option value="">Merge into…</option>
                      {categories
                        .filter((c) => c.id !== category.id)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.total})
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setMerging(null)}
                      className="text-taupe hover:text-ink"
                      aria-label="Cancel merge"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-end gap-3 text-taupe">
                    {mayManage ? (
                      editing === category.id ? (
                        <button
                          type="button"
                          onClick={() => setEditing(null)}
                          className="hover:text-ink"
                          aria-label="Stop editing"
                        >
                          <Check size={16} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => setEditing(category.id)}
                          className="hover:text-ink disabled:opacity-40"
                          aria-label={`Rename ${category.name}`}
                        >
                          <Pencil size={16} />
                        </button>
                      )
                    ) : null}

                    {mayManage ? (
                      <>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => setMerging(category.id)}
                          className="hover:text-ink disabled:opacity-40"
                          aria-label={`Merge ${category.name} into another`}
                        >
                          <GitMerge size={16} />
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => setStaged({ kind: "delete", category })}
                          className="hover:text-[#8c2f22] disabled:opacity-40"
                          aria-label={`Delete ${category.name}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    ) : null}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </TableScroll>

      <ConfirmDialog
        open={staged !== null}
        busy={pending}
        title={staged?.kind === "merge" ? "Merge these topics?" : "Delete this topic?"}
        confirmLabel={staged?.kind === "merge" ? "Merge them" : "Delete it"}
        /* Typing the name is required whenever materials would move or be
           unfiled. An empty topic is a plain confirmation — the cost of a
           mistake there is one click to recreate it. */
        confirmPhrase={
          staged?.kind === "merge"
            ? staged.from.name
            : staged?.kind === "delete" && staged.category.total > 0
              ? staged.category.name
              : undefined
        }
        description={
          staged?.kind === "merge" ? (
            <>
              Every material on <b>{staged.from.name}</b> moves to <b>{staged.into.name}</b>, and{" "}
              <b>{staged.from.name}</b> stops being a topic.
              {staged.from.total > 0 ? (
                <>
                  {" "}
                  <b>
                    {staged.from.total} {staged.from.total === 1 ? "material" : "materials"}
                  </b>{" "}
                  will move.
                </>
              ) : null}{" "}
              This cannot be undone from here — reversing it means reconstructing the original
              filing from the spreadsheet.
            </>
          ) : staged?.kind === "delete" ? (
            staged.category.total > 0 ? (
              <>
                <b>{staged.category.name}</b> is removed and its{" "}
                <b>
                  {staged.category.total}{" "}
                  {staged.category.total === 1 ? "material becomes" : "materials become"}
                </b>{" "}
                Uncategorised. The materials themselves are not deleted and stay in the library.
              </>
            ) : (
              <>
                <b>{staged.category.name}</b> holds no materials, so nothing else changes.
              </>
            )
          ) : null
        }
        onCancel={() => setStaged(null)}
        onConfirm={() => {
          if (!staged) return
          const action =
            staged.kind === "merge"
              ? () => mergeCategory(staged.from.id, staged.into.id)
              : () => deleteCategory(staged.category.id)
          setStaged(null)
          setMerging(null)
          run(action)
        }}
      />

      {shown.length === 0 ? (
        <p className="mt-6 text-center text-[14px] text-ink-3">
          No topic matches “{filter.trim()}”.{" "}
          {canCreate ? "Use the button above to create it." : null}
        </p>
      ) : null}
    </div>
  )
}
