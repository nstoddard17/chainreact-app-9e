/**
 * Tests for SchemaForm.
 *
 * Verifies:
 *   - Renders one field per FieldMeta entry through the registry.
 *   - Dispatches onChange(name, value) correctly.
 *   - Renders inline errors keyed by FieldMeta.name.
 *   - Propagates `disabled` to renderers.
 *   - Surfaces an empty-state when fields[] is empty.
 *   - Surfaces a developer-error message for an unknown FieldType
 *     (defense in depth — TypeScript prevents this at compile time).
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FieldMeta } from "@/contracts/actionMeta";
import { SchemaForm } from "@/features/workflow-builder/config-modal/SchemaForm";

const fields: readonly FieldMeta[] = [
  { name: "url", label: "URL", type: "text", required: true } as FieldMeta,
  {
    name: "body",
    label: "Body",
    type: "textarea",
    required: false,
  } as FieldMeta,
  {
    name: "method",
    label: "Method",
    type: "select",
    required: true,
    options: [
      { value: "GET", label: "GET" },
      { value: "POST", label: "POST" },
    ],
  } as FieldMeta,
  {
    name: "timeoutSeconds",
    label: "Timeout",
    type: "number",
    required: false,
    numeric: { min: 1, max: 30, integer: true, step: 1 },
  } as FieldMeta,
  { name: "active", label: "Active", type: "boolean", required: false } as FieldMeta,
];

describe("SchemaForm", () => {
  it("renders one input per field", () => {
    render(
      <SchemaForm fields={fields} values={{}} onChange={jest.fn()} />,
    );
    expect(screen.getByLabelText("URL")).toBeInTheDocument();
    expect(screen.getByLabelText("Body")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Method" })).toBeInTheDocument();
    expect(screen.getByLabelText("Timeout")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Active" })).toBeInTheDocument();
  });

  it("invokes onChange(name, value) on text input", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <SchemaForm fields={fields} values={{}} onChange={onChange} />,
    );
    await user.type(screen.getByLabelText("URL"), "x");
    expect(onChange).toHaveBeenCalledWith("url", "x");
  });

  it("renders inline errors keyed by FieldMeta.name", () => {
    render(
      <SchemaForm
        fields={fields}
        values={{}}
        errors={{ url: "URL is required.", body: "Body too long." }}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText("URL is required.")).toBeInTheDocument();
    expect(screen.getByText("Body too long.")).toBeInTheDocument();
  });

  it("propagates disabled to every renderer", () => {
    render(
      <SchemaForm fields={fields} values={{}} onChange={jest.fn()} disabled />,
    );
    expect(screen.getByLabelText("URL")).toBeDisabled();
    expect(screen.getByLabelText("Body")).toBeDisabled();
    expect(screen.getByLabelText("Timeout")).toBeDisabled();
  });

  it("renders the empty-state message when fields[] is empty", () => {
    render(
      <SchemaForm fields={[]} values={{}} onChange={jest.fn()} />,
    );
    expect(
      screen.getByText("This action has no configurable fields."),
    ).toBeInTheDocument();
  });

  it("renders a developer-error message for an unknown FieldType", () => {
    const bogus = [
      {
        name: "x",
        label: "X",
        type: "telepathy" as unknown,
        required: false,
      } as unknown as FieldMeta,
    ];
    render(
      <SchemaForm fields={bogus} values={{}} onChange={jest.fn()} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/Unknown field type/);
  });
});
