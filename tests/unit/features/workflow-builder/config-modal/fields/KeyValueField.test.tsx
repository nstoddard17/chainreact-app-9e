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
  it("renders the actionable empty state when value is empty", () => {
    render(
      <KeyValueField field={field()} value={[]} onChange={jest.fn()} />,
    );
    expect(screen.getByText(/No rows yet/)).toBeInTheDocument();
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
    expect(screen.getByText(/No rows yet/)).toBeInTheDocument();
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

  // ── Batch R1 — record-mode silent-loss fixes ─────────────────────────

  // A value typed into a nameless row was silently omitted from the
  // committed record: visible on screen, absent from the save. Now the
  // row says so the moment there is a value to lose.
  it("a row with a value but no name shows a visible 'give this row a name' error", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <KeyValueField field={recordField()} value={undefined} onChange={onChange} />,
    );
    await user.click(screen.getByRole("button", { name: /add row/i }));
    // A fully-empty (just-added) row is NOT flagged — no value to lose.
    expect(
      screen.queryByTestId("field-metadata-row-0-error"),
    ).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Metadata value 1"), "ord_1");
    expect(screen.getByTestId("field-metadata-row-0-error")).toHaveTextContent(
      /give this row a name/i,
    );
  });

  // Correcting the row clears the error and the value reaches the
  // committed record — proving error display and serialization agree.
  it("typing a name clears the row error and the value is committed", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <KeyValueField field={recordField()} value={undefined} onChange={onChange} />,
    );
    await user.click(screen.getByRole("button", { name: /add row/i }));
    await user.type(screen.getByLabelText("Metadata value 1"), "ord_1");
    expect(screen.getByTestId("field-metadata-row-0-error")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Metadata key 1"), "order_id");
    expect(
      screen.queryByTestId("field-metadata-row-0-error"),
    ).not.toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith({ order_id: "ord_1" });
  });

  // Duplicate names last-write-win in a record by construction — that's
  // the wire shape — but the overwrite must be visible, not silent.
  it("editing a second row to reuse an existing name flags BOTH rows; renaming clears the flags", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <KeyValueField
        field={recordField()}
        value={{ plan: "pro", tier: "gold" }}
        onChange={onChange}
      />,
    );
    const secondKey = screen.getByLabelText("Metadata key 2") as HTMLInputElement;
    await user.clear(secondKey);
    await user.type(secondKey, "plan");
    expect(screen.getByTestId("field-metadata-row-0-error")).toHaveTextContent(
      /only the last value will be saved/i,
    );
    expect(screen.getByTestId("field-metadata-row-1-error")).toHaveTextContent(
      /only the last value will be saved/i,
    );
    // The committed record proves last-write-wins really happens (the
    // warning is truthful): row 2's value overwrote row 1's.
    expect(onChange).toHaveBeenLastCalledWith({ plan: "gold" });
    // Renaming resolves the collision and clears both flags.
    await user.clear(secondKey);
    await user.type(secondKey, "tier");
    expect(
      screen.queryByTestId("field-metadata-row-0-error"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("field-metadata-row-1-error"),
    ).not.toBeInTheDocument();
    expect(onChange).toHaveBeenLastCalledWith({ plan: "pro", tier: "gold" });
  });

  // Saved values reload correctly with no spurious warnings.
  it("hydrating a saved record renders rows with no row errors", () => {
    render(
      <KeyValueField
        field={recordField()}
        value={{ a: "1", b: "2" }}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByDisplayValue("a")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2")).toBeInTheDocument();
    expect(
      screen.queryByTestId("field-metadata-row-0-error"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("field-metadata-row-1-error"),
    ).not.toBeInTheDocument();
  });
});

describe("KeyValueField — pairs mode is deliberately untouched by Batch R1", () => {
  // Pairs mode commits every row as-is (nothing silently dropped) and
  // duplicate keys are LEGAL there (HTTP headers). No row errors.
  it("pairs mode shows no row errors for empty-key or duplicate-key rows", () => {
    render(
      <KeyValueField
        field={field()}
        value={[
          { key: "", value: "orphan" },
          { key: "Accept", value: "a" },
          { key: "Accept", value: "b" },
        ]}
        onChange={jest.fn()}
      />,
    );
    expect(
      screen.queryByTestId("field-headers-row-0-error"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("field-headers-row-1-error"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("field-headers-row-2-error"),
    ).not.toBeInTheDocument();
  });
});
