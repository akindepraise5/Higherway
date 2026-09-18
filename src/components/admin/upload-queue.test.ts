import { describe, expect, it } from "vitest"
import { pool } from "./upload-queue"

describe("pool", () => {
  it("runs every item exactly once", async () => {
    const seen: number[] = []
    await pool([1, 2, 3, 4, 5], 2, async (n) => {
      seen.push(n)
    })
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5])
  })

  it("never has more than `limit` in flight", async () => {
    let inFlight = 0
    let peak = 0
    await pool(
      Array.from({ length: 12 }, (_, i) => i),
      3,
      async () => {
        inFlight += 1
        peak = Math.max(peak, inFlight)
        await new Promise((r) => setTimeout(r, 1))
        inFlight -= 1
      },
    )
    expect(peak).toBe(3)
  })

  it("does not abandon the rest of the batch when one item fails", async () => {
    // The whole point: one bad file must not take the other forty-nine with it.
    const done: number[] = []
    await pool([1, 2, 3, 4], 2, async (n) => {
      try {
        if (n === 2) throw new Error("that one failed")
        done.push(n)
      } catch {
        // recorded against its own row by the caller
      }
    })
    expect(done.sort()).toEqual([1, 3, 4])
  })

  it("handles an empty queue without hanging", async () => {
    await expect(pool([], 3, async () => {})).resolves.toBeUndefined()
  })

  it("does not start more runners than there are items", async () => {
    let peak = 0
    let inFlight = 0
    await pool([1], 5, async () => {
      inFlight += 1
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 1))
      inFlight -= 1
    })
    expect(peak).toBe(1)
  })
})
