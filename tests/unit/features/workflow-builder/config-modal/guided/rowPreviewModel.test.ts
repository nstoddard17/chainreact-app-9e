/**
 * Honest row preview (SHEETS-GUIDED-CONFIG-1, D6).
 *
 * A preview showing realistic values the system never produced is worse
 * than no preview at all — it reads as confirmation that the workflow
 * is set up correctly. Every assertion here is about the preview
 * telling the truth regarding where its values came from, and about it
 * never inventing one.
 */

import { buildRowPreview } from "@/features/workflow-builder/config-modal/guided/rowPreviewModel";
import type { VariableSource } from "@/features/workflow-builder/hooks/useUpstreamVariables";

const gmail: VariableSource = {
  sourceId: "n-gmail",
  displayName: "Step 1 · Gmail",
  kind: "trigger",
  provider: "gmail",
  outputs: [
    { name: "subject", type: "string" },
    { name: "from", type: "string" },
  ],
};

const COLUMNS = ["Timestamp", "From", "Subject"];

function preview(
  cells: string[],
  latestValuesBySource: Record<string, unknown> | undefined = undefined,
  sources: VariableSource[] = [gmail],
) {
  return buildRowPreview({
    columns: COLUMNS,
    cells,
    sources,
    latestValuesBySource,
  });
}

describe("provenance is always stated", () => {
  it("says values are literal when the row contains no references", () => {
    const result = preview(["2026-07-31", "", "Hello"]);
    expect(result.provenance).toBe("literal-only");
    expect(result.caption).toBe("The row as you have written it");
    // It must not imply a test happened.
    expect(result.caption).not.toMatch(/last test/i);
  });

  it("claims last-test data only when every reference actually resolved", () => {
    const result = preview(
      ["2026-07-31", "{{n-gmail.from}}", "{{n-gmail.subject}}"],
      { "n-gmail": { from: "dana@example.test", subject: "Invoice 4471" } },
    );
    expect(result.provenance).toBe("real");
    expect(result.caption).toBe("Using data from your last test");
    expect(result.cells[1]!.display).toContain("dana@example.test");
    expect(result.cells[2]!.display).toContain("Invoice 4471");
  });

  it("says some values are untested when only part of the row resolved", () => {
    const result = preview(
      ["2026-07-31", "{{n-gmail.from}}", "{{n-gmail.subject}}"],
      { "n-gmail": { from: "dana@example.test" } }, // subject was never captured
    );
    expect(result.provenance).toBe("partial");
    expect(result.caption).toBe("Some values have not been tested yet");
  });

  it("asks for a test rather than inventing values when nothing was captured", () => {
    const result = preview(["", "{{n-gmail.from}}", ""], {});
    expect(result.provenance).toBe("untested");
    expect(result.caption).toBe("Run a test to preview real values");
  });
});

describe("nothing is ever fabricated", () => {
  it("shows an unresolved reference AS the reference, not as a sample value", () => {
    const result = preview(["", "{{n-gmail.from}}", ""], {});
    const cell = result.cells[1]!;
    expect(cell.state).toBe("untested");
    expect(cell.display).toBe("{{n-gmail.from}}");
    // The single most important negative assertion in this file.
    expect(cell.display).not.toMatch(/@example\.com|John|Jane|Acme/);
  });

  it("never claims a destination row number", () => {
    const result = preview(["a", "b", "c"], {});
    const rendered = JSON.stringify(result);
    expect(rendered).not.toMatch(/row 1[0-9]{2}/i);
    expect(rendered).not.toMatch(/next row/i);
  });

  it("leaves a deliberately blank column blank instead of filling it", () => {
    const result = preview(["a", "", "c"]);
    expect(result.cells[1]!.state).toBe("blank");
    expect(result.cells[1]!.display).toBe("");
  });

  it("resolves a mixed literal-and-reference cell without losing the literal text", () => {
    const result = preview(["Re: {{n-gmail.subject}}", "", ""], {
      "n-gmail": { subject: "Invoice 4471" },
    });
    expect(result.cells[0]!.state).toBe("resolved");
    expect(result.cells[0]!.display).toContain("Re: ");
    expect(result.cells[0]!.display).toContain("Invoice 4471");
  });
});

describe("a reference to a step that no longer exists", () => {
  it("is reported as broken rather than silently blanked", () => {
    const result = preview(["", "{{n-deleted.email}}", ""], {
      "n-gmail": { from: "x" },
    });
    expect(result.provenance).toBe("broken");
    expect(result.cells[1]!.state).toBe("broken");
    expect(result.brokenReferences).toEqual(["{{n-deleted.email}}"]);
    expect(result.caption).toMatch(/no longer exists/i);
  });

  it("outranks a partial result — a broken reference is the more urgent fact", () => {
    const result = preview(
      ["{{n-gmail.subject}}", "{{n-deleted.email}}", ""],
      { "n-gmail": { subject: "Invoice" } },
    );
    expect(result.provenance).toBe("broken");
  });

  it("does not treat an untested-but-existing step as broken", () => {
    const result = preview(["", "{{n-gmail.from}}", ""], {});
    expect(result.brokenReferences).toEqual([]);
    expect(result.cells[1]!.state).toBe("untested");
  });
});

describe("column labelling", () => {
  it("labels each value with its destination column", () => {
    const result = preview(["2026-07-31", "", "Hello"]);
    expect(result.cells.map((c) => c.columnName)).toEqual(COLUMNS);
  });

  it("falls back to a positional label when there are more cells than columns", () => {
    const result = buildRowPreview({
      columns: ["Only"],
      cells: ["a", "b"],
      sources: [],
      latestValuesBySource: {},
    });
    expect(result.cells[1]!.columnName).toBe("Column 2");
  });
});
