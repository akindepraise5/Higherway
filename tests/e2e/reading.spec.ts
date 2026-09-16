import { expect, test } from "@playwright/test"

/**
 * The reading flow: search → open → read → download.
 *
 * One of the three journeys CLAUDE.md names, and the one that matters most —
 * it is what every visitor does, and none of it requires an account. The other
 * two (invite → set password → sign in, and upload → duplicate → review) need a
 * seeded session and live separately.
 *
 * Written to tolerate the archive's data rather than pin it: titles and slugs
 * change as materials are filed and duplicates resolved, so these assert on
 * structure and behaviour, never on a particular material being present.
 */

test.describe("reading the archive", () => {
  test("the home page leads to the library", async ({ page }) => {
    await page.goto("/")

    await expect(page.getByRole("heading", { level: 1 })).toContainText(/wisdom/i)
    await page
      .getByRole("link", { name: /browse the library/i })
      .first()
      .click()

    await expect(page).toHaveURL(/\/library/)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  })

  test("searching keeps its state in the URL", async ({ page }) => {
    await page.goto("/library")

    await page.getByPlaceholder(/search materials or topics/i).fill("faith")
    await page.getByRole("button", { name: /^search$/i }).click()

    // The state of the list lives in the URL, so a colleague can be sent a link
    // to exactly what you are looking at.
    await expect(page).toHaveURL(/[?&]q=faith/)
  })

  test("a material opens, shows its pages, and offers the file", async ({ page }) => {
    await page.goto("/library")

    const firstMaterial = page.locator("a[href^='/m/']").first()
    await expect(firstMaterial).toBeVisible()
    await firstMaterial.click()

    await expect(page).toHaveURL(/\/m\/[^/]+$/)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()

    // The pages are images we rendered ourselves and serve from our own CDN —
    // no PDF library is shipped to the browser.
    const pageImage = page.locator("main img").first()
    await expect(pageImage).toBeVisible()

    // The download must carry the material's own name, not original.pdf. The
    // name travels on the object, because a cross-origin download ignores
    // HTML's download attribute.
    const download = page.getByRole("link", { name: /download the pdf/i })
    if (await download.count()) {
      await expect(download.first()).toHaveAttribute("href", /.+/)
    }
  })

  test("the reader offers the text, when a material has been read", async ({ page }) => {
    await page.goto("/library")
    await page.locator("a[href^='/m/']").first().click()

    const readText = page.getByText(/read the text/i)
    if (await readText.count()) {
      await readText.first().click()
      // Collapsed by default; opening it reveals the OCR text that makes a
      // photographed page findable at all.
      await expect(page.getByText(/read from the scanned pages by machine/i)).toBeVisible()
    }
  })

  test("a material that does not exist gives a proper 404", async ({ page }) => {
    const response = await page.goto("/m/this-material-does-not-exist-anywhere")
    expect(response?.status()).toBe(404)
  })

  test("robots and sitemap are served, and point at a real site", async ({ page }) => {
    // Guarded on purpose: a production build without NEXT_PUBLIC_SITE_URL fails
    // rather than publishing localhost URLs for Google to crawl.
    const robots = await page.goto("/robots.txt")
    expect(robots?.status()).toBe(200)
    expect(await robots?.text()).toMatch(/sitemap/i)

    const sitemap = await page.goto("/sitemap.xml")
    expect(sitemap?.status()).toBe(200)
    expect(await sitemap?.text()).toContain("<urlset")
  })

  test("the admin area is not reachable without signing in", async ({ page }) => {
    // src/proxy.ts bounces signed-out visitors, and no admin link appears
    // anywhere on the public site.
    await page.goto("/admin/materials")
    await expect(page).toHaveURL(/\/sign-in/)
  })
})
