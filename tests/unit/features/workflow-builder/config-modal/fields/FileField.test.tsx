/**
 * Tests for FileField — Slice 3.25 single-value chip renderer.
 *
 * Mirrors FileRefArrayField.test.tsx shape, adapted for single-value
 * semantics:
 *   - the chip is at-most-one (no array).
 *   - the variable picker REPLACES (no append).
 *   - the ✕ button clears to `undefined` (no array).
 *
 * Plan reference: docs/slices/phase-3/single-file-ref-metadata-plan.md
 * decisions D-SFR-3 / D-SFR-5 / D-SFR-6 / D-SFR-7.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FieldMeta } from "@/contracts/actionMeta";
import { FileField } from "@/features/workflow-builder/config-modal/fields/FileField";

function field(overrides: Partial<FieldMeta> = {}): FieldMeta {
  return {
    name: "file",
    label: "File",
    type: "file",
    required: false,
    ...overrides,
  } as FieldMeta;
}

const v2Ref = {
  kind: "v2_storage",
  name: "report.pdf",
  mimeType: "application/pdf",
  storagePath: "user/wf/run/node/report.pdf",
} as const;

const signedRef = {
  kind: "signed_url",
  name: "logo.png",
  mimeType: "image/png",
  url: "https://example.test/signed",
} as const;

describe("FileField", () => {
  it("renders 'No file.' when value is undefined", () => {
    render(<FileField field={field()} value={undefined} onChange={jest.fn()} />);
    expect(screen.getByText("No file.")).toBeInTheDocument();
  });

  it("renders 'No file.' when value is an empty string", () => {
    render(<FileField field={field()} value="" onChange={jest.fn()} />);
    expect(screen.getByText("No file.")).toBeInTheDocument();
  });

  it("renders a chip for an existing valid FileRef literal", () => {
    render(<FileField field={field()} value={v2Ref} onChange={jest.fn()} />);
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
  });

  it("renders a chip for an existing valid {{nodeId.path}} token string", () => {
    render(
      <FileField
        field={field()}
        value="{{getAtt.file}}"
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText("{{getAtt.file}}")).toBeInTheDocument();
  });

  it("renders empty state for malformed object (no crash; no clear of parent's value)", () => {
    const onChange = jest.fn();
    render(
      <FileField
        field={field()}
        value={{ kind: "bogus", name: "x" } as unknown}
        onChange={onChange}
      />,
    );
    expect(screen.getByText("No file.")).toBeInTheDocument();
    // The renderer must NOT auto-clear a malformed parent value — that
    // would mask an upstream-producer bug.
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders empty state for non-string non-object value (no crash)", () => {
    render(
      <FileField
        field={field()}
        value={42 as unknown}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText("No file.")).toBeInTheDocument();
  });

  it("does NOT fire onChange on initial mount with a valid value", () => {
    const onChange = jest.fn();
    render(
      <FileField field={field()} value={v2Ref} onChange={onChange} />,
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does NOT fire onChange on initial mount when value is undefined (regression: no value manufacture)", () => {
    const onChange = jest.fn();
    render(
      <FileField field={field()} value={undefined} onChange={onChange} />,
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Enter on a pasted {{nodeId.path}} token sets the value and clears the input", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <FileField field={field()} value={undefined} onChange={onChange} />,
    );
    const input = screen.getByLabelText("File") as HTMLInputElement;
    // user.type interprets `{` as a special token — use paste to
    // deliver the literal `{{...}}` string.
    input.focus();
    await user.paste("{{getAtt.file}}");
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("{{getAtt.file}}");
    expect(input.value).toBe("");
  });

  it("Set button accepts a pasted FileRef JSON literal", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <FileField field={field()} value={undefined} onChange={onChange} />,
    );
    const input = screen.getByLabelText("File") as HTMLInputElement;
    input.focus();
    await user.paste(JSON.stringify(v2Ref));
    await user.click(screen.getByRole("button", { name: /set file value/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(v2Ref);
  });

  it("trims surrounding whitespace from a pasted token", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <FileField field={field()} value={undefined} onChange={onChange} />,
    );
    const input = screen.getByLabelText("File") as HTMLInputElement;
    input.focus();
    await user.paste("   {{getAtt.file}}   ");
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith("{{getAtt.file}}");
  });

  it("silently rejects whitespace-only input — no onChange", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <FileField field={field()} value={undefined} onChange={onChange} />,
    );
    const input = screen.getByLabelText("File") as HTMLInputElement;
    await user.type(input, "   ");
    await user.keyboard("{Enter}");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("silently rejects a paste that is neither a token nor a FileRef JSON; clears the input", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <FileField field={field()} value={undefined} onChange={onChange} />,
    );
    const input = screen.getByLabelText("File") as HTMLInputElement;
    input.focus();
    await user.paste('{"not":"a fileref"}');
    await user.keyboard("{Enter}");
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe("");
  });

  it("paste of the SAME token already held in the field produces no onChange (dedup)", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <FileField
        field={field()}
        value="{{getAtt.file}}"
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText("File") as HTMLInputElement;
    input.focus();
    await user.paste("{{getAtt.file}}");
    await user.keyboard("{Enter}");
    expect(onChange).not.toHaveBeenCalled();
    // Input still cleared so the user sees the attempt landed.
    expect(input.value).toBe("");
  });

  it("paste of a DIFFERENT token REPLACES the existing value (single-value semantics)", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <FileField
        field={field()}
        value="{{getAtt.file}}"
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText("File") as HTMLInputElement;
    input.focus();
    await user.paste("{{trigger.file}}");
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("{{trigger.file}}");
  });

  it("paste of a FileRef literal REPLACES the existing token", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <FileField
        field={field()}
        value="{{getAtt.file}}"
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText("File") as HTMLInputElement;
    input.focus();
    await user.paste(JSON.stringify(signedRef));
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(signedRef);
  });

  it("clicking ✕ on the chip clears the value to undefined", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <FileField field={field()} value={v2Ref} onChange={onChange} />,
    );
    await user.click(
      screen.getByRole("button", { name: /Remove File value report\.pdf/i }),
    );
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("disabled=true shows the chip but disables input, Set, picker, and ✕", () => {
    render(
      <FileField
        field={field()}
        value={v2Ref}
        onChange={jest.fn()}
        disabled
      />,
    );
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByLabelText("File")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /set file value/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Remove File value report\.pdf/i }),
    ).toBeDisabled();
  });

  it("surfaces inline error via FieldShell", () => {
    render(
      <FileField
        field={field()}
        value={undefined}
        onChange={jest.fn()}
        error="File is required."
      />,
    );
    expect(screen.getByText("File is required.")).toBeInTheDocument();
  });

  it("uses FieldMeta.placeholder on the input", () => {
    render(
      <FileField
        field={field({ placeholder: "Paste a {{...}} token or FileRef JSON" })}
        value={undefined}
        onChange={jest.fn()}
      />,
    );
    expect(
      screen.getByPlaceholderText("Paste a {{...}} token or FileRef JSON"),
    ).toBeInTheDocument();
  });

  it("the renderer never converts the value to JSON / base64 — onChange always emits the raw shape", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <FileField field={field()} value={undefined} onChange={onChange} />,
    );
    const input = screen.getByLabelText("File") as HTMLInputElement;
    input.focus();
    await user.paste(JSON.stringify(v2Ref));
    await user.keyboard("{Enter}");
    const emitted = onChange.mock.calls[0]![0] as unknown;
    expect(emitted).toEqual(v2Ref);
    // The emitted value is the parsed object, NOT the JSON string.
    expect(typeof emitted).toBe("object");
    expect(typeof emitted).not.toBe("string");
  });

  // The picker button only renders when upstream sources exist. In a
  // pure unit-test render the configSlice has no active node and
  // `useActiveNodeUpstreamVariables` returns `{ sources: [] }`, so
  // `VariablePickerButton` returns null. The full picker-replace flow
  // (focused field of type "file", upstream FileRef-producing output,
  // chip-replace) is covered by an integration test in a follow-up
  // slice once a single-FileRef consumer meta exists. Today we assert
  // the no-sources fallback explicitly.
  it("picker button is hidden when there are no upstream sources (matches FileRefArrayField parity)", () => {
    render(
      <FileField field={field()} value={undefined} onChange={jest.fn()} />,
    );
    // VariablePickerButton returns null when sources.length === 0 so
    // the trigger testid is absent. In a unit-test render the
    // configSlice has no active node, so `useActiveNodeUpstreamVariables`
    // returns `{ sources: [] }` synchronously.
    expect(
      screen.queryByTestId("file-file-picker-trigger"),
    ).not.toBeInTheDocument();
  });
});
