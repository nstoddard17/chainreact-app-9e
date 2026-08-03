/** @jest-environment node */
/**
 * Conservative mapping suggestions (SHEETS-GUIDED-CONFIG-1, D3).
 *
 * The failure this suite exists to prevent: a suggestion that is wrong
 * but plausible. It gets accepted at a glance and then writes the wrong
 * data into a real spreadsheet on every run, silently, until somebody
 * reads the sheet.
 *
 * So the assertions below are mostly about what the matcher REFUSES to
 * do. "No suggestion" is the correct, expected answer in every
 * ambiguous case.
 */

import {
  duplicateColumnNames,
  normalizeName,
  suggestMappings,
} from "@/features/workflow-builder/config-modal/guided/mappingSuggestions";
import type { VariableSource } from "@/features/workflow-builder/hooks/useUpstreamVariables";

const gmail: VariableSource = {
  sourceId: "n-gmail",
  displayName: "Step 1 · Gmail",
  kind: "trigger",
  provider: "gmail",
  outputs: [
    { name: "Subject", type: "string" },
    { name: "From", type: "string" },
    { name: "Received at", type: "string" },
  ],
};

const drive: VariableSource = {
  sourceId: "n-drive",
  displayName: "Step 2 · Drive",
  kind: "action",
  provider: "google-drive",
  outputs: [{ name: "File link", type: "string" }],
};

function suggest(columns: string[], cells: string[], sources = [gmail, drive]) {
  return suggestMappings({ columns, cells, sources });
}

describe("normalizeName", () => {
  it.each([
    ["File link", "file link"],
    ["file_link", "file link"],
    ["File-Link", "file link"],
    ["  FILE   LINK  ", "file link"],
  ])("folds %s to a comparable key", (input, expected) => {
    expect(normalizeName(input)).toBe(expected);
  });

  it("keeps genuinely different names different", () => {
    // Near-misses must NOT collapse — that is where fuzzy matching goes wrong.
    expect(normalizeName("Sent at")).not.toBe(normalizeName("Sent"));
    expect(normalizeName("Email")).not.toBe(normalizeName("Emails"));
  });
});

describe("suggests only an exact, unambiguous name match", () => {
  it("matches a column to the single upstream output of the same name", () => {
    const result = suggest(["Subject"], [""]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      columnIndex: 0,
      columnName: "Subject",
      sourceLabel: "Step 1 · Gmail",
      outputLabel: "Subject",
      token: "{{n-gmail.Subject}}",
    });
  });

  it("matches across punctuation and case differences", () => {
    const result = suggest(["file_link"], [""]);
    expect(result[0]?.token).toBe("{{n-drive.File link}}");
  });

  it("offers nothing for a column no upstream step provides", () => {
    expect(suggest(["Status"], [""])).toEqual([]);
  });

  it("never guesses between two equally plausible sources", () => {
    // Two steps both expose "Subject" — there is no defensible pick.
    const second: VariableSource = {
      ...gmail,
      sourceId: "n-other",
      displayName: "Step 3 · Outlook",
      outputs: [{ name: "Subject", type: "string" }],
    };
    expect(suggest(["Subject"], [""], [gmail, second])).toEqual([]);
  });

  it("does not fuzzy-match a near miss", () => {
    expect(suggest(["Subject line"], [""])).toEqual([]);
    expect(suggest(["Sender"], [""])).toEqual([]);
  });

  it("never overwrites a column the user already filled in", () => {
    expect(suggest(["Subject"], ["already chosen"])).toEqual([]);
  });

  it("skips duplicate destination headers rather than picking one arbitrarily", () => {
    // Which "Subject" column would the value belong to? Unanswerable.
    expect(suggest(["Subject", "Subject"], ["", ""])).toEqual([]);
  });

  it("proposes several columns at once when each match is unambiguous", () => {
    const result = suggest(["Subject", "From", "File link"], ["", "", ""]);
    expect(result.map((s) => s.columnName)).toEqual([
      "Subject",
      "From",
      "File link",
    ]);
  });

  it("returns candidates only — it cannot mutate configuration", () => {
    const cells = ["", ""];
    const frozenColumns = Object.freeze(["Subject", "From"]) as string[];
    suggest(frozenColumns, cells);
    // Nothing was written into the caller's arrays.
    expect(cells).toEqual(["", ""]);
  });
});

describe("what must never be proposed for a spreadsheet cell", () => {
  it("refuses to offer a sensitive output", () => {
    const secretive: VariableSource = {
      sourceId: "n-secret",
      displayName: "Step 4",
      kind: "action",
      provider: "native",
      outputs: [{ name: "Token", type: "string", sensitive: true }],
    };
    // Writing a secret into a shared document is not a convenience.
    expect(suggest(["Token"], [""], [secretive])).toEqual([]);
  });

  it("offers a nested leaf, not the object that contains it", () => {
    const nested: VariableSource = {
      sourceId: "n-nested",
      displayName: "Step 5",
      kind: "action",
      provider: "native",
      outputs: [
        {
          name: "customer",
          type: "object",
          fields: [{ name: "Email", type: "string" }],
        },
      ],
    };
    const result = suggest(["Email"], [""], [nested]);
    // A token for the object would render as [object Object] in a cell.
    expect(result[0]?.token).toBe("{{n-nested.customer.Email}}");
  });

  it("ignores blank column headers", () => {
    expect(suggest(["", "   "], ["", ""])).toEqual([]);
  });
});

describe("duplicateColumnNames", () => {
  it("names the columns that collide so the UI can explain the silence", () => {
    expect(duplicateColumnNames(["Subject", "subject", "From"])).toEqual([
      "Subject",
      "subject",
    ]);
  });

  it("is empty when every header is distinct", () => {
    expect(duplicateColumnNames(["A", "B"])).toEqual([]);
  });
});
