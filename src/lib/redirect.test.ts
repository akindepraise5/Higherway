import { describe, expect, it } from "vitest"
import { safeRedirect } from "./redirect"

/**
 * This is the open-redirect guard. If it lets something through, a link that
 * carries our domain can land someone on a site that is not ours — which is
 * exactly the shape a convincing phishing link takes.
 */
describe("safeRedirect", () => {
  it("allows a same-site path", () => {
    expect(safeRedirect("/admin")).toBe("/admin")
    expect(safeRedirect("/admin/materials?filter=needs-ocr")).toBe(
      "/admin/materials?filter=needs-ocr",
    )
  })

  it("refuses an absolute URL", () => {
    expect(safeRedirect("https://evil.example")).toBeNull()
    expect(safeRedirect("http://evil.example")).toBeNull()
  })

  /** The one people forget: browsers read it as protocol-relative and leave. */
  it("refuses a protocol-relative URL", () => {
    expect(safeRedirect("//evil.example")).toBeNull()
    expect(safeRedirect("//evil.example/admin")).toBeNull()
  })

  it("refuses a backslash path, which some browsers normalise to //", () => {
    expect(safeRedirect("/\\evil.example")).toBeNull()
  })

  it("refuses anything not starting at the root", () => {
    expect(safeRedirect("admin")).toBeNull()
    expect(safeRedirect("../admin")).toBeNull()
    expect(safeRedirect("javascript:alert(1)")).toBeNull()
  })

  it("returns null for nothing at all", () => {
    expect(safeRedirect(null)).toBeNull()
    expect(safeRedirect(undefined)).toBeNull()
    expect(safeRedirect("")).toBeNull()
  })
})
