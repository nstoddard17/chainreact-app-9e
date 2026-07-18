/**
 * Tests for StringArrayField — Slice 3.13 free-text chip renderer.
 *
 * Covers value coercion, add behaviors (Enter + Add button), trimming,
 * whitespace / duplicate rejection, remove, cap behavior, disabled,
 * error surfacing, placeholder, and the initial-mount no-onChange
 * guarantee.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FieldMeta } from "@/contracts/actionMeta";
import { StringArrayField } from "@/features/workflow-builder/config-modal/fields/StringArrayField";

function field(overrides: Partial<FieldMeta> = {}): FieldMeta {
  return {
    name: "from",
    label: "From",
    type: "string-array",
    required: false,
    ...overrides,
  } as FieldMeta;
}

describe("StringArrayField", () => {
  it("renders the actionable empty state when value is an empty array", () => {
    render(<StringArrayField field={field()} value={[]} onChange={jest.fn()} />);
    expect(screen.getByText(/Nothing added yet/)).toBeInTheDocument();
  });

  it("renders one chip per string item", () => {
    render(
      <StringArrayField
        field={field()}
        value={["a@x.com", "b@x.com"]}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText("a@x.com")).toBeInTheDocument();
    expect(screen.getByText("b@x.com")).toBeInTheDocument();
  });

  it("coerces a non-array value to an empty list (no chips, no crash)", () => {
    render(
      <StringArrayField
        field={field()}
        value={"oops" as unknown}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText(/Nothing added yet/)).toBeInTheDocument();
  });

  it("filters non-string entries out of an initial array", () => {
    render(
      <StringArrayField
        field={field()}
        value={[1, "ok", null, "yes"] as unknown}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText("ok")).toBeInTheDocument();
    expect(screen.getByText("yes")).toBeInTheDocument();
    expect(screen.queryByText("1")).not.toBeInTheDocument();
    expect(screen.queryByText("null")).not.toBeInTheDocument();
  });

  it("does NOT fire onChange on initial mount with a non-empty value", () => {
    const onChange = jest.fn();
    render(
      <StringArrayField
        field={field()}
        value={["a@x.com"]}
        onChange={onChange}
      />,
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Enter adds the trimmed input as a new item and clears the input", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<StringArrayField field={field()} value={[]} onChange={onChange} />);
    const input = screen.getByLabelText("From") as HTMLInputElement;
    await user.type(input, "  alice@example.com  ");
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(["alice@example.com"]);
    expect(input.value).toBe("");
  });

  it("Add button adds the trimmed input as a new item (same as Enter)", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<StringArrayField field={field()} value={[]} onChange={onChange} />);
    await user.type(screen.getByLabelText("From"), "alice@example.com");
    await user.click(screen.getByRole("button", { name: /add from item/i }));
    expect(onChange).toHaveBeenCalledWith(["alice@example.com"]);
  });

  it("preserves internal whitespace; only trims leading/trailing", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<StringArrayField field={field()} value={[]} onChange={onChange} />);
    await user.type(screen.getByLabelText("From"), "  hello world  ");
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledWith(["hello world"]);
  });

  it("silently rejects whitespace-only input — no onChange, no Add", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<StringArrayField field={field()} value={[]} onChange={onChange} />);
    await user.type(screen.getByLabelText("From"), "   ");
    await user.keyboard("{Enter}");
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /add from item/i }));
    expect(onChange).not.toHaveBeenCalled();
  });

  // Batch R1 — a duplicate used to silently clear the input, which is
  // indistinguishable from a successful add. Now the text stays and a
  // visible message says why nothing was added.
  it("rejects an exact-string duplicate with a visible message; input text is PRESERVED", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <StringArrayField
        field={field()}
        value={["a@x.com"]}
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText("From") as HTMLInputElement;
    await user.type(input, "a@x.com");
    await user.keyboard("{Enter}");
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe("a@x.com");
    expect(screen.getByTestId("field-from-input-error")).toHaveTextContent(
      /already in the list/i,
    );
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("editing the input after a duplicate rejection clears the message", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <StringArrayField
        field={field()}
        value={["a@x.com"]}
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText("From") as HTMLInputElement;
    await user.type(input, "a@x.com");
    await user.keyboard("{Enter}");
    expect(screen.getByTestId("field-from-input-error")).toBeInTheDocument();
    await user.type(input, "x");
    expect(
      screen.queryByTestId("field-from-input-error"),
    ).not.toBeInTheDocument();
  });

  // Batch R1 — THE silent-loss P0: typed-but-not-Added text lived only
  // in local state, so clicking Save / Cancel / another tab (all of
  // which blur the input first) silently discarded it. Blur now
  // auto-commits valid pending text.
  it("blur auto-commits valid pending text as a chip (typed text survives save/close flows)", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<StringArrayField field={field()} value={[]} onChange={onChange} />);
    const input = screen.getByLabelText("From") as HTMLInputElement;
    await user.type(input, "alice@example.com");
    await user.tab(); // leave the field without pressing Add/Enter
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(["alice@example.com"]);
    expect(input.value).toBe("");
  });

  it("blur with a duplicate keeps the text and shows the message (no silent discard, no double-add)", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <StringArrayField
        field={field()}
        value={["a@x.com"]}
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText("From") as HTMLInputElement;
    await user.type(input, "a@x.com");
    await user.tab();
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe("a@x.com");
    expect(screen.getByTestId("field-from-input-error")).toBeInTheDocument();
  });

  it("blur with only whitespace commits nothing (nothing to lose)", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<StringArrayField field={field()} value={[]} onChange={onChange} />);
    const input = screen.getByLabelText("From") as HTMLInputElement;
    await user.type(input, "   ");
    await user.tab();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("clicking a chip's remove button drops only that item", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <StringArrayField
        field={field()}
        value={["a@x.com", "b@x.com", "c@x.com"]}
        onChange={onChange}
      />,
    );
    await user.click(
      screen.getByRole("button", { name: /Remove From item b@x.com/i }),
    );
    expect(onChange).toHaveBeenCalledWith(["a@x.com", "c@x.com"]);
  });

  it("disables Add + input + Enter when stringArrayMaxItems cap is reached", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <StringArrayField
        field={field({ stringArrayMaxItems: 2 })}
        value={["a", "b"]}
        onChange={onChange}
      />,
    );
    const addBtn = screen.getByRole("button", { name: /add from item/i });
    expect(addBtn).toBeDisabled();
    // Label hint reflects the cap.
    expect(addBtn).toHaveTextContent(/max 2/i);
    const input = screen.getByLabelText("From") as HTMLInputElement;
    expect(input).toBeDisabled();
    // Enter is inert even if focus is forced (input is disabled, so the
    // typing path can't reach Enter; verify via direct event also).
    await user.keyboard("{Enter}");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("disabled=true disables input, Add, and every chip's remove button", () => {
    render(
      <StringArrayField
        field={field()}
        value={["a@x.com", "b@x.com"]}
        onChange={jest.fn()}
        disabled
      />,
    );
    expect(screen.getByLabelText("From")).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /add from item/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Remove From item a@x.com/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /Remove From item b@x.com/i }),
    ).toBeDisabled();
  });

  it("surfaces inline error via FieldShell", () => {
    render(
      <StringArrayField
        field={field()}
        value={[]}
        onChange={jest.fn()}
        error="At least one item is required."
      />,
    );
    expect(
      screen.getByText("At least one item is required."),
    ).toBeInTheDocument();
  });

  it("uses FieldMeta.placeholder on the input", () => {
    render(
      <StringArrayField
        field={field({ placeholder: "type@an.email" })}
        value={[]}
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByPlaceholderText("type@an.email")).toBeInTheDocument();
  });
});
