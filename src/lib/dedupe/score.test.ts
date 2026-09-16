import { describe, expect, it } from "vitest"
import { scoreDuplicate, scoreTitles, THRESHOLD } from "./score"

describe("scoreDuplicate", () => {
  it("treats an identical file as decisive, whatever else is true", () => {
    const verdict = scoreDuplicate({ sha256Equal: true, title: 0, embedding: 0 })
    expect(verdict.level).toBe("identical")
    expect(verdict.score).toBe(1)
    expect(verdict.reasons[0]).toContain("identical")
  })

  it("treats a matching Drive checksum as decisive too", () => {
    expect(scoreDuplicate({ driveMd5Equal: true }).level).toBe("identical")
  })

  it("flags a re-scan even when the title was changed", () => {
    const verdict = scoreDuplicate({ title: 0.1, shingles: 0.9, embedding: 0.94 })
    expect(verdict.level).toBe("likely")
    expect(verdict.reasons.join(" ")).toContain("re-scanned")
  })

  it("does not flag two materials that merely share a subject", () => {
    const verdict = scoreDuplicate({ title: 0.3, shingles: 0.2, embedding: 0.71 })
    expect(verdict.level).toBe("distinct")
    expect(verdict.reasons).toEqual([])
  })

  it("raises the score when signals corroborate each other", () => {
    const alone = scoreDuplicate({ title: 0.7 })
    const together = scoreDuplicate({ title: 0.7, shingles: 0.85 })
    expect(together.score).toBeGreaterThan(alone.score)
  })

  it("explains itself in sentences, not numbers", () => {
    const verdict = scoreDuplicate({ title: 1, shingles: 0.88 })
    expect(verdict.reasons.length).toBeGreaterThan(0)
    for (const reason of verdict.reasons) {
      expect(reason).toMatch(/^[A-Z].*[.]$/)
    }
  })

  it("never exceeds 1", () => {
    const verdict = scoreDuplicate({
      title: 1,
      shingles: 1,
      embedding: 1,
      samePageCount: true,
    })
    expect(verdict.score).toBeLessThanOrEqual(1)
  })

  it("returns distinct for no signals at all", () => {
    expect(scoreDuplicate({}).level).toBe("distinct")
  })

  it("raises a reprint for review without calling it a duplicate", () => {
    // An article inside a booklet: contained entirely, but only half the
    // booklet's text overlaps, so it is not the same material.
    const verdict = scoreDuplicate({ shingles: 0.5, containment: 1 })
    expect(verdict.level).toBe("possible")
    expect(verdict.level).not.toBe("likely")
    expect(verdict.reasons.join(" ")).toContain("reprint")
  })

  it("does not let containment alone outrank a genuine duplicate", () => {
    const reprint = scoreDuplicate({ shingles: 0.5, containment: 1 })
    const duplicate = scoreDuplicate({ title: 1, shingles: 0.78 })
    expect(duplicate.score).toBeGreaterThan(reprint.score)
  })

  it("flags a real OCR pair at the measured 0.778, which 0.8 would have missed", () => {
    const verdict = scoreDuplicate({ shingles: 0.778 })
    expect(verdict.level).not.toBe("distinct")
  })
})

describe("scoreTitles", () => {
  it("flags a real duplicate pair from the archive", () => {
    expect(scoreTitles("A place of surrender", "A Place of Surrender").score).toBeGreaterThan(
      THRESHOLD.flag,
    )
  })

  it("leaves distinct titles alone", () => {
    expect(scoreTitles("God cares", "God offers hope").level).toBe("distinct")
  })
})
