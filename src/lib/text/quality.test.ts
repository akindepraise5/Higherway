import { describe, expect, it } from "vitest"
import { scoreText, USABLE_THRESHOLD } from "./quality"

/** macOS Vision's actual read of a photographed magazine page. */
const CLEAN =
  "DAY TO DAY 5 Keys For Successful Building What project has God given you to work on? If you are a Christian, you can be sure there is one. We read in the scriptures of many who built, and of the care they took over the work entrusted to them."

/** tesseract.js's read of the same page, scraping the photograph beside it. */
const NOISY =
  "C— | p . Keys For Successful Building tech? oo] What project has God given you lo = work on? If you are a Christian, you BENE can be sure there is o"

describe("scoreText", () => {
  it("scores a clean read as usable", () => {
    const q = scoreText(CLEAN)
    expect(q.usable).toBe(true)
    expect(q.score).toBeGreaterThan(0.85)
    expect(q.notes).toContain("The text reads cleanly.")
  })

  it("scores the noisy read below the clean one", () => {
    expect(scoreText(NOISY).score).toBeLessThan(scoreText(CLEAN).score)
  })

  it("explains what is wrong, in words", () => {
    const q = scoreText(NOISY)
    expect(q.notes.length).toBeGreaterThan(0)
    for (const note of q.notes) expect(note).toMatch(/^[A-Z].*[.]$/)
  })

  it("treats an empty page as unusable rather than perfect", () => {
    const q = scoreText("")
    expect(q.score).toBe(0)
    expect(q.usable).toBe(false)
  })

  it("flags a page with almost no text", () => {
    const q = scoreText("Higherway")
    expect(q.notes.join(" ")).toContain("Very little text")
  })

  it("flags text broken into single letters", () => {
    const q = scoreText("t h e w a y o f h o l i n e s s i s a p a t h w e w a l k")
    expect(q.notes.join(" ")).toContain("stray single letters")
    expect(q.usable).toBe(false)
  })

  it("keeps the score within range", () => {
    for (const text of [CLEAN, NOISY, "", "|||| ---- ????"]) {
      const q = scoreText(text)
      expect(q.score).toBeGreaterThanOrEqual(0)
      expect(q.score).toBeLessThanOrEqual(1)
    }
  })

  it("agrees with its own threshold", () => {
    const q = scoreText(CLEAN)
    expect(q.usable).toBe(q.score >= USABLE_THRESHOLD)
  })
})
