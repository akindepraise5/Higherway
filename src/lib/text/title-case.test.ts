import { describe, expect, it } from "vitest"
import { titleCase } from "./title-case"

/**
 * Most of these are real titles out of the v1 spreadsheet rather than invented
 * ones — the archive's inconsistency is the reason this function exists.
 *
 * The house style is Title Case, including short words: "Time To Take Another
 * Step". Raising every word is also what keeps this safe, since it can never
 * lowercase a name it does not recognise.
 */
describe("titleCase", () => {
  it("leaves a title already in house style alone", () => {
    expect(titleCase("Time To Take Another Step")).toBe("Time To Take Another Step")
    expect(titleCase("One Breath Away From Eternity")).toBe("One Breath Away From Eternity")
  })

  it("brings a shouted title down", () => {
    expect(titleCase("THE TRIAL OF OUR FAITH")).toBe("The Trial Of Our Faith")
  })

  it("raises an all-lowercase title", () => {
    expect(titleCase("the cord of salvation")).toBe("The Cord Of Salvation")
  })

  it("raises the short words too, which is the point of the house style", () => {
    expect(titleCase("A place of surrender")).toBe("A Place Of Surrender")
    expect(titleCase("Who cares about the details")).toBe("Who Cares About The Details")
  })

  it("fixes a half-capitalised title", () => {
    expect(titleCase("The Trial of our Faith")).toBe("The Trial Of Our Faith")
  })

  /**
   * The case that decided the whole design. Sentence case would have to lower
   * these and would get them wrong; raising them cannot.
   */
  it("never lowercases a name, because it never lowercases anything", () => {
    expect(titleCase("1st Corinthians 13")).toBe("1st Corinthians 13")
    expect(titleCase("walking with god")).toBe("Walking With God")
    expect(titleCase("The Essence Of True Christianity")).toBe("The Essence Of True Christianity")
  })

  it("keeps an abbreviation in capitals", () => {
    expect(titleCase("Reading the KJV")).toBe("Reading The KJV")
    expect(titleCase("notes on the NIV")).toBe("Notes On The NIV")
  })

  it("keeps an abbreviation even when the whole title is shouted", () => {
    expect(titleCase("THE KJV EXPLAINED")).toBe("The KJV Explained")
  })

  it("leaves roman numerals alone, since they are read as letters", () => {
    expect(titleCase("Questions and answers Vol II")).toBe("Questions And Answers Vol II")
  })

  it("preserves capitals the writer meant inside a word", () => {
    expect(titleCase("a word from McKenzie")).toBe("A Word From McKenzie")
  })

  it("leaves a word containing a digit exactly as typed", () => {
    // "1st" must not become "1St": the first letter is not the first character.
    expect(titleCase("1st things first")).toBe("1st Things First")
  })

  it("reaches past opening punctuation to find the letter", () => {
    expect(titleCase("“the anchor that holds”")).toBe("“The Anchor That Holds”")
  })

  it("keeps the spacing it was given", () => {
    expect(titleCase("  THE  QUIET  HOUR  ")).toBe("The  Quiet  Hour")
  })

  it("survives an empty or blank title", () => {
    expect(titleCase("")).toBe("")
    expect(titleCase("   ")).toBe("")
  })

  it("is idempotent — running it twice changes nothing further", () => {
    for (const title of [
      "THE TRIAL OF OUR FAITH",
      "Reading the KJV",
      "1st Corinthians 13",
      "a word from McKenzie",
    ]) {
      const once = titleCase(title)
      expect(titleCase(once)).toBe(once)
    }
  })
})
