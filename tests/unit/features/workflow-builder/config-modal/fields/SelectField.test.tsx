/**
 * Tests for SelectField. Radix Select portals its content, so the tests
 * focus on the trigger shape (correct selected label / placeholder) +
 * the meta-shape guards (multi-select error, missing-options error)
 * which are visible without opening the menu.
 */
import { render, screen } from "@testing-library/react";
import type { FieldMeta } from "@/contracts/actionMeta";
import { SelectField } from "@/features/workflow-builder/config-modal/fields/SelectField";

function field(overrides: Partial<FieldMeta> = {}): FieldMeta {
  return {
    name: "method",
    label: "Method",
    type: "select",
    required: true,
    options: [
      { value: "GET", label: "GET" },
      { value: "POST", label: "POST" },
    ],
    ...overrides,
  } as FieldMeta;
}

describe("SelectField", () => {
  it("renders the selected option's label inside the trigger", () => {
    render(
      <SelectField field={field()} value="POST" onChange={jest.fn()} />,
    );
    expect(screen.getByRole("combobox", { name: "Method" })).toHaveTextContent("POST");
  });

  it("renders placeholder when value is empty", () => {
    render(
      <SelectField
        field={field({ placeholder: "Choose a method" })}
        value=""
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Method" })).toHaveTextContent(
      "Choose a method",
    );
  });

  it("surfaces a clear error when meta declares multiple", () => {
    render(
      <SelectField
        field={field({ multiple: true })}
        value=""
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/Multi-select on type 'select'/);
  });

  it("surfaces a clear error when options are missing", () => {
    render(
      <SelectField
        field={field({ options: undefined })}
        value=""
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/No options available/);
  });

  it("renders required marker", () => {
    const { container } = render(
      <SelectField
        field={field({ required: true })}
        value=""
        onChange={jest.fn()}
      />,
    );
    expect(container.querySelector('[data-required="true"]')).toBeInTheDocument();
  });
});
