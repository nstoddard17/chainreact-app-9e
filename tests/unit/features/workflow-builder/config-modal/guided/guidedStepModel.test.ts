/**
 * Guided step model (SHEETS-GUIDED-CONFIG-1).
 *
 * The interesting rules here are all user-safety rules, and all of them
 * are decided in pure code so they can be proven without rendering:
 *
 *   - A column left deliberately blank is a finished state, not an
 *     error. Blocking it would force people to invent values.
 *   - A hand-written cell range survives a tab change. Silently
 *     re-deriving it would change which cells a live workflow writes to.
 *   - A node saved before the tab picker existed is EXPLAINED, never
 *     rewritten on open.
 */

import {
  buildGuidedSteps,
  countFilledCells,
  firstIncompleteStep,
  legacyDestinationHint,
  planDerivedRange,
} from "@/features/workflow-builder/config-modal/guided/guidedStepModel";
import { getGuidedSpreadsheetAdapter } from "@/features/workflow-builder/config-modal/guided/guidedSpreadsheetAdapters";
import { googleSheetsAppendRowMeta } from "@/integrations/google-sheets/actions/appendRow.meta";

const adapter = getGuidedSpreadsheetAdapter("google-sheets:append_row")!;
const fields = googleSheetsAppendRowMeta.fields;

function steps(values: Record<string, unknown>, columnCount?: number) {
  return buildGuidedSteps({
    adapter,
    fields,
    values,
    ...(columnCount !== undefined && { columnCount }),
  });
}

const CONFIGURED = {
  spreadsheetId: "sheet-1",
  sheetName: "Email log",
  values: ["2026-07-31", "", "Invoice 4471"],
  valueInputOption: "USER_ENTERED",
  range: "'Email log'!A:C",
};

describe("step completion", () => {
  it("treats a fully answered node as complete on every step", () => {
    const result = steps(CONFIGURED, 3);
    expect(result.map((s) => s.complete)).toEqual([true, true, true]);
  });

  it("does not call the destination done until BOTH the file and the tab are chosen", () => {
    expect(steps({ spreadsheetId: "sheet-1" })[0]!.complete).toBe(false);
    expect(
      steps({ spreadsheetId: "sheet-1", sheetName: "Email log" })[0]!.complete,
    ).toBe(true);
  });

  it("counts a row with deliberately blank columns as finished", () => {
    // The middle column is intentionally empty; the row is still valid and
    // must not be treated as unfinished configuration.
    const result = steps({ ...CONFIGURED, values: ["a", "", ""] }, 3);
    expect(result[1]!.complete).toBe(true);
  });

  it("does not call the mapping step done when NOTHING was filled in", () => {
    expect(steps({ ...CONFIGURED, values: [] }, 3)[1]!.complete).toBe(false);
    expect(steps({ ...CONFIGURED, values: undefined }, 3)[1]!.complete).toBe(
      false,
    );
  });

  it("keeps the write step unfinished until the Q11 choice is actually made", () => {
    // insertDataOption has a declared default, so it is answered; the
    // value-input choice has none and must stay outstanding.
    const { valueInputOption: _unset, ...withoutChoice } = CONFIGURED;
    expect(steps(withoutChoice, 3)[2]!.complete).toBe(false);
    expect(steps(CONFIGURED, 3)[2]!.complete).toBe(true);
  });

  it("opens on the first unfinished step", () => {
    expect(firstIncompleteStep(steps({}, 0))).toBe("destination");
    expect(firstIncompleteStep(steps({ spreadsheetId: "s", sheetName: "t" }, 3))).toBe(
      "mapping",
    );
    const { valueInputOption: _unset, ...noChoice } = CONFIGURED;
    expect(firstIncompleteStep(steps(noChoice, 3))).toBe("write");
  });
});

describe("collapsed-step summaries say what was chosen", () => {
  it("names the file and tab", () => {
    expect(steps(CONFIGURED, 3)[0]!.summary).toBe("sheet-1 · Email log");
  });

  it("counts filled columns against the detected total", () => {
    expect(steps(CONFIGURED, 3)[1]!.summary).toBe("2 of 3 columns filled in");
  });

  it("falls back to a plain count before columns are known", () => {
    expect(steps(CONFIGURED)[1]!.summary).toBe("2 values set");
  });

  it("uses the human option labels, never the raw API enum", () => {
    const summary = steps(CONFIGURED, 3)[2]!.summary;
    expect(summary).toContain("Like something you typed in");
    expect(summary).not.toContain("USER_ENTERED");
    expect(summary).not.toContain("INSERT_ROWS");
  });
});

describe("countFilledCells", () => {
  it("counts a blank between two filled cells as blank, not missing", () => {
    expect(countFilledCells(["a", "", "b"])).toBe(2);
  });

  it("counts explicit zero and false as filled", () => {
    // Q5 invariant — 0 and false are values a user chose.
    expect(countFilledCells([0, false])).toBe(2);
  });

  it("ignores whitespace-only cells", () => {
    expect(countFilledCells(["   ", "x"])).toBe(1);
  });

  it("survives a non-array value", () => {
    expect(countFilledCells(undefined)).toBe(0);
    expect(countFilledCells("nope")).toBe(0);
  });
});

describe("planDerivedRange — the range follows the tab, unless a person wrote it", () => {
  it("derives a range for a brand-new node", () => {
    expect(
      planDerivedRange({ adapter, values: {}, nextTab: "Email log", columnCount: 6 }),
    ).toEqual({ kind: "derive", field: "range", value: "'Email log'!A:F" });
  });

  it("replaces a range it derived earlier when the tab changes", () => {
    expect(
      planDerivedRange({
        adapter,
        values: { range: "'Archive'!A:Z" },
        nextTab: "Email log",
      }),
    ).toEqual({ kind: "derive", field: "range", value: "'Email log'!A:Z" });
  });

  it("replaces a legacy unquoted whole-column range — same meaning, right tab", () => {
    expect(
      planDerivedRange({
        adapter,
        values: { range: "Sheet1!A:Z" },
        nextTab: "Email log",
        columnCount: 3,
      }),
    ).toEqual({ kind: "derive", field: "range", value: "'Email log'!A:C" });
  });

  it("KEEPS a hand-written range and reports it instead of overwriting", () => {
    // This is the assertion that protects a real user decision: someone whose
    // table starts at B2 must not lose that because they re-picked the tab.
    expect(
      planDerivedRange({
        adapter,
        values: { range: "'Data'!B2:F10" },
        nextTab: "Email log",
      }),
    ).toEqual({ kind: "keep-custom", field: "range", current: "'Data'!B2:F10" });
  });

  it("does nothing when the tab is cleared", () => {
    expect(
      planDerivedRange({ adapter, values: { range: "'X'!A:Z" }, nextTab: "" }),
    ).toEqual({ kind: "none" });
  });

  it("does nothing for a provider that has no range to derive", () => {
    const { derivedRange: _none, ...noRange } = adapter;
    expect(
      planDerivedRange({ adapter: noRange, values: {}, nextTab: "Sheet1" }),
    ).toEqual({ kind: "none" });
  });
});

describe("legacyDestinationHint — explain a saved range, never rewrite it", () => {
  it("offers the tab it can read out of a saved range", () => {
    expect(
      legacyDestinationHint({
        adapter,
        values: { spreadsheetId: "s", range: "'Email log'!A:F" },
      }),
    ).toEqual({ kind: "suggest-tab", tab: "Email log", range: "'Email log'!A:F" });
  });

  it("says plainly when the saved range names no tab", () => {
    expect(
      legacyDestinationHint({
        adapter,
        values: { spreadsheetId: "s", range: "A:Z" },
      }),
    ).toEqual({ kind: "unreadable", range: "A:Z" });
  });

  it("stays quiet once the tab is answered", () => {
    expect(
      legacyDestinationHint({
        adapter,
        values: { sheetName: "Email log", range: "'Email log'!A:F" },
      }),
    ).toEqual({ kind: "none" });
  });

  it("stays quiet for a brand-new node with nothing saved", () => {
    expect(legacyDestinationHint({ adapter, values: {} })).toEqual({
      kind: "none",
    });
  });
});
