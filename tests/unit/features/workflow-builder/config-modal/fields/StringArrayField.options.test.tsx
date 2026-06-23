/**
 * CONFIG-FIELD-UX-SWEEP-2 Scope B — StringArrayField per-chip option picker.
 *
 * When metadata declares `optionsSource`, the chip array becomes a picker:
 * authors select options (stored as stable VALUES, shown as friendly LABELS) and
 * — with allowManualEntry — append raw typed ids. Fields WITHOUT optionsSource
 * keep the original free-text behavior unchanged.
 */
const mockUseOptionsSource = jest.fn();
jest.mock("@/features/workflow-builder/hooks/useOptionsSource", () => ({
  __esModule: true,
  useOptionsSource: (...a: unknown[]) => mockUseOptionsSource(...a),
}));

import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FieldMeta } from "@/contracts/actionMeta";
import { StringArrayField } from "@/features/workflow-builder/config-modal/fields/StringArrayField";
import { useGraphSlice } from "@/features/workflow-builder/state/graphSlice";

function pickerField(overrides: Partial<FieldMeta> = {}): FieldMeta {
  return {
    name: "labelIds",
    label: "Labels",
    type: "string-array",
    required: true,
    optionsSource: "gmail:labels",
    allowManualEntry: true,
    ...overrides,
  } as FieldMeta;
}

function ready(items: Array<{ value: string; label: string }>): void {
  mockUseOptionsSource.mockReturnValue({
    state: { status: "ready", items, hasMore: false },
    refetch: jest.fn(),
  });
}

beforeEach(() => {
  mockUseOptionsSource.mockReset();
  ready([
    { value: "L1", label: "Work" },
    { value: "L2", label: "Personal" },
  ]);
  useGraphSlice.getState().reset();
});

describe("StringArrayField — option-picker mode", () => {
  it("renders the picker add control (not the free-text input) when optionsSource is set", () => {
    render(<StringArrayField field={pickerField()} value={[]} onChange={jest.fn()} />);
    expect(screen.getByTestId("string-array-labelIds-add")).toBeInTheDocument();
  });

  it("selecting an option appends its stable VALUE to the array", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(<StringArrayField field={pickerField()} value={[]} onChange={onChange} />);
    await user.click(screen.getByTestId("string-array-labelIds-add"));
    await user.click(await screen.findByText("Personal"));
    expect(onChange).toHaveBeenCalledWith(["L2"]);
  });

  it("displays the friendly LABEL on a chip for a stored value", () => {
    render(<StringArrayField field={pickerField()} value={["L1"]} onChange={jest.fn()} />);
    const chips = screen.getByTestId("field-labelIds-chips");
    expect(chips).toHaveTextContent("Work");
    expect(chips).not.toHaveTextContent("L1");
  });

  it("falls back to the raw value on a chip when no label is known", () => {
    ready([]); // nothing loaded
    render(<StringArrayField field={pickerField()} value={["Label_999"]} onChange={jest.fn()} />);
    expect(screen.getByTestId("field-labelIds-chips")).toHaveTextContent("Label_999");
  });

  it("manual entry appends a raw typed id when allowManualEntry is set", async () => {
    ready([]);
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(<StringArrayField field={pickerField()} value={[]} onChange={onChange} />);
    await user.click(screen.getByTestId("string-array-labelIds-add"));
    await user.type(await screen.findByPlaceholderText(/search/i), "Label_777");
    await user.click(await screen.findByTestId("string-array-manual-entry"));
    expect(onChange).toHaveBeenCalledWith(["Label_777"]);
  });

  it("does not duplicate an already-selected value", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(<StringArrayField field={pickerField()} value={["L1"]} onChange={onChange} />);
    await user.click(screen.getByTestId("string-array-labelIds-add"));
    // "Work" appears both as a chip and as a popover option — target the option.
    await user.click(await screen.findByRole("option", { name: /Work/i }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders a safe message in the disconnected state", async () => {
    mockUseOptionsSource.mockReturnValue({
      state: { status: "disconnected", items: [], hasMore: false, provider: "gmail", message: "x" },
      refetch: jest.fn(),
    });
    const user = userEvent.setup();
    render(<StringArrayField field={pickerField()} value={[]} onChange={jest.fn()} />);
    await user.click(screen.getByTestId("string-array-labelIds-add"));
    expect(await screen.findByTestId("string-array-disconnected")).toHaveTextContent(/reconnect gmail/i);
  });

  it("does NOT load options for the gated (missing parent) state", () => {
    render(
      <StringArrayField
        field={pickerField({ dependsOn: "parent" })}
        value={[]}
        onChange={jest.fn()}
        enabled={false}
        parentLabel="Mailbox"
      />,
    );
    expect(screen.getByTestId("string-array-parent-missing")).toHaveTextContent(/select mailbox first/i);
  });
});

describe("StringArrayField — free-text mode unchanged (no optionsSource)", () => {
  function freeField(overrides: Partial<FieldMeta> = {}): FieldMeta {
    return { name: "from", label: "From", type: "string-array", required: false, ...overrides } as FieldMeta;
  }

  it("keeps the free-text input + Add button and never calls the options hook", () => {
    render(<StringArrayField field={freeField()} value={[]} onChange={jest.fn()} />);
    expect(screen.queryByTestId("string-array-from-add")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add from item/i })).toBeInTheDocument();
    expect(mockUseOptionsSource).not.toHaveBeenCalled();
  });

  it("adds a typed item via Enter (original behavior)", () => {
    const onChange = jest.fn();
    render(<StringArrayField field={freeField()} value={[]} onChange={onChange} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "a@b.com" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith(["a@b.com"]);
  });
});
