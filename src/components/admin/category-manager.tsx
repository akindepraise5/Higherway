"use client"

import { Check, GitMerge, Pencil, Trash2, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import type { CategoryRow } from "../../server/categories/queries"
import {
  createCategory,
  deleteCategory,
  mergeCategory,
  renameCategory,
} from "../../server/services/categories"

/**
 * Managing categories in place.
 *
 * Every action is a server action behind a transaction that also writes the
 * audit entry, so what happens here is recorded by construction rather than by
 * remembering to log it.
 *
 * Merge and delete are Admin-only; creating and renaming are not, because
 * filing material is an Editor's daily work and blocking it would push people
 * towards leaving things uncategorised.
 */

type Role = "owner" | "admin" | "editor"

export function CategoryManager({ categories, role }: { categories: CategoryRow[]; role: Role }) {
  const [pending, start] = useTransition()
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [merging, setMerging] = useState<string | null>(null)
  const [filter, setFilter] = useState("")
  const router = useRouter()

  const mayMerge = role === "owner" || role === "admin"

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
  const canCreate = term.length >= 2 && !exact

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
          Find or create a topic
        </label>
        <input
          id="filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Find a topic, or type a new name"
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
      </div>

      <div className="mt-6 overflow-hidden rounded-[3px] border border-line-soft">
        <table className="w-full border-collapse text-left">
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
                    <input
                      ref={(el) => el?.focus()}
                      defaultValue={category.name}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          run(() => renameCategory(category.id, e.currentTarget.value))
                        }
                        if (e.key === "Escape") setEditing(null)
                      }}
                      className="w-full rounded border border-ink bg-paper-2 px-2 py-1 text-[15px] outline-none"
                    />
                  ) : (
                    <>
                      <span className="font-serif text-[16px]">{category.name}</span>
                      {category.blurb ? (
                        <span className="mt-0.5 block text-[12.5px] text-taupe">
                          {category.blurb}
                        </span>
                      ) : null}
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
                          if (e.target.value) {
                            run(() => mergeCategory(category.id, e.target.value))
                          }
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
                      {editing === category.id ? (
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
                      )}

                      {mayMerge ? (
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
                            onClick={() => {
                              const warning =
                                category.total > 0
                                  ? `Delete “${category.name}”? ${category.total} ${
                                      category.total === 1 ? "material becomes" : "materials become"
                                    } Uncategorised. They are not deleted.`
                                  : `Delete “${category.name}”?`
                              if (confirm(warning)) run(() => deleteCategory(category.id))
                            }}
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
        </table>
      </div>

      {shown.length === 0 ? (
        <p className="mt-6 text-center text-[14px] text-ink-3">
          No topic matches “{filter.trim()}”.{" "}
          {canCreate ? "Use the button above to create it." : null}
        </p>
      ) : null}
    </div>
  )
}
