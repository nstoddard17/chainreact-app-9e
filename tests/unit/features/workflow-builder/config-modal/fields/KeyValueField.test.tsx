/**
 * Tests for KeyValueField. Covers row rendering, value normalization,
 * add/remove flows, and the `keyValueMaxRows` cap behavior.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FieldMeta } from "@/contracts/actionMeta";
import { KeyValueField } from "@/features/workflow-builder/config-modal/fields/KeyValueField";

function field(overrides: Partial<FieldMeta> = {}): FieldMeta {
  return {
    name: "headers",
    label: "Headers",
    type: "keyvalue",
    required: false,
    keyValueMaxRows: 3,
    ...overrides,
  } as FieldMeta;
}

describe("KeyValueField", () => {
  it("renders 'No entries.' when value is empty", () => {
    render(
      <KeyValueField field={field()} value={[]} onChange={jest.fn()} />,
    );
    expect(screen.getByText("No entries.")).toBeInTheDocument();
  });

  it("renders one row per {key,value} entry", () => {
    render(
      <KeyValueField
        field={field()}
        value={[
          { key: "X-Trace-Id", value: "abc" },
          { key: "Authorization", value: "Bearer xyz" },
        ]}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByDisplayValue("X-Trace-Id")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Bearer xyz")).toBeInTheDocument();
  });

  it("normalizes a non-array value to an empty list", () => {
    render(
      <KeyValueField
        field={field()}
        value={"not an array" as unknown}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText("No entries.")).toBeInTheDocument();
  });

  it("Add row appends a blank entry", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <KeyValueField field={field()} value={[]} onChange={onChange} />,
    );
    await user.click(screen.getByRole("button", { name: /add row/i }));
    expect(onChange).toHaveBeenCalledWith([{ key: "", value: "" }]);
  });

  it("Remove row drops the targeted entry", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <KeyValueField
        field={field()}
        value={[
          { key: "a", value: "1" },
          { key: "b", value: "2" },
        ]}
        onChange={onChange}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Remove Headers row 1/i }),
    );
    expect(onChange).toHaveBeenCalledWith([{ key: "b", value: "2" }]);
  });

  it("disables Add row when the cap is reached", () => {
    render(
      <KeyValueField
        field={field({ keyValueMaxRows: 2 })}
        value={[
          { key: "a", value: "1" },
          { key: "b", value: "2" },
        ]}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /add row.*max 2/i })).toBeDisabled();
  });

  it("emits the updated array on key edit", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <KeyValueField
        field={field()}
        value={[{ key: "a", value: "1" }]}
        onChange={onChange}
      />,
    );
    const keyInput = screen.getByLabelText("Headers key 1");
    await user.type(keyInput, "Z");
    expect(onChange).toHaveBeenLastCalledWith([{ key: "aZ", value: "1" }]);
  });
});

describe("KeyValueField — record mode (keyValueShape: 'record', CONFIG-UX-AUDIT-1)", () => {
  function recordField(overrides: Partial<FieldMeta> = {}): FieldMeta {
    return field({ name: "metadata", label: "Metadata", keyValueShape: "record", ...overrides });
  }

  it("commits a Record<string, string> — the wire shape z.record schemas expect (Stripe metadata et al.)", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <KeyValueField field={recordField()} value={undefined} onChange={onChange} />,
    );
    await user.click(screen.getByRole("button", { name: /add row/i }));
    await user.type(screen.getByLabelText("Metadata key 1"), "order_id");
    await user.type(screen.getByLabelText("Metadata value 1"), "ord_1");
    expect(onChange).toHaveBeenLastCalledWith({ order_id: "ord_1" });
  });

  it("hydrates rows from a saved record value", () => {
    render(
      <KeyValueField
        field={recordField()}
        value={{ plan: "pro" }}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByDisplayValue("plan")).toBeInTheDocument();
    expect(screen.getByDisplayValue("pro")).toBeInTheDocument();
  });

  it("rows with empty keys stay editable but are omitted; an all-empty editor commits undefined", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <KeyValueField field={recordField()} value={undefined} onChange={onChange} />,
    );
    await user.click(screen.getByRole("button", { name: /add row/i }));
    // Key still empty → nothing to serialize.
    expect(onChange).toHaveBeenLastCalledWith(undefined);
    await user.type(screen.getByLabelText("Metadata value 1"), "v");
    expect(onChange).toHaveBeenLastCalledWith(undefined);
    await user.type(screen.getByLabelText("Metadata key 1"), "k");
    expect(onChange).toHaveBeenLastCalledWith({ k: "v" });
  });
});
