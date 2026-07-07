/**
 * Tests for SelectField.
 *
 * Closed-state branches (selected label, placeholder, multi-select
 * guard, missing-options guard, required marker) own the bulk of the
 * coverage — they are visible without opening the menu.
 *
 * Open-state interaction (Slice 3.19): Radix Select portals its
 * content list outside the trigger's DOM subtree and calls
 * pointer-capture / scrollIntoView APIs that jsdom doesn't ship.
 * `jest.setup.ts` polyfills those so the natural
 * `click trigger → click option` flow drives `onChange`. The final
 * test below pins that pattern as the intentional, supported one;
 * integration tests use the `selectFieldOption` helper at
 * tests/integration/features/workflow-builder/helpers/selectField.ts
 * to encode the same flow.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("multiple: true renders a real multi-select (no internal renderer error) — CONFIG-UX-AUDIT-1", () => {
    render(
      <SelectField
        field={field({ multiple: true })}
        value={["GET"]}
        onChange={jest.fn()}
      />,
    );
    // The multi-pick trigger renders with the current selection count and
    // NO internal "not supported by this renderer" developer message.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/not supported by this renderer/i);
    expect(
      screen.getByTestId("multi-select-method"),
    ).toHaveTextContent("1 selected");
    // Selected chip shows the option label.
    expect(screen.getByTestId("field-method-chips")).toHaveTextContent("GET");
  });

  it("surfaces friendly copy (no renderer internals) when options are missing", () => {
    render(
      <SelectField
        field={field({ options: undefined })}
        value=""
        onChange={jest.fn()}
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/aren't available right now/i);
    // Never leak implementation language to workflow authors.
    expect(alert.textContent).not.toMatch(/optionsSource|renderer|`options`/);
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

  // Slice 3.19 — Builder Test Infrastructure: codify the supported
  // pattern for driving a Radix Select option through `userEvent` in
  // jsdom. This test exists so that if the pattern ever regresses
  // (Radix update breaks polyfills, or a future jest.setup.ts edit
  // drops them), a unit-level signal catches it before every provider
  // integration test fails downstream.
  //
  // The shape (click trigger → click option by label) mirrors the
  // `selectFieldOption` helper at
  // tests/integration/features/workflow-builder/helpers/selectField.ts.
  // Integration tests should use that helper rather than re-implement
  // this flow inline.
  it("fires onChange('high') when the user clicks the trigger then clicks the 'High' option", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <SelectField
        field={field({
          name: "importance",
          label: "Importance",
          options: [
            { value: "low", label: "Low" },
            { value: "normal", label: "Normal" },
            { value: "high", label: "High" },
          ],
        })}
        value=""
        onChange={onChange}
      />,
    );

    await user.click(screen.getByRole("combobox", { name: "Importance" }));
    await waitFor(() => {
      expect(screen.queryAllByRole("option").length).toBeGreaterThan(0);
    });
    await user.click(screen.getByRole("option", { name: "High" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("high");
  });
});
