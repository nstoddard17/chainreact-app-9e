/**
 * The three-state column model (SPREADSHEET-GUIDED-CONFIG-S3).
 *
 * The headline assertion of this whole slice lives here: OMITTED and BLANK
 * serialize differently, because the runtime handler does different things
 * with them — one preserves a customer's cell, the other erases it. Every
 * other rule in this file exists to stop that distinction leaking away.
 *
 * Pure module: no rendering, no network, no mocks of the behavior under
 * test.
 */
import {
  ambiguousConfiguredColumns,
  changedColumns,
  classifyColumns,
  incompleteValueColumns,
  isRecord,
  recordToUpdateCells,
  staleRecordEntries,
  updateCellsToRecord,
  type UpdateCell,
} from "@/features/workflow-builder/config-modal/fields/spreadsheet/_updateModel";

const COLUMNS = ["Name", "Email", "Notes"];

describe("hydration — a saved record becomes three-state cells", () => {
  it("an absent key is 'leave unchanged'", () => {
    const cells = recordToUpdateCells({ Email: "a@example.invalid" }, COLUMNS);
    expect(cells.map((c) => c.state)).toEqual(["unchanged", "value", "unchanged"]);
    // An unchanged cell carries no saved original — there was nothing saved.
    expect("saved" in cells[0]!).toBe(false);
  });

  it("an empty string is 'set to blank', not 'unchanged'", () => {
    const cells = recordToUpdateCells({ Notes: "" }, COLUMNS);
    expect(cells[2]!.state).toBe("blank");
  });

  it("hydrates by column NAME, so reordering the worksheet changes nothing", () => {
    const record = { Notes: "checked", Name: "Ada" };
    const forwards = recordToUpdateCells(record, COLUMNS);
    const backwards = recordToUpdateCells(record, [...COLUMNS].reverse());
    const asPairs = (cells: readonly UpdateCell[]) =>
      cells.map((c) => `${c.column}=${c.state}:${c.value}`).sort();
    expect(asPairs(forwards)).toEqual(asPairs(backwards));
  });

  it("renders a saved number as editable text without changing what is stored", () => {
    const cells = recordToUpdateCells({ Name: 26 }, COLUMNS);
    expect(cells[0]).toMatchObject({ state: "value", value: "26", saved: 26 });
  });

  it("a legacy null reads as 'set to blank' — which is what the handler does with it", () => {
    const cells = recordToUpdateCells({ Notes: null }, COLUMNS);
    expect(cells[2]).toMatchObject({ state: "blank", saved: null });
  });

  it("a non-record value hydrates to all-unchanged rather than throwing", () => {
    expect(recordToUpdateCells(["a", "b"], COLUMNS).map((c) => c.state)).toEqual([
      "unchanged",
      "unchanged",
      "unchanged",
    ]);
    expect(recordToUpdateCells(undefined, COLUMNS).map((c) => c.state)).toEqual([
      "unchanged",
      "unchanged",
      "unchanged",
    ]);
  });
});

describe("serialization — omitted and blank are NOT the same thing", () => {
  it("'leave unchanged' OMITS the key, so the handler preserves the cell", () => {
    const cells: UpdateCell[] = [
      { column: "Name", state: "unchanged", value: "" },
      { column: "Email", state: "value", value: "a@example.invalid" },
    ];
    const record = updateCellsToRecord(cells)!;
    expect(Object.prototype.hasOwnProperty.call(record, "Name")).toBe(false);
    expect(record).toEqual({ Email: "a@example.invalid" });
  });

  it("'set to blank' PRESENTS the key as an empty string, so the handler clears the cell", () => {
    const record = updateCellsToRecord([
      { column: "Notes", state: "blank", value: "" },
    ])!;
    expect(Object.prototype.hasOwnProperty.call(record, "Notes")).toBe(true);
    expect(record["Notes"]).toBe("");
  });

  it("the two produce genuinely different configs for the same visual emptiness", () => {
    const unchanged = updateCellsToRecord([
      { column: "Notes", state: "unchanged", value: "" },
      { column: "Name", state: "value", value: "Ada" },
    ]);
    const blank = updateCellsToRecord([
      { column: "Notes", state: "blank", value: "" },
      { column: "Name", state: "value", value: "Ada" },
    ]);
    expect(unchanged).not.toEqual(blank);
    expect(unchanged).toEqual({ Name: "Ada" });
    expect(blank).toEqual({ Name: "Ada", Notes: "" });
  });

  it("commits a variable token verbatim", () => {
    expect(
      updateCellsToRecord([
        { column: "Name", state: "value", value: "{{trigger.customer}}" },
      ]),
    ).toEqual({ Name: "{{trigger.customer}}" });
  });

  it("nothing to change answers undefined, so the key drops instead of committing {}", () => {
    expect(
      updateCellsToRecord([
        { column: "Name", state: "unchanged", value: "" },
        { column: "Email", state: "unchanged", value: "" },
      ]),
    ).toBeUndefined();
  });

  it("never authors null — the builder's one clearing representation is an empty string", () => {
    const record = updateCellsToRecord([
      { column: "Notes", state: "blank", value: "" },
    ])!;
    expect(record["Notes"]).not.toBeNull();
    expect(record["Notes"]).toBe("");
  });
});

describe("round-trip — reopening a saved node must not rewrite it", () => {
  it("an untouched legacy null survives an edit to a DIFFERENT column", () => {
    const saved = { Notes: null, Name: "Ada" };
    const cells = recordToUpdateCells(saved, COLUMNS);
    // The user edits Email only.
    const next = cells.map((c) =>
      c.column === "Email"
        ? { column: "Email", state: "value" as const, value: "a@example.invalid" }
        : c,
    );
    const committed = updateCellsToRecord(next)!;
    expect(committed["Notes"]).toBeNull();
    expect(committed["Name"]).toBe("Ada");
  });

  it("an untouched saved NUMBER stays a number rather than being stringified", () => {
    const cells = recordToUpdateCells({ Name: 26, Notes: "x" }, COLUMNS);
    const next = cells.map((c) =>
      c.column === "Notes"
        ? { column: "Notes", state: "value" as const, value: "y" }
        : c,
    );
    expect(updateCellsToRecord(next)!["Name"]).toBe(26);
  });

  it("hydrate → serialize with no edit reproduces the record exactly", () => {
    for (const saved of [
      { Name: "Ada" },
      { Notes: "" },
      { Notes: null },
      { Name: 26, Email: true },
      { Name: "Ada", Email: "", Notes: null },
    ]) {
      const cells = recordToUpdateCells(saved, COLUMNS);
      expect(updateCellsToRecord(cells)).toEqual(saved);
    }
  });

  it("key ORDER has no effect on meaning", () => {
    const a = recordToUpdateCells({ Name: "Ada", Notes: "n" }, COLUMNS);
    const b = recordToUpdateCells({ Notes: "n", Name: "Ada" }, COLUMNS);
    expect(updateCellsToRecord(a)).toEqual(updateCellsToRecord(b));
  });

  it("editing a cell DROPS the saved original, so the authored value wins", () => {
    const cells = recordToUpdateCells({ Name: 26 }, COLUMNS);
    const edited: UpdateCell[] = [
      { column: "Name", state: "value", value: "27" },
      ...cells.slice(1),
    ];
    expect(updateCellsToRecord(edited)!["Name"]).toBe("27");
  });
});

describe("stale keys — a renamed or deleted column is preserved, never dropped", () => {
  it("separates saved keys that match no detected column", () => {
    expect(staleRecordEntries({ Name: "Ada", Phone: "x" }, COLUMNS)).toEqual({
      Phone: "x",
    });
  });

  it("re-emits stale keys on commit, so saving cannot silently lose one", () => {
    const saved = { Name: "Ada", Phone: "x" };
    const cells = recordToUpdateCells(saved, COLUMNS);
    const stale = staleRecordEntries(saved, COLUMNS);
    expect(updateCellsToRecord(cells, stale)).toEqual(saved);
  });

  it("a config that is ONLY stale keys still round-trips rather than becoming undefined", () => {
    const saved = { Phone: "x" };
    expect(
      updateCellsToRecord(
        recordToUpdateCells(saved, COLUMNS),
        staleRecordEntries(saved, COLUMNS),
      ),
    ).toEqual(saved);
  });

  it("columns failing to load makes EVERY saved key stale — and none are lost", () => {
    const saved = { Name: "Ada", Notes: "" };
    expect(
      updateCellsToRecord(
        recordToUpdateCells(saved, []),
        staleRecordEntries(saved, []),
      ),
    ).toEqual(saved);
  });
});

describe("duplicate headings — surfaced, never silently resolved", () => {
  it("marks identical raw headings as duplicate-name", () => {
    const classified = classifyColumns([
      { value: "Name", label: "Name" },
      { value: "Email", label: "Email" },
      { value: "Name", label: "Name" },
    ]);
    expect(classified.map((c) => c.ambiguity)).toEqual([
      "duplicate-name",
      "none",
      "duplicate-name",
    ]);
  });

  it("marks headings that only DIFFER by whitespace as duplicate-label", () => {
    const classified = classifyColumns([
      { value: "Name", label: "Name" },
      { value: "Name ", label: "Name" },
    ]);
    expect(classified.map((c) => c.ambiguity)).toEqual([
      "duplicate-label",
      "duplicate-label",
    ]);
  });

  it("keeps every duplicate in the list — a customer's column is never hidden", () => {
    expect(
      classifyColumns([
        { value: "Name", label: "Name" },
        { value: "Name", label: "Name" },
      ]),
    ).toHaveLength(2);
  });

  it("flags a heading whose raw text differs from its display label", () => {
    const [trimmed, plain] = classifyColumns([
      { value: "Name ", label: "Name" },
      { value: "Email", label: "Email" },
    ]);
    expect(trimmed!.hasHiddenWhitespace).toBe(true);
    expect(plain!.hasHiddenWhitespace).toBe(false);
    // A lone whitespace heading is still unambiguous and therefore usable.
    expect(trimmed!.ambiguity).toBe("none");
  });

  it("reports a CONFIGURED column whose target is ambiguous", () => {
    const classified = classifyColumns([
      { value: "Name", label: "Name" },
      { value: "Name", label: "Name" },
      { value: "Email", label: "Email" },
    ]);
    const cells: UpdateCell[] = [
      { column: "Name", state: "value", value: "Ada" },
      { column: "Name", state: "unchanged", value: "" },
      { column: "Email", state: "value", value: "x" },
    ];
    expect(ambiguousConfiguredColumns(cells, classified)).toEqual(["Name"]);
  });

  it("an ambiguous column left unchanged is not a problem to report", () => {
    const classified = classifyColumns([
      { value: "Name", label: "Name" },
      { value: "Name", label: "Name" },
    ]);
    expect(
      ambiguousConfiguredColumns(
        [
          { column: "Name", state: "unchanged", value: "" },
          { column: "Name", state: "unchanged", value: "" },
        ],
        classified,
      ),
    ).toEqual([]);
  });
});

describe("half-finished choices are not quietly downgraded", () => {
  it("names a column set to 'a value' with nothing typed", () => {
    expect(
      incompleteValueColumns([
        { column: "Name", state: "value", value: "   " },
        { column: "Email", state: "value", value: "x" },
        { column: "Notes", state: "blank", value: "" },
      ]),
    ).toEqual(["Name"]);
  });

  it("serializing one does NOT turn it into a clear", () => {
    // Erasing a customer's cell because someone stopped half-way through
    // choosing is the exact outcome the three-state model exists to prevent.
    const record = updateCellsToRecord([
      { column: "Name", state: "value", value: "" },
    ]);
    expect(record).toEqual({ Name: "" });
    // …and readiness is what stops it reaching the handler.
    expect(
      incompleteValueColumns([{ column: "Name", state: "value", value: "" }]),
    ).toEqual(["Name"]);
  });
});

describe("small helpers", () => {
  it("counts the columns that will actually be written", () => {
    expect(
      changedColumns([
        { column: "a", state: "unchanged", value: "" },
        { column: "b", state: "blank", value: "" },
        { column: "c", state: "value", value: "x" },
      ]).map((c) => c.column),
    ).toEqual(["b", "c"]);
  });

  it("recognizes a record and rejects arrays and null", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
  });
});
