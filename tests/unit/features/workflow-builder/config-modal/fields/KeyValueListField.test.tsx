/**
 * Tests for KeyValueListField (CONFIG-UX-AUDIT-1) — the visual row
 * builder that replaced Excel add_row's batch paste-JSON textarea.
 *
 * Behavior under test:
 *   - "Add row" / "Remove row" / per-row "Add column" affordances;
 *   - commits a REAL Array<Record<string, string>> (never a JSON string);
 *   - empty column names stay editable locally but are omitted from the
 *     committed value;
 *   - a new row is seeded with the previous row's column names (batch
 *     rows share columns);
 *   - removing the last row commits undefined so either-or schemas
 *     (Excel values XOR rows) don't trip on a leftover empty array.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FieldMeta } from "@/contracts/actionMeta";
import { KeyValueListField } from "@/features/workflow-builder/config-modal/fields/KeyValueListField";

function rowsField(overrides: Partial<FieldMeta> = {}): FieldMeta {
  return {
    name: "rows",
    label: "Rows (add several at once)",
    type: "keyvalue-list",
    required: false,
    listMaxItems: 1000,
    ...overrides,
  } as FieldMeta;
}

describe("KeyValueListField", () => {
  it("builds a row from column/value inputs and commits a REAL array of records", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(
      <KeyValueListField field={rowsField()} value={undefined} onChange={onChange} />,
    );

    await user.click(screen.getByTestId("keyvalue-list-rows-add-row"));
    await user.type(
      screen.getByRole("textbox", { name: /row 1 column 1 name/i }),
      "Name",
    );
    await user.type(
      screen.getByRole("textbox", { name: /row 1 column 1 value/i }),
      "Ada",
    );

    const committed = onChange.mock.lastCall![0];
    expect(committed).toEqual([{ Name: "Ada" }]);
    expect(typeof committed).not.toBe("string");
  });

  it("seeds a new row with the previous row's column names", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(
      <KeyValueListField
        field={rowsField()}
        value={[{ Name: "Ada", Email: "ada@example.com" }]}
        onChange={onChange}
      />,
    );

    await user.click(screen.getByTestId("keyvalue-list-rows-add-row"));
    // Row 2 gets Name + Email columns pre-filled with empty values.
    expect(
      screen.getByRole("textbox", { name: /row 2 column 1 name/i }),
    ).toHaveValue("Name");
    expect(
      screen.getByRole("textbox", { name: /row 2 column 2 name/i }),
    ).toHaveValue("Email");
    expect(onChange).toHaveBeenLastCalledWith([
      { Name: "Ada", Email: "ada@example.com" },
      { Name: "", Email: "" },
    ]);
  });

  it("hydrates rows from a saved Array<Record> value and supports Add column", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(
      <KeyValueListField
        field={rowsField()}
        value={[{ Name: "Ada" }]}
        onChange={onChange}
      />,
    );
    expect(
      screen.getByRole("textbox", { name: /row 1 column 1 value/i }),
    ).toHaveValue("Ada");

    await user.click(screen.getByRole("button", { name: /add column to row 1/i }));
    await user.type(
      screen.getByRole("textbox", { name: /row 1 column 2 name/i }),
      "X",
    );
    expect(onChange).toHaveBeenLastCalledWith([{ Name: "Ada", X: "" }]);
  });

  it("removing the last row commits undefined so the field drops out of the saved config", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(
      <KeyValueListField
        field={rowsField()}
        value={[{ Name: "Ada" }]}
        onChange={onChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: /^remove row 1$/i }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it("never renders JSON-authoring language", () => {
    render(
      <KeyValueListField field={rowsField()} value={undefined} onChange={jest.fn()} />,
    );
    expect(document.body.textContent).not.toMatch(/json/i);
  });

  // ── Batch R1 — silent-loss fixes ─────────────────────────────────────

  // A value typed under a nameless column was silently omitted from the
  // committed rows: visible on screen, absent from the save.
  it("a pair with a value but no column name shows a visible 'give this column a name' error; naming it clears the error and commits", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(
      <KeyValueListField field={rowsField()} value={undefined} onChange={onChange} />,
    );
    await user.click(screen.getByTestId("keyvalue-list-rows-add-row"));
    // Fresh empty pair — nothing to lose, no flag.
    expect(
      screen.queryByTestId("keyvalue-list-rows-row-0-pair-0-error"),
    ).not.toBeInTheDocument();
    await user.type(
      screen.getByRole("textbox", { name: /row 1 column 1 value/i }),
      "Ada",
    );
    expect(
      screen.getByTestId("keyvalue-list-rows-row-0-pair-0-error"),
    ).toHaveTextContent(/give this column a name/i);
    // The committed value really does omit it (the warning is truthful).
    expect(onChange).toHaveBeenLastCalledWith([{}]);
    // Correcting the name clears the error and the value lands.
    await user.type(
      screen.getByRole("textbox", { name: /row 1 column 1 name/i }),
      "Name",
    );
    expect(
      screen.queryByTestId("keyvalue-list-rows-row-0-pair-0-error"),
    ).not.toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith([{ Name: "Ada" }]);
  });

  // Duplicate column names within one row silently last-write-win in the
  // committed record. The overwrite must be visible.
  it("duplicate column names in the same row flag every occurrence; renaming clears the flags", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(
      <KeyValueListField
        field={rowsField()}
        value={[{ Name: "Ada", Email: "ada@example.com" }]}
        onChange={onChange}
      />,
    );
    const secondName = screen.getByRole("textbox", {
      name: /row 1 column 2 name/i,
    }) as HTMLInputElement;
    await user.clear(secondName);
    await user.type(secondName, "Name");
    expect(
      screen.getByTestId("keyvalue-list-rows-row-0-pair-0-error"),
    ).toHaveTextContent(/only the last value will be saved/i);
    expect(
      screen.getByTestId("keyvalue-list-rows-row-0-pair-1-error"),
    ).toHaveTextContent(/only the last value will be saved/i);
    // Truthful warning: the record really is last-write-wins.
    expect(onChange).toHaveBeenLastCalledWith([{ Name: "ada@example.com" }]);
    await user.clear(secondName);
    await user.type(secondName, "Email");
    expect(
      screen.queryByTestId("keyvalue-list-rows-row-0-pair-0-error"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("keyvalue-list-rows-row-0-pair-1-error"),
    ).not.toBeInTheDocument();
  });

  // Saved values reload with no spurious flags.
  it("hydrating saved rows renders with no pair errors", () => {
    render(
      <KeyValueListField
        field={rowsField()}
        value={[{ Name: "Ada", Email: "ada@example.com" }]}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByDisplayValue("Name")).toBeInTheDocument();
    expect(screen.getByDisplayValue("ada@example.com")).toBeInTheDocument();
    expect(
      screen.queryByTestId("keyvalue-list-rows-row-0-pair-0-error"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("keyvalue-list-rows-row-0-pair-1-error"),
    ).not.toBeInTheDocument();
  });
});
