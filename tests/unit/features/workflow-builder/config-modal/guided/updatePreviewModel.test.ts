/** @jest-environment node */
/**
 * "Changes we'll make" — what an update preview may claim
 * (SPREADSHEET-GUIDED-CONFIG-S3).
 *
 * The honesty bar is higher here than for the append preview. An append
 * preview shows a row every cell of which was authored in the builder. An
 * update preview describes a change to a row the builder has NEVER READ —
 * there is no resolver that fetches an arbitrary worksheet row — so any
 * "current value" or "resulting row" on screen would be invented, and an
 * invented before-and-after reads as confirmation that the right row was
 * found.
 */
import { buildUpdatePreview } from "@/features/workflow-builder/config-modal/guided/updatePreviewModel";
import type { UpdateCell } from "@/features/workflow-builder/config-modal/fields/spreadsheet/_updateModel";

const SOURCES = [
  {
    sourceId: "trigger",
    label: "When an invoice is created",
    outputs: [{ name: "customer", label: "Customer", path: "customer" }],
  },
] as never;

const LATEST = { trigger: { customer: "Northwind Traders" } };

function cells(...entries: UpdateCell[]): UpdateCell[] {
  return entries;
}

describe("what the preview shows", () => {
  it("lists only the columns that will change", () => {
    const preview = buildUpdatePreview({
      cells: cells(
        { column: "Name", state: "value", value: "Ada" },
        { column: "Email", state: "unchanged", value: "" },
        { column: "Notes", state: "blank", value: "" },
      ),
      sources: [],
      latestValuesBySource: undefined,
    });
    expect(preview.entries.map((e) => [e.column, e.kind])).toEqual([
      ["Name", "set"],
      ["Notes", "clear"],
    ]);
  });

  it("counts the unchanged columns rather than listing them", () => {
    const preview = buildUpdatePreview({
      cells: cells(
        { column: "A", state: "value", value: "x" },
        { column: "B", state: "unchanged", value: "" },
        { column: "C", state: "unchanged", value: "" },
      ),
      sources: [],
      latestValuesBySource: undefined,
    });
    expect(preview.unchangedCount).toBe(2);
    expect(preview.entries.map((e) => e.column)).not.toContain("B");
  });

  it("resolves a variable from REAL captured run data and says so", () => {
    const preview = buildUpdatePreview({
      cells: cells({
        column: "Customer",
        state: "value",
        value: "{{trigger.customer}}",
      }),
      sources: SOURCES,
      latestValuesBySource: LATEST,
    });
    expect(preview.entries[0]!.display).toContain("Northwind Traders");
    expect(preview.provenance).toBe("real");
    expect(preview.caption).toBe("Using data from your last test");
  });

  it("shows an untested reference AS the reference — never a plausible sample", () => {
    const preview = buildUpdatePreview({
      cells: cells({
        column: "Customer",
        state: "value",
        value: "{{trigger.customer}}",
      }),
      sources: SOURCES,
      latestValuesBySource: {},
    });
    expect(preview.entries[0]!.state).toBe("untested");
    expect(preview.entries[0]!.display).toBe("{{trigger.customer}}");
    expect(preview.caption).toBe("Run a test to preview real values");
  });

  it("reports a reference pointing at a step that is gone", () => {
    const preview = buildUpdatePreview({
      cells: cells({
        column: "Customer",
        state: "value",
        value: "{{deleted_step.name}}",
      }),
      sources: SOURCES,
      latestValuesBySource: LATEST,
    });
    expect(preview.provenance).toBe("broken");
    expect(preview.brokenReferences).toEqual(["{{deleted_step.name}}"]);
  });

  it("captions a clears-only change honestly, not as 'the row as you have written it'", () => {
    const preview = buildUpdatePreview({
      cells: cells({ column: "Notes", state: "blank", value: "" }),
      sources: [],
      latestValuesBySource: undefined,
    });
    expect(preview.caption).toBe("The columns you have chosen to empty");
    expect(preview.entries[0]!.kind).toBe("clear");
    expect(preview.entries[0]!.display).toBe("");
  });

  it("is empty when nothing has been chosen, so nothing is implied", () => {
    const preview = buildUpdatePreview({
      cells: cells({ column: "Name", state: "unchanged", value: "" }),
      sources: [],
      latestValuesBySource: undefined,
    });
    expect(preview.entries).toEqual([]);
  });
});

describe("what the preview must never claim", () => {
  it("carries no notion of the row's current contents", () => {
    const preview = buildUpdatePreview({
      cells: cells({ column: "Name", state: "value", value: "Ada" }),
      sources: [],
      latestValuesBySource: undefined,
    });
    const asText = JSON.stringify(preview).toLowerCase();
    for (const forbidden of ["before", "current", "existing", "merged", "was"]) {
      expect(asText).not.toContain(`"${forbidden}"`);
    }
    // The model exposes exactly what it can prove: the change, the count,
    // the provenance and any broken reference.
    expect(Object.keys(preview).sort()).toEqual([
      "brokenReferences",
      "caption",
      "entries",
      "provenance",
      "unchangedCount",
    ]);
  });

  it("invents nothing for a column it was given no value for", () => {
    const preview = buildUpdatePreview({
      cells: cells({ column: "Name", state: "value", value: "" }),
      sources: [],
      latestValuesBySource: undefined,
    });
    // A half-finished choice previews as blank — readiness blocks it; the
    // preview does not paper over it with an example.
    expect(preview.entries[0]!.display).toBe("");
  });
});
