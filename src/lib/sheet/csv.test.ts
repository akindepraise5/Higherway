import { describe, expect, it } from "vitest"
import {
  driveFileIdFrom,
  isPlaceholderTopic,
  mapColumns,
  parseCSV,
  parseSheet,
  splitTopics,
} from "./csv"

/** The real header and real rows from the v1 spreadsheet, verbatim. */
const HEADER = '"SN","Title","Author","Drive Link (Ctrl + Click)","Topics/Tags","Summary","","",""'
const ROW_TAGGED =
  '"1","2017-01-FTWord-The-Way-of-Holiness","Darell Lee","https://drive.google.com/file/d/1m8rbwqKprCbpevIEBCekg1OOFh286Noq/view?usp=drivesdk","Holiness","","","",""'
const ROW_MULTI =
  '"2","2017-10-FTWord-A-Purpose-in-Pain","Discipleship study series","https://drive.google.com/file/d/1_lpp8MnEWsl2MdPtILM1aH2DXyCkngFw/view?usp=drivesdk","Pain, Purpose","","","",""'
const ROW_UNTAGGED =
  '"3","A Backslider Comes Home","","https://drive.google.com/file/d/18VcEVjDv6qAXgI-k-qHKir7BfcMFpU/view?usp=drivesdk","— Review manually","","","",""'

const SHEET = [HEADER, ROW_TAGGED, ROW_MULTI, ROW_UNTAGGED].join("\n")

describe("parseCSV", () => {
  it("handles quoted fields with commas inside", () => {
    const rows = parseCSV('"a","b, still b","c"')
    expect(rows[0]).toEqual(["a", "b, still b", "c"])
  })

  it("handles escaped quotes", () => {
    expect(parseCSV('"say ""hello""","x"')[0]).toEqual(['say "hello"', "x"])
  })

  it("handles newlines inside a cell, which Google Sheets produces", () => {
    const rows = parseCSV('"one","line\nbreak"\n"two","y"')
    expect(rows).toHaveLength(2)
    expect(rows[0][1]).toBe("line\nbreak")
  })

  it("ignores carriage returns", () => {
    expect(parseCSV("a,b\r\nc,d")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ])
  })

  it("returns nothing for empty input", () => {
    expect(parseCSV("")).toEqual([])
  })
})

describe("mapColumns", () => {
  it("matches the real header, including 'Drive Link (Ctrl + Click)'", () => {
    const map = mapColumns(parseCSV(SHEET))
    expect(map).not.toBeNull()
    expect(map?.idx.title).toBe(1)
    expect(map?.idx.author).toBe(2)
    expect(map?.idx.link).toBe(3)
    expect(map?.idx.topics).toBe(4)
  })

  it("returns null when there is no usable header", () => {
    expect(mapColumns(parseCSV("one,two\nthree,four"))).toBeNull()
  })
})

describe("splitTopics", () => {
  it("splits on commas", () => {
    expect(splitTopics("Pain, Purpose")).toEqual(["Pain", "Purpose"])
  })

  it("drops the placeholder used by 56% of the sheet", () => {
    expect(splitTopics("— Review manually")).toEqual([])
    expect(isPlaceholderTopic("— Review manually")).toBe(true)
  })

  it("is empty for an empty cell", () => {
    expect(splitTopics("")).toEqual([])
  })
})

describe("driveFileIdFrom", () => {
  it("reads the id from a share link", () => {
    expect(driveFileIdFrom("https://drive.google.com/file/d/1m8rbwq/view?usp=drivesdk")).toBe(
      "1m8rbwq",
    )
  })

  it("reads the id from a download link", () => {
    expect(driveFileIdFrom("https://drive.google.com/uc?export=download&id=1abc-DEF")).toBe(
      "1abc-DEF",
    )
  })

  it("is null when there is no id", () => {
    expect(driveFileIdFrom("https://example.com/a.pdf")).toBeNull()
  })
})

describe("parseSheet", () => {
  it("reads every usable row", () => {
    const rows = parseSheet(SHEET)
    expect(rows).toHaveLength(3)
  })

  it("keeps the title exactly as the sheet has it", () => {
    expect(parseSheet(SHEET)[0].title).toBe("2017-01-FTWord-The-Way-of-Holiness")
  })

  it("splits multiple topics", () => {
    expect(parseSheet(SHEET)[1].topics).toEqual(["Pain", "Purpose"])
  })

  it("leaves a 'Review manually' row with no topics, for Uncategorised", () => {
    expect(parseSheet(SHEET)[2].topics).toEqual([])
  })

  it("records sheet order, since later rows are the newer materials", () => {
    expect(parseSheet(SHEET).map((r) => r.row)).toEqual([0, 1, 2])
  })

  it("skips a row with no link rather than half-importing it", () => {
    const broken = [HEADER, '"4","No link here","","","Faith","",""'].join("\n")
    expect(parseSheet(broken)).toHaveLength(0)
  })

  it("throws when the sheet has no usable header", () => {
    expect(() => parseSheet("one,two\nthree,four")).toThrow(/Title column/)
  })
})
