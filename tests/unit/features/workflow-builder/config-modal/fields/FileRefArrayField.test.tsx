/**
 * Tests for FileRefArrayField — Slice 3.21 chip renderer for `file-array`.
 *
 * Covers initial-value coercion (mixed array of strings + FileRef
 * literals), add behaviors (paste token + paste JSON), trimming,
 * whitespace / duplicate rejection, remove, cap behavior, disabled,
 * error surfacing, placeholder, and the initial-mount no-onChange
 * guarantee. Mirrors StringArrayField.test.tsx structure.
 *
 * What this DOES NOT cover (deferred to follow-up slices):
 *   - Variable picker → chip-append integration.
 *   - URL fetching / signed-URL minting / upload UI.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FieldMeta } from "@/contracts/actionMeta";
import { FileRefArrayField } from "@/features/workflow-builder/config-modal/fields/FileRefArrayField";

function field(overrides: Partial<FieldMeta> = {}): FieldMeta {
  return {
    name: "attachments",
    label: "Attachments",
    type: "file-array",
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

describe("FileRefArrayField", () => {
  it("renders 'No attachments.' when value is an empty array", () => {
    render(
      <FileRefArrayField field={field()} value={[]} onChange={jest.fn()} />,
    );
    expect(screen.getByText("No attachments.")).toBeInTheDocument();
  });

  it("renders 'No attachments.' when value is undefined (untouched optional field)", () => {
    render(
      <FileRefArrayField field={field()} value={undefined} onChange={jest.fn()} />,
    );
    expect(screen.getByText("No attachments.")).toBeInTheDocument();
  });

  it("renders a chip for an existing valid FileRef literal", () => {
    render(
      <FileRefArrayField
        field={field()}
        value={[v2Ref]}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
  });

  it("renders a chip for an existing valid {{nodeId.path}} token string", () => {
    render(
      <FileRefArrayField
        field={field()}
        value={["{{getAtt.file}}"]}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText("{{getAtt.file}}")).toBeInTheDocument();
  });

  it("renders chips for a mixed array of FileRef literals and token strings", () => {
    render(
      <FileRefArrayField
        field={field()}
        value={[v2Ref, "{{getAtt.file}}", signedRef]}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByText("{{getAtt.file}}")).toBeInTheDocument();
    expect(screen.getByText("logo.png")).toBeInTheDocument();
  });

  it("coerces a non-array value to an empty list (no chips, no crash)", () => {
    render(
      <FileRefArrayField
        field={field()}
        value={"oops" as unknown}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText("No attachments.")).toBeInTheDocument();
  });

  it("filters malformed entries out of an initial array (object that fails FileRefSchema; non-token string; nulls / numbers)", () => {
    render(
      <FileRefArrayField
        field={field()}
        value={[
          v2Ref,
          "not a token",
          { kind: "bogus", name: "x" }, // not a valid FileRef
          null,
          42,
          "{{getAtt.file}}",
        ] as unknown}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByText("{{getAtt.file}}")).toBeInTheDocument();
    expect(screen.queryByText("not a token")).not.toBeInTheDocument();
    expect(screen.queryByText("null")).not.toBeInTheDocument();
    expect(screen.queryByText("42")).not.toBeInTheDocument();
  });

  it("does NOT fire onChange on initial mount, even with a non-empty value", () => {
    const onChange = jest.fn();
    render(
      <FileRefArrayField
        field={field()}
        value={[v2Ref, "{{getAtt.file}}"]}
        onChange={onChange}
      />,
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does NOT fire onChange on initial mount when value is undefined (regression: no [] manufacture)", () => {
    const onChange = jest.fn();
    render(
      <FileRefArrayField field={field()} value={undefined} onChange={onChange} />,
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Enter on a pasted {{nodeId.path}} token appends a token chip + clears the input", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <FileRefArrayField field={field()} value={[]} onChange={onChange} />,
    );
    const input = screen.getByLabelText("Attachments") as HTMLInputElement;
    // user.type interprets `{` as a special token in user-event v14
    // (used for `{Enter}`-style key directives). Use paste to deliver
    // the literal `{{...}}` string the renderer needs to parse.
    input.focus();
    await user.paste("{{getAtt.file}}");
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(["{{getAtt.file}}"]);
    expect(input.value).toBe("");
  });

  it("Add button accepts a pasted FileRef JSON literal as a new chip", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <FileRefArrayField field={field()} value={[]} onChange={onChange} />,
    );
    // user.type interprets `{` as a special token in user-event v14;
    // use user.paste against a focused input to deliver the raw JSON.
    const input = screen.getByLabelText("Attachments") as HTMLInputElement;
    input.focus();
    await user.paste(JSON.stringify(v2Ref));
    await user.click(
      screen.getByRole("button", { name: /add attachments item/i }),
    );
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([v2Ref]);
  });

  it("trims surrounding whitespace from a pasted token", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <FileRefArrayField field={field()} value={[]} onChange={onChange} />,
    );
    const input = screen.getByLabelText("Attachments") as HTMLInputElement;
    input.focus();
    await user.paste("   {{getAtt.file}}   ");
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith(["{{getAtt.file}}"]);
  });

  it("silently rejects whitespace-only input — no onChange, no chip", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <FileRefArrayField field={field()} value={[]} onChange={onChange} />,
    );
    const input = screen.getByLabelText("Attachments") as HTMLInputElement;
    await user.type(input, "   ");
    await user.keyboard("{Enter}");
    expect(onChange).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole("button", { name: /add attachments item/i }),
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("silently rejects a paste that is neither a valid token nor a valid FileRef JSON", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <FileRefArrayField field={field()} value={[]} onChange={onChange} />,
    );
    const input = screen.getByLabelText("Attachments") as HTMLInputElement;
    input.focus();
    await user.paste('{"not":"a fileref"}');
    await user.keyboard("{Enter}");
    expect(onChange).not.toHaveBeenCalled();
    // Input is cleared so the user sees the attempt landed.
    expect(input.value).toBe("");
  });

  it("silently rejects an exact-duplicate token entry", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <FileRefArrayField
        field={field()}
        value={["{{getAtt.file}}"]}
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText("Attachments") as HTMLInputElement;
    input.focus();
    await user.paste("{{getAtt.file}}");
    await user.keyboard("{Enter}");
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe("");
  });

  it("silently rejects an exact-duplicate FileRef literal (by canonical JSON)", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <FileRefArrayField
        field={field()}
        value={[v2Ref]}
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText("Attachments") as HTMLInputElement;
    input.focus();
    await user.paste(JSON.stringify(v2Ref));
    await user.keyboard("{Enter}");
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe("");
  });

  it("clicking a chip's remove button drops only that item", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <FileRefArrayField
        field={field()}
        value={[v2Ref, "{{getAtt.file}}", signedRef]}
        onChange={onChange}
      />,
    );
    await user.click(
      screen.getByRole("button", {
        name: /Remove Attachments item \{\{getAtt\.file\}\}/i,
      }),
    );
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([v2Ref, signedRef]);
  });

  it("disables Add + input + Enter when fileArrayMaxItems cap is reached", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <FileRefArrayField
        field={field({ fileArrayMaxItems: 2 })}
        value={[v2Ref, signedRef]}
        onChange={onChange}
      />,
    );
    const addBtn = screen.getByRole("button", { name: /add attachments item/i });
    expect(addBtn).toBeDisabled();
    expect(addBtn).toHaveTextContent(/max 2/i);
    const input = screen.getByLabelText("Attachments") as HTMLInputElement;
    expect(input).toBeDisabled();
    await user.keyboard("{Enter}");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("disabled=true shows existing chips but disables input, Add, and every chip's remove button", () => {
    render(
      <FileRefArrayField
        field={field()}
        value={[v2Ref, "{{getAtt.file}}"]}
        onChange={jest.fn()}
        disabled
      />,
    );
    // Chips remain visible (D-FRA-10: don't hide existing value when disabled).
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByText("{{getAtt.file}}")).toBeInTheDocument();
    expect(screen.getByLabelText("Attachments")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /add attachments item/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Remove Attachments item report\.pdf/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", {
        name: /Remove Attachments item \{\{getAtt\.file\}\}/i,
      }),
    ).toBeDisabled();
  });

  it("surfaces inline error via FieldShell", () => {
    render(
      <FileRefArrayField
        field={field()}
        value={[]}
        onChange={jest.fn()}
        error="Attachments exceed the 25 MB combined cap."
      />,
    );
    expect(
      screen.getByText("Attachments exceed the 25 MB combined cap."),
    ).toBeInTheDocument();
  });

  it("uses FieldMeta.placeholder on the input", () => {
    render(
      <FileRefArrayField
        field={field({ placeholder: "Paste a {{...}} token or FileRef JSON" })}
        value={[]}
        onChange={jest.fn()}
      />,
    );
    expect(
      screen.getByPlaceholderText("Paste a {{...}} token or FileRef JSON"),
    ).toBeInTheDocument();
  });

  it("the renderer never converts entries to JSON / CSV / base64 — onChange always emits the raw mixed array", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <FileRefArrayField
        field={field()}
        value={[v2Ref]}
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText("Attachments") as HTMLInputElement;
    input.focus();
    await user.paste("{{getAtt.file}}");
    await user.keyboard("{Enter}");
    const emitted = onChange.mock.calls[0]![0] as unknown;
    expect(Array.isArray(emitted)).toBe(true);
    expect(emitted).toEqual([v2Ref, "{{getAtt.file}}"]);
    // Defense: no string-encoded array of FileRefs ever leaves the renderer.
    expect(typeof emitted).not.toBe("string");
  });
});
