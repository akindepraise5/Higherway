import { describe, expect, it } from "vitest"
import {
  assertId,
  isStagingKey,
  materialPrefix,
  pageKey,
  pdfKey,
  publicUrl,
  stagingKey,
  thumbKey,
} from "./keys"

const ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301"
const OTHER = "7c9e6679-7425-40de-944b-e07fc1f90ae7"

describe("assertId", () => {
  it("accepts a uuid", () => {
    expect(assertId(ID)).toBe(ID)
  })

  it.each([
    ["path traversal", "../../etc/passwd"],
    ["a slash", "3f2504e0/4f89"],
    ["empty", ""],
    ["nearly a uuid", "3f2504e0-4f89-11d3-9a0c"],
  ])("refuses %s", (_label, bad) => {
    expect(() => assertId(bad)).toThrow()
  })
})

describe("keys", () => {
  it("puts a staged upload under staging/", () => {
    expect(stagingKey(ID)).toBe(`staging/${ID}.pdf`)
    expect(isStagingKey(stagingKey(ID))).toBe(true)
  })

  it("keeps every file for a material under one prefix", () => {
    const prefix = materialPrefix(ID)
    for (const key of [pdfKey(ID), pageKey(ID, 1), thumbKey(ID)]) {
      expect(key.startsWith(prefix)).toBe(true)
    }
  })

  it("does not treat a published key as staged", () => {
    expect(isStagingKey(pdfKey(ID))).toBe(false)
  })

  it("gives different materials different prefixes", () => {
    expect(materialPrefix(ID)).not.toBe(materialPrefix(OTHER))
  })

  it("numbers pages from 1", () => {
    expect(pageKey(ID, 1)).toBe(`materials/${ID}/pages/1.webp`)
    expect(() => pageKey(ID, 0)).toThrow()
    expect(() => pageKey(ID, -1)).toThrow()
    expect(() => pageKey(ID, 1.5)).toThrow()
  })

  it("is stable — these paths are stored, so they must not drift", () => {
    expect(pdfKey(ID)).toBe(`materials/${ID}/original.pdf`)
    expect(thumbKey(ID)).toBe(`materials/${ID}/thumb.webp`)
  })
})

describe("publicUrl", () => {
  it("joins the custom domain to the key", () => {
    expect(publicUrl(pdfKey(ID), "https://cdn-higherway.mavilletech.com")).toBe(
      `https://cdn-higherway.mavilletech.com/materials/${ID}/original.pdf`,
    )
  })

  it("does not double the slash", () => {
    expect(publicUrl("a/b.webp", "https://cdn.example.com/")).toBe(
      "https://cdn.example.com/a/b.webp",
    )
  })

  it("refuses to build a URL with no base configured", () => {
    expect(() => publicUrl("a/b.webp", "")).toThrow(/R2_PUBLIC_BASE_URL/)
  })
})
