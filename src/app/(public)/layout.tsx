import { Footer } from "../../components/public/footer"
import { Masthead } from "../../components/public/masthead"

/**
 * The public shell. Everything inside is a Server Component by default —
 * a visitor to the home page downloads no application JavaScript at all.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Masthead />
      <main id="main">{children}</main>
      <Footer />
    </>
  )
}
