import { describe, expect, it, vi } from "vitest"
import { OcrQuotaError, type Recogniser } from "../../lib/ocr/types"
import { readPage } from "./read"

/**
 * The fallback is the one path that only runs on a day something has gone
 * wrong, so it is the one most likely to be broken without anyone knowing.
 *
 * `tesseract()` is stubbed rather than run: loading a wasm engine and a 10 MB
 * language file to prove a `catch` block is reached would make this slow enough
 * that nobody runs it.
 */
vi.mock("./tesseract", () => ({
  tesseract: (): Recogniser => ({
    name: "tesseract",
    read: async () => ({
      boxes: [{ text: "read by the fallback", confidence: 0.9, x: 0, y: 0, width: 1, height: 0.1 }],
      engine: "tesseract" as const,
      hallucinates: true,
    }),
  }),
}))

const refusing = (error: Error): Recogniser => ({
  name: "gcv",
  read: async () => {
    throw error
  },
})

const image = new Uint8Array([1, 2, 3])

describe("readPage falling back", () => {
  it("uses tesseract when the cloud engine is out of allowance", async () => {
    const result = await readPage(image, refusing(new OcrQuotaError("quota exhausted", 429)))
    expect(result.engine).toBe("tesseract")
    expect(result.text).toContain("read by the fallback")
  })

  it("falls back on 403 too — a missing billing account means the same thing", async () => {
    const result = await readPage(image, refusing(new OcrQuotaError("billing not enabled", 403)))
    expect(result.engine).toBe("tesseract")
  })

  it("does NOT fall back on an ordinary failure", async () => {
    // A dropped connection or a corrupt file has to surface and be retried.
    // Downgrading every page because of one timeout would quietly leave the
    // archive read at 90–95% with nothing recording why.
    await expect(readPage(image, refusing(new Error("socket hang up")))).rejects.toThrow(
      "socket hang up",
    )
  })

  it("records the engine that actually read the page, not the one asked for", async () => {
    const result = await readPage(image, refusing(new OcrQuotaError("quota", 429)))
    // This is what makes a fallback-read page findable afterwards, so it can be
    // upgraded with `pnpm ocr:local`.
    expect(result.engine).not.toBe("gcv")
  })
})
