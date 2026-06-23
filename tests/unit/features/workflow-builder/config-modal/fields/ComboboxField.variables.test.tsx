/**
 * CONFIG-FIELD-UX-SWEEP-2 Scope A — ComboboxField variable insertion.
 *
 * A combobox that accepts free values (allowManualEntry) ALSO exposes the shared
 * VariablePickerButton, so authors can set the field to an upstream {{node.field}}
 * token in one click — without breaking option selection or manual ID entry.
 */
const mockUseOptionsSource = jest.fn();
jest.mock("@/features/workflow-builder/hooks/useOptionsSource", () => ({
  __esModule: true,
  useOptionsSource: (...a: unknown[]) => mockUseOptionsSource(...a),
}));

const mockSources = jest.fn();
jest.mock("@/features/workflow-builder/hooks/useActiveNodeUpstreamVariables", () => ({
  __esModule: true,
  useActiveNodeUpstreamVariables: () => mockSources(),
}));

// Mock the picker button to isolate the ComboboxField wiring (its insert →
// onChange) from VariablePickerPopover internals. Mirrors the real button's
// "hidden when no sources" behavior.
jest.mock("@/features/workflow-builder/config-modal/fields/VariablePickerButton", () => ({
  __esModule: true,
  VariablePickerButton: ({
    sources,
    onInsertAtCursor,
    testIdRoot,
  }: {
    sources: unknown[];
    onInsertAtCursor: (t: string) => void;
    testIdRoot: string;
  }) =>
    sources.length === 0 ? null : (
      <button
        type="button"
        data-testid={`${testIdRoot}-trigger`}
        onClick={() => onInsertAtCursor("{{trigger.user}}")}
      >
        var
      </button>
    ),
}));

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FieldMeta } from "@/contracts/actionMeta";
import { ComboboxField } from "@/features/workflow-builder/config-modal/fields/ComboboxField";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";

function field(overrides: Partial<FieldMeta> = {}): FieldMeta {
  return {
    name: "userId",
    label: "User",
    type: "combobox",
    required: true,
    optionsSource: "slack:users",
    allowManualEntry: true,
    ...overrides,
  } as FieldMeta;
}

const SOURCES = [{ nodeId: "trigger", label: "Trigger", outputs: [] }];

beforeEach(() => {
  mockUseOptionsSource.mockReset();
  mockSources.mockReset();
  mockSources.mockReturnValue({ sources: SOURCES, latestValuesBySource: {} });
  mockUseOptionsSource.mockReturnValue({
    state: { status: "ready", items: [{ value: "U1", label: "@alice" }], hasMore: false },
    refetch: jest.fn(),
  });
  useGraphSlice.getState().reset();
});

it("renders the variable picker for an allowManualEntry combobox with upstream sources", () => {
  render(<ComboboxField field={field()} value="" onChange={jest.fn()} />);
  expect(screen.getByTestId("combobox-userId-picker-trigger")).toBeInTheDocument();
});

it("hides the variable picker when there are no upstream variables (e.g. trigger config)", () => {
  mockSources.mockReturnValue({ sources: [], latestValuesBySource: {} });
  render(<ComboboxField field={field()} value="" onChange={jest.fn()} />);
  expect(screen.queryByTestId("combobox-userId-picker-trigger")).not.toBeInTheDocument();
});

it("hides the variable picker when the field is NOT allowManualEntry", () => {
  render(
    <ComboboxField field={field({ allowManualEntry: undefined })} value="" onChange={jest.fn()} />,
  );
  expect(screen.queryByTestId("combobox-userId-picker-trigger")).not.toBeInTheDocument();
});

it("inserting a variable sets the field value to the {{...}} token via onChange", async () => {
  const onChange = jest.fn();
  const user = userEvent.setup();
  render(<ComboboxField field={field()} value="" onChange={onChange} />);
  await user.click(screen.getByTestId("combobox-userId-picker-trigger"));
  expect(onChange).toHaveBeenCalledWith("{{trigger.user}}");
});

it("still selects a normal option (variable picker does not break selection)", async () => {
  const onChange = jest.fn();
  const user = userEvent.setup();
  render(<ComboboxField field={field()} value="" onChange={onChange} />);
  await user.click(screen.getByRole("combobox", { name: "User" }));
  await user.click(await screen.findByText("@alice"));
  expect(onChange).toHaveBeenCalledWith("U1");
});

it("still accepts a manually typed id (variable picker does not break manual entry)", async () => {
  mockUseOptionsSource.mockReturnValue({
    state: { status: "empty", items: [], hasMore: false },
    refetch: jest.fn(),
  });
  const onChange = jest.fn();
  const user = userEvent.setup();
  render(<ComboboxField field={field()} value="" onChange={onChange} />);
  await user.click(screen.getByRole("combobox", { name: "User" }));
  await user.type(await screen.findByPlaceholderText(/search/i), "U0PASTED");
  await user.click(await screen.findByTestId("combobox-manual-entry"));
  expect(onChange).toHaveBeenCalledWith("U0PASTED");
});
