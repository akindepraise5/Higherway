import Link from "next/link"
import { SignOutButton } from "../../components/admin/sign-out-button"
import { Arc } from "../../components/public/mark"
import { requireSession } from "../../lib/session"

/**
 * The admin shell.
 *
 * `requireSession` here is the second line of defence: `src/proxy.ts` already
 * bounced signed-out visitors before this rendered, but a guard that lives in
 * one place only is a guard that the next route quietly escapes.
 *
 * It keeps the paper-and-ink palette rather than turning grey. The people
 * curating this archive are the same people who read it.
 */

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/materials", label: "Materials" },
  { href: "/admin/categories", label: "Categories" },
  { href: "/admin/duplicates", label: "Duplicates" },
  { href: "/admin/activity", label: "Activity" },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession()
  const role = (session.user as { role?: string }).role ?? "editor"

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-50 border-b border-line-soft bg-paper/85 backdrop-blur-[14px]">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
          <Link href="/admin" className="flex items-center gap-2.5">
            <Arc className="h-2.5 w-8 text-gold" />
            <span className="font-serif text-lg tracking-[-0.018em]">Higherway</span>
            <span className="rounded-full bg-paper-3 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[.16em] text-taupe">
              {role}
            </span>
          </Link>

          <nav aria-label="Admin" className="ml-auto hidden items-center gap-5 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-[14px] text-ink-2 transition-colors hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-4 md:ml-0">
            <span className="hidden text-[13px] text-taupe sm:inline">{session.user.email}</span>
            <SignOutButton />
          </div>
        </div>

        <nav
          aria-label="Admin"
          className="flex gap-4 overflow-x-auto border-t border-line-soft px-6 py-2.5 md:hidden"
        >
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap text-[13.5px] text-ink-2"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
    </div>
  )
}
