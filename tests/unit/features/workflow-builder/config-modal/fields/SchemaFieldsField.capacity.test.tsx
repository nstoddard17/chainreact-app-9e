/**
 * `schema-fields` editor — capacity behavior at the REAL 200-row maximum
 * (AI-PROVIDER-4 CS-4 · SCHEMA-FIELDS-TEST-PERFORMANCE-FIX-1).
 *
 * Split out of SchemaFieldsField.test.tsx: rendering 200 REAL rows (each a
 * Radix Select + inputs + four buttons) cost ~1.3s of pure mount time and
 * pushed the cap test past Jest's 5s default on the 2-core CI runner. The
 * capacity behavior under test — row COUNT display, the 200 cap, the disabled
 * Add button, and the no-commit guarantee — is owned entirely by the PARENT
 * (`rows.length`, `atMax`, `addRow`'s guard) and never reads anything from
 * inside a row. So this file stubs ONLY `SchemaFieldsRow` with a cheap `<li>`;
 * the parent, the real `_schemaFieldsValidator`, the real Add button, and the
 * real cap copy all stay live, and every interaction is real `userEvent`.
 *
 * Row INTERNALS (typing, blur normalization, remove/reorder/required/
 * description) keep their un-stubbed coverage in SchemaFieldsField.test.tsx;
 * the validator's own >200 rejection is pinned in schemaFieldsValidator.test.ts.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SchemaFieldsField } from "@/features/workflow-builder/config-modal/fields/SchemaFieldsField";
import { SCHEMA_FIELDS_MAX_ROWS } from "@/features/workflow-builder/config-modal/fields/_schemaFieldsValidator";
import type { FieldMeta } from "@/contracts/actionMeta";

jest.mock(
  "@/features/workflow-builder/config-modal/fields/SchemaFieldsRow",
  () => ({
    SchemaFieldsRow: ({ index }: { index: number }) => (
      <li data-testid={`schema-field-row-${index}`} />
    ),
  }),
);

const field = () =>
  ({
    name: "expectedFields",
    label: "Fields to extract",
    type: "schema-fields",
    required: true,
  }) as FieldMeta;

const manyRows = (count: number) => ({
  fields: Array.from({ length: count }, (_, i) => ({
    name: `f_${i}`,
    type: "string" as const,
  })),
});

function renderField(value: unknown) {
  const onChange = jest.fn();
  render(<SchemaFieldsField field={field()} value={value} onChange={onChange} />);
  return { onChange };
}

describe("SchemaFieldsField capacity (200-row maximum)", () => {
  it("the supported maximum is exactly 200", () => {
    // The number in the product promise, pinned as a literal so the rest of
    // this file may build fixtures from the constant without the cap being
    // silently lowered.
    expect(SCHEMA_FIELDS_MAX_ROWS).toBe(200);
  });

  it("shows the row count, and caps adding at the maximum", async () => {
    const user = userEvent.setup();
    const { onChange } = renderField(manyRows(SCHEMA_FIELDS_MAX_ROWS));
    // All 200 rows are really mounted — the count/cap state reflects the
    // full list, not a truncation.
    expect(screen.getAllByTestId(/^schema-field-row-\d+$/)).toHaveLength(200);
    expect(screen.getByText(/Maximum 200 fields\./i)).toBeInTheDocument();
    const addButton = screen.getByRole("button", { name: /add field/i });
    expect(addButton).toBeDisabled();
    await user.click(addButton);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("one below the maximum still counts and still adds — the cap is not lower than 200", async () => {
    const user = userEvent.setup();
    const { onChange } = renderField(manyRows(SCHEMA_FIELDS_MAX_ROWS - 1));
    expect(screen.getByText(/^199 fields$/i)).toBeInTheDocument();
    const addButton = screen.getByRole("button", { name: /add field/i });
    expect(addButton).toBeEnabled();
    await user.click(addButton);
    expect(onChange).toHaveBeenCalledTimes(1);
    const committed = onChange.mock.calls[0]![0] as { fields: unknown[] };
    expect(committed.fields).toHaveLength(200);
  });
});
