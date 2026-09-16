import Link from "next/link"
import { UserMenu } from "../../components/admin/user-menu"
import { Logo } from "../../components/public/logo"
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
  { href: "/admin/users", label: "People" },
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
            <Logo className="h-[30px] w-[96px] text-ink" />
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

          {/* Initials in the top-right with a menu under them — where people
              look for their own account. The role moved inside it, so the
              header carries one control rather than three pieces of text. */}
          <div className="ml-auto md:ml-0">
            <UserMenu name={session.user.name} email={session.user.email} role={role} />
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
