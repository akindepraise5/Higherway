import type { Metadata } from "next"
import Link from "next/link"
import { Pagination } from "../../../components/public/pagination"
import { requireSession } from "../../../lib/session"
import {
  ACTIVITY_PAGE_SIZE,
  activity,
  activityActions,
  actors,
  changedName,
  describe,
} from "../../../server/activity"

/**
 * What has been done to the archive, and by whom.
 *
 * Every mutation writes an entry inside the same transaction as the change, so
 * this is a complete record rather than a best-effort one — nothing can happen
 * without appearing here.
 *
 * Read-only by construction: the page imports from `server/activity.ts`, which
 * only reads. Amending the trail is not a feature.
 */
export const metadata: Metadata = {
  title: "Activity",
  robots: { index: false, follow: false },
}

export const dynamic = "force-dynamic"

type Search = { actor?: string; action?: string; entity?: string; page?: string }

const href = (params: Search) => {
  const qs = new URLSearchParams()
  if (params.actor) qs.set("actor", params.actor)
  if (params.action) qs.set("action", params.action)
  if (params.entity) qs.set("entity", params.entity)
  if (params.page && params.page !== "1") qs.set("page", params.page)
  const s = qs.toString()
  return s ? `/admin/activity?${s}` : "/admin/activity"
}

export default async function ActivityPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireSession()
  const params = await searchParams

  const page = Number(params.page) || 1
  const [result, people, actions] = await Promise.all([
    activity({
      actorId: params.actor,
      action: params.action,
      entityId: params.entity,
      page,
    }),
    actors(),
    activityActions(),
  ])

  const filtered = Boolean(params.actor || params.action || params.entity)

  return (
    <>
      <p className="text-[11px] font-medium uppercase tracking-[.2em] text-taupe">Activity</p>
      <h1 className="mt-3 font-serif text-[clamp(28px,3.4vw,38px)] font-light tracking-[-0.02em]">
        {result.total} {result.total === 1 ? "entry" : "entries"}
      </h1>
      <p className="mt-2 max-w-[60ch] text-[14px] leading-relaxed text-ink-2">
        Every change to the archive is recorded here, in the same transaction as the change itself.
        Nothing can be altered without appearing in this list.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href="/admin/activity"
          className={`rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${
            !filtered ? "border-ink bg-ink text-paper-2" : "border-line text-ink-2 hover:border-ink"
          }`}
        >
          Everything
        </Link>
        {people.map((person) => (
          <Link
            key={person.id}
            href={href({ actor: person.id, action: params.action })}
            className={`rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${
              params.actor === person.id
                ? "border-ink bg-ink text-paper-2"
                : "border-line text-ink-2 hover:border-ink"
            }`}
          >
            {person.name}
          </Link>
        ))}
      </div>

      {actions.length > 1 ? (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {actions.map((a) => (
            <Link
              key={a}
              href={href({ actor: params.actor, action: a })}
              className={`rounded-full border px-3 py-1 text-[12px] transition-colors ${
                params.action === a
                  ? "border-gold bg-gold-wash text-gold"
                  : "border-line-soft text-ink-3 hover:border-ink"
              }`}
            >
              {a}
            </Link>
          ))}
        </div>
      ) : null}

      {result.items.length === 0 ? (
        <p className="mt-16 text-center text-ink-3">
          Nothing recorded yet.{" "}
          {filtered ? (
            <Link href="/admin/activity" className="border-b border-line hover:border-ink">
              Clear the filters
            </Link>
          ) : null}
        </p>
      ) : (
        <ol className="mt-8 overflow-hidden rounded-[3px] border border-line-soft">
          {result.items.map((row) => {
            const summary = changedName(row.before, row.after)
            return (
              <li
                key={row.id}
                className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-line-soft px-4 py-3 last:border-0"
              >
                <span className="text-[14px] text-ink">
                  {row.actorName ?? <span className="text-taupe">A script</span>}
                </span>
                <span className="text-[14px] text-ink-2">{describe(row.action)}</span>
                {summary ? (
                  <span className="font-serif text-[15px] text-ink">{summary}</span>
                ) : null}

                <span className="ml-auto flex items-center gap-3 text-[12px] text-taupe">
                  {row.entityId ? (
                    <Link
                      href={href({ entity: row.entityId })}
                      className="transition-colors hover:text-ink"
                    >
                      {row.entityType}
                    </Link>
                  ) : (
                    <span>{row.entityType}</span>
                  )}
                  <time dateTime={row.createdAt.toISOString()}>
                    {row.createdAt.toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </span>
              </li>
            )
          })}
        </ol>
      )}

      <Pagination
        page={result.page}
        pages={result.pages}
        total={result.total}
        pageSize={ACTIVITY_PAGE_SIZE}
        hrefFor={(p) =>
          href({
            actor: params.actor,
            action: params.action,
            entity: params.entity,
            page: String(p),
          })
        }
      />
    </>
  )
}
