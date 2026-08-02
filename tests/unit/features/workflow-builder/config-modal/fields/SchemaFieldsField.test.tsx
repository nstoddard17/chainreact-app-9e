/**
 * `schema-fields` editor (AI-PROVIDER-4 CS-4).
 *
 * Drives the real renderer + the real validator (no mocked business rules)
 * and asserts the committed VALUE shape, since that value is what the AI
 * processor compiles into the model's output contract.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SchemaFieldsField } from "@/features/workflow-builder/config-modal/fields/SchemaFieldsField";
import { UserDefinedSchemaSchema } from "@/contracts/aiProcessing";
import type { FieldMeta } from "@/contracts/actionMeta";

const field = (overrides: Partial<FieldMeta> = {}): FieldMeta =>
  ({
    name: "expectedFields",
    label: "Fields to extract",
    type: "schema-fields",
    required: true,
    ...overrides,
  }) as FieldMeta;

function renderField(value: unknown, overrides: Partial<FieldMeta> = {}) {
  const onChange = jest.fn();
  const utils = render(
    <SchemaFieldsField
      field={field(overrides)}
      value={value}
      onChange={onChange}
    />,
  );
  return { onChange, ...utils };
}

const rows = (...names: string[]) => ({
  fields: names.map((name) => ({ name, type: "string" as const })),
});

describe("SchemaFieldsField", () => {
  it("shows an empty state and no rows when unset", () => {
    renderField(undefined);
    expect(screen.getByText(/No fields yet/i)).toBeInTheDocument();
    expect(screen.queryByTestId("schema-field-row-0")).not.toBeInTheDocument();
  });

  it("adds a row with a sensible default type", async () => {
    const user = userEvent.setup();
    const { onChange } = renderField(undefined);
    await user.click(screen.getByRole("button", { name: /add field/i }));
    expect(onChange).toHaveBeenCalledWith({ fields: [{ name: "", type: "string" }] });
  });

  it("renders one row per committed field, in order", () => {
    renderField(rows("employee_name", "gross_pay"));
    expect(screen.getByTestId("schema-field-row-0")).toBeInTheDocument();
    expect(screen.getByTestId("schema-field-row-1")).toBeInTheDocument();
    expect(screen.getByLabelText("Field 1 name")).toHaveValue("employee_name");
    expect(screen.getByLabelText("Field 2 name")).toHaveValue("gross_pay");
  });

  it("normalizes a typed name into a safe variable identifier on blur", async () => {
    const user = userEvent.setup();
    const { onChange } = renderField(rows(""));
    const input = screen.getByLabelText("Field 1 name");
    await user.type(input, "Employee Name");
    // Not normalized mid-typing — that would fight the user.
    expect(input).toHaveValue("Employee Name");
    await user.tab();
    expect(onChange).toHaveBeenLastCalledWith({
      fields: [{ name: "employee_name", type: "string" }],
    });
  });

  it("removes a row and commits undefined when the last row goes", async () => {
    const user = userEvent.setup();
    const { onChange } = renderField(rows("only_one"));
    await user.click(screen.getByRole("button", { name: /remove field 1/i }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("removes the correct row when several exist", async () => {
    const user = userEvent.setup();
    const { onChange } = renderField(rows("a", "b", "c"));
    await user.click(screen.getByRole("button", { name: /remove field 2/i }));
    expect(onChange).toHaveBeenCalledWith({
      fields: [
        { name: "a", type: "string" },
        { name: "c", type: "string" },
      ],
    });
  });

  it("reorders rows, and the ends are not movable past the boundary", async () => {
    const user = userEvent.setup();
    const { onChange } = renderField(rows("a", "b"));
    expect(screen.getByRole("button", { name: /move field 1 up/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /move field 2 down/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /move field 1 down/i }));
    expect(onChange).toHaveBeenCalledWith({
      fields: [
        { name: "b", type: "string" },
        { name: "a", type: "string" },
      ],
    });
  });

  it("toggles required on a row", async () => {
    const user = userEvent.setup();
    const { onChange } = renderField(rows("amount"));
    await user.click(screen.getByLabelText("Field 1 required"));
    expect(onChange).toHaveBeenLastCalledWith({
      fields: [{ name: "amount", type: "string", required: true }],
    });
  });

  it("edits a row description and drops it when cleared", async () => {
    const user = userEvent.setup();
    const { onChange } = renderField({
      fields: [{ name: "amount", type: "string", description: "Total" }],
    });
    const input = screen.getByLabelText("Field 1 description");
    expect(input).toHaveValue("Total");
    await user.clear(input);
    expect(onChange).toHaveBeenLastCalledWith({
      fields: [{ name: "amount", type: "string" }],
    });
  });

  it("surfaces a duplicate-name error on the offending row", () => {
    renderField(rows("amount", "Amount"));
    const secondRow = screen.getByTestId("schema-field-row-1");
    expect(within(secondRow).getByRole("alert")).toHaveTextContent(/unique/i);
    const firstRow = screen.getByTestId("schema-field-row-0");
    expect(within(firstRow).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("surfaces an invalid-name error with plain-language guidance", () => {
    renderField(rows("has space"));
    expect(screen.getByTestId("schema-field-row-0")).toHaveTextContent(
      /letters, numbers, and underscores/i,
    );
  });

  // The 200-row count/cap behavior lives in SchemaFieldsField.capacity.test.tsx
  // (SCHEMA-FIELDS-TEST-PERFORMANCE-FIX-1): mounting 200 REAL rows cost ~1.3s
  // and tripped the 5s default on the 2-core CI runner, while the capacity
  // logic under test never reads row internals. That file stubs only the row;
  // THIS file keeps every real-row behavior test.

  it("round-trips: what it renders from is what it commits back", async () => {
    const user = userEvent.setup();
    const original = {
      fields: [
        { name: "employee_name", type: "string" as const, required: true },
        { name: "gross_pay", type: "currency" as const, description: "Dollars" },
      ],
    };
    const { onChange } = renderField(original);
    // A no-op-ish edit (toggle required on, then read the committed value).
    await user.click(screen.getByLabelText("Field 2 required"));
    const committed = onChange.mock.calls[0]![0];
    expect(committed).toEqual({
      fields: [
        { name: "employee_name", type: "string", required: true },
        { name: "gross_pay", type: "currency", required: true, description: "Dollars" },
      ],
    });
    // And the committed value satisfies the runtime contract.
    expect(UserDefinedSchemaSchema.safeParse(committed).success).toBe(true);
  });
});
