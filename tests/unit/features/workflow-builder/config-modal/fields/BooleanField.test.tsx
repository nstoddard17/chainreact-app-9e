/**
 * Tests for BooleanField (Switch-backed). Asserts the FieldShell parts
 * are still rendered (label / required marker / helper / error) plus
 * the toggle interaction.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FieldMeta } from "@/contracts/actionMeta";
import { BooleanField } from "@/features/workflow-builder/config-modal/fields/BooleanField";

function field(overrides: Partial<FieldMeta> = {}): FieldMeta {
  return {
    name: "private",
    label: "Private",
    type: "boolean",
    required: false,
    ...overrides,
  } as FieldMeta;
}

describe("BooleanField", () => {
  it("renders unchecked when value is not true", () => {
    render(
      <BooleanField field={field()} value={false} onChange={jest.fn()} />,
    );
    const sw = screen.getByRole("switch", { name: "Private" });
    expect(sw).toHaveAttribute("aria-checked", "false");
  });

  it("renders checked when value is true", () => {
    render(
      <BooleanField field={field()} value={true} onChange={jest.fn()} />,
    );
    const sw = screen.getByRole("switch", { name: "Private" });
    expect(sw).toHaveAttribute("aria-checked", "true");
  });

  it("invokes onChange(boolean) on toggle", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <BooleanField field={field()} value={false} onChange={onChange} />,
    );
    await user.click(screen.getByRole("switch", { name: "Private" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("renders required marker when required", () => {
    const { container } = render(
      <BooleanField
        field={field({ required: true })}
        value={false}
        onChange={jest.fn()}
      />,
    );
    expect(container.querySelector('[data-required="true"]')).toBeInTheDocument();
  });

  it("renders error in place of helper", () => {
    render(
      <BooleanField
        field={field({ description: "Choose visibility." })}
        value={false}
        error="Visibility is required."
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Visibility is required.");
    expect(screen.queryByText("Choose visibility.")).not.toBeInTheDocument();
  });
});
