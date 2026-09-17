"use client"

import { Sparkles } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { acceptSuggestedCategory } from "../../server/services/materials"

/**
 * Topics the archive thinks this material belongs under.
 *
 * Shown only when the material is unfiled, which is where the work is: 314
 * published materials have no topic. Once one is filed, a panel proposing more
 * is noise on a page whose job is the material, not the machine.
 *
 * Every suggestion says **why** — "6 of the 15 most similar materials are filed
 * here" — because that is a claim an editor can check in a second, where a
 * confidence number is one they can only take or leave.
 *
 * It is right 56% of the time on the top three, measured against 253 materials
 * a person had already filed. That is a genuinely useful prompt and nowhere near
 * good enough to act on its own, which is exactly why it is worded as a question
 * and why a strong finding is marked apart from a weak one: the panel should
 * look like something to check, not something to rubber-stamp.
 *
 * Nothing is applied automatically. Accepting is a press, and the press is what
 * writes the row.
 */

export type TopicSuggestion = {
  categoryId: string
  name: string
  from: "neighbours" | "name"
  because: string
  strong: boolean
}

export function TopicSuggestions({
  materialId,
  suggestions,
}: {
  materialId: string
  suggestions: TopicSuggestion[]
}) {
  const [pending, start] = useTransition()
  const [dismissed, setDismissed] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const router = useRouter()

  const shown = suggestions.filter((s) => !dismissed.includes(s.categoryId))
  if (shown.length === 0) return null

  const accept = (suggestion: TopicSuggestion) =>
    start(async () => {
      const result = await acceptSuggestedCategory(materialId, suggestion.categoryId)
      setNotice(result.ok ? result.message : result.error)
      if (result.ok) router.refresh()
    })

  return (
    <div className="mt-4 rounded-[4px] border border-line-soft bg-paper-2 px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[.16em] text-taupe">
        <Sparkles size={12} aria-hidden="true" />
        Might belong under
      </p>

      <ul className="mt-2.5 flex flex-col gap-2">
        {shown.map((suggestion) => (
          <li key={suggestion.categoryId} className="flex items-start justify-between gap-2">
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[13.5px] text-ink-2">{suggestion.name}</span>
                {/* A strong neighbour vote is right about three times in four,
                    a weak one closer to half. Saying so is the difference
                    between a prompt and a rubber stamp. */}
                {suggestion.strong ? (
                  <span className="flex-none rounded-full bg-gold-wash px-1.5 py-0.5 text-[9.5px] font-medium uppercase tracking-[.1em] text-gold">
                    likely
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-taupe">
                {suggestion.because}
              </span>
            </span>
            <span className="flex flex-none items-center gap-1">
              <button
                type="button"
                disabled={pending}
                onClick={() => accept(suggestion)}
                className="rounded-full border border-line px-3 py-1.5 text-[12px] text-ink-2 transition-colors hover:border-ink disabled:opacity-40"
              >
                File here
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setDismissed((d) => [...d, suggestion.categoryId])}
                aria-label={`Not ${suggestion.name}`}
                title={`Not ${suggestion.name}`}
                className="rounded-full px-2 py-1.5 text-[12px] text-taupe transition-colors hover:text-ink disabled:opacity-40"
              >
                No
              </button>
            </span>
          </li>
        ))}
      </ul>

      {notice ? (
        <p role="status" className="mt-2.5 text-[12px] text-ink-3">
          {notice}
        </p>
      ) : null}
    </div>
  )
}
