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
});
