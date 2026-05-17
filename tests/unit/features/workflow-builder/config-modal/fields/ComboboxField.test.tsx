/**
 * Tests for ComboboxField. Radix Popover + cmdk portal the searchable
 * surface, so tests focus on the closed-state trigger button (selected
 * label, placeholder, multi-select / missing-options guards). Open-state
 * interactions are covered by SchemaForm integration tests.
 */
import { render, screen } from "@testing-library/react";
import type { FieldMeta } from "@/contracts/actionMeta";
import { ComboboxField } from "@/features/workflow-builder/config-modal/fields/ComboboxField";

function field(overrides: Partial<FieldMeta> = {}): FieldMeta {
  return {
    name: "channelId",
    label: "Channel",
    type: "combobox",
    required: true,
    options: [
      { value: "C1", label: "#general" },
      { value: "C2", label: "#random" },
    ],
    ...overrides,
  } as FieldMeta;
}

describe("ComboboxField", () => {
  it("renders the selected option's label inside the trigger", () => {
    render(
      <ComboboxField field={field()} value="C1" onChange={jest.fn()} />,
    );
    expect(
      screen.getByRole("combobox", { name: "Channel" }),
    ).toHaveTextContent("#general");
  });

  it("renders placeholder text when value is empty", () => {
    render(
      <ComboboxField
        field={field({ placeholder: "Pick a channel" })}
        value=""
        onChange={jest.fn()}
      />,
    );
    expect(
      screen.getByRole("combobox", { name: "Channel" }),
    ).toHaveTextContent("Pick a channel");
  });

  it("surfaces 'multi-select not yet implemented' when meta declares multiple", () => {
    render(
      <ComboboxField
        field={field({ multiple: true })}
        value=""
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      /Multi-select combobox not yet implemented/i,
    );
  });

  it("surfaces 'No options available' when options are missing", () => {
    render(
      <ComboboxField
        field={field({ options: undefined })}
        value=""
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/No options available/);
  });
});
