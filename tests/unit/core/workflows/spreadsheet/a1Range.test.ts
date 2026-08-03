/** @jest-environment node */
/**
 * A1-notation helpers for guided spreadsheet configuration
 * (SHEETS-GUIDED-CONFIG-1).
 *
 * Two business rules are under protection here:
 *
 * 1. **A derived range must address the tab the user picked.** Sheet
 *    titles legitimately contain spaces and apostrophes ("Bob's
 *    Orders"). Getting the quoting wrong does not throw — it silently
 *    writes the row into a different tab, or fails at run time with a
 *    parse error the author cannot act on.
 *
 * 2. **A saved range is never re-interpreted on a guess.** Recovering
 *    the tab from an existing range is UI convenience; being wrong
 *    would retarget a live workflow. Every ambiguous shape must answer
 *    `null` so the user is asked instead.
 */

import {
  columnLetter,
  deriveAppendRange,
  isDerivedAppendRange,
  parseSheetNameFromRange,
  quoteSheetName,
} from "@/core/workflows/spreadsheet/a1Range";

describe("quoteSheetName", () => {
  it("quotes an ordinary title", () => {
    expect(quoteSheetName("Sheet1")).toBe("'Sheet1'");
  });

  it("survives a title containing spaces", () => {
    expect(quoteSheetName("Email log")).toBe("'Email log'");
  });

  it("doubles an embedded apostrophe — Google's escape rule", () => {
    // Without this, "Bob's Orders" terminates the quoted string early and
    // Sheets parses a completely different (or invalid) range.
    expect(quoteSheetName("Bob's Orders")).toBe("'Bob''s Orders'");
  });
});

describe("columnLetter", () => {
  it.each([
    [1, "A"],
    [26, "Z"],
    [27, "AA"],
    [52, "AZ"],
    [53, "BA"],
  ])("maps column %i to %s", (n, expected) => {
    expect(columnLetter(n)).toBe(expected);
  });
});

describe("deriveAppendRange", () => {
  it("spans A:Z when the column count is unknown", () => {
    expect(deriveAppendRange("Sheet1")).toBe("'Sheet1'!A:Z");
  });

  it("bounds the span to the detected columns", () => {
    expect(deriveAppendRange("Email log", 6)).toBe("'Email log'!A:F");
  });

  it("reaches past column Z on a wide sheet rather than silently dropping columns", () => {
    // A 30-column sheet written with an A:Z range would lose four columns.
    expect(deriveAppendRange("Wide", 30)).toBe("'Wide'!A:AD");
  });

  it("escapes the title it derives from", () => {
    expect(deriveAppendRange("Bob's Orders", 2)).toBe("'Bob''s Orders'!A:B");
  });

  it("falls back to A:Z for a nonsense column count rather than emitting a broken range", () => {
    expect(deriveAppendRange("Sheet1", 0)).toBe("'Sheet1'!A:Z");
  });
});

describe("parseSheetNameFromRange — recovers a tab only when it is unambiguous", () => {
  it.each([
    ["Sheet1!A:Z", "Sheet1"],
    ["'Email log'!A:F", "Email log"],
    ["'Bob''s Orders'!A:Z", "Bob's Orders"],
    ["Sheet1!A2:D50", "Sheet1"],
    ["'Q3 intake'", "Q3 intake"],
    ["Sheet1", "Sheet1"],
  ])("reads %s as the tab %s", (range, expected) => {
    expect(parseSheetNameFromRange(range)).toBe(expected);
  });

  it.each([
    ["A:Z"],
    ["A1:B2"],
    ["1:1"],
    ["A1"],
  ])("returns null for %s — a range with no tab in it", (range) => {
    expect(parseSheetNameFromRange(range)).toBeNull();
  });

  it.each([
    ["'unclosed!A:Z"],
    ["!A:Z"],
    [""],
    ["   "],
    ["''!A:Z"],
  ])("returns null for the malformed range %s", (range) => {
    expect(parseSheetNameFromRange(range)).toBeNull();
  });

  it("prefers asking over guessing when a tab could be a cell reference", () => {
    // A tab really can be named "A1". Guessing would retarget the write, so
    // the honest answer is "I don't know — pick the tab".
    expect(parseSheetNameFromRange("A1")).toBeNull();
  });
});

describe("isDerivedAppendRange — protects a hand-written range", () => {
  it.each([
    ["'Email log'!A:F"],
    ["'Sheet1'!A:Z"],
    ["Sheet1!A:Z"],
    ["Sheet1!A:A"],
    ["'Q3 intake'"],
  ])("treats %s as a range the builder could have produced", (range) => {
    expect(isDerivedAppendRange(range)).toBe(true);
  });

  it.each([
    ["'Data'!B2:F10"],
    ["Sheet1!A2:Z"],
    ["Sheet1!C:F"],
    ["A:Z"],
    ["'unclosed!A:Z"],
  ])("treats %s as a deliberate choice that must not be overwritten", (range) => {
    expect(isDerivedAppendRange(range)).toBe(false);
  });

  it("round-trips its own output", () => {
    // Whatever the builder derives, it must recognise later — otherwise
    // changing the tab a second time would refuse to update the range.
    const derived = deriveAppendRange("Bob's Orders", 3);
    expect(isDerivedAppendRange(derived)).toBe(true);
    expect(parseSheetNameFromRange(derived)).toBe("Bob's Orders");
  });
});
