/**
 * Tests for the "text-style" field renderers — TextField, TextareaField,
 * NumberField, CronField. These share the FieldShell shape
 * (label + required + helper + inline error) so they're batched here
 * to keep one suite per logical concern.
 *
 * NOTE — FileField moved out (Slice 3.25). The earlier paste-text
 * placeholder lived in this suite as a one-liner alongside the other
 * "input wrapped in FieldShell" renderers. After the Slice 3.25
 * upgrade FileField now owns chip rendering, paste-text + JSON parsing,
 * variable-picker integration, and replace-not-append semantics — none
 * of which match the "text-style" shape this suite represents. The
 * full FileField coverage lives in `FileField.test.tsx`.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FieldMeta } from "@/contracts/actionMeta";
import { TextField } from "@/features/workflow-builder/config-modal/fields/TextField";
import { TextareaField } from "@/features/workflow-builder/config-modal/fields/TextareaField";
import { NumberField } from "@/features/workflow-builder/config-modal/fields/NumberField";
import { CronField } from "@/features/workflow-builder/config-modal/fields/CronField";

function textField(overrides: Partial<FieldMeta> = {}): FieldMeta {
  return {
    name: "title",
    label: "Title",
    type: "text",
    required: false,
    ...overrides,
  } as FieldMeta;
}

describe("TextField", () => {
  it("renders the label and initial value", () => {
    render(
      <TextField
        field={textField()}
        value="hello"
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByLabelText("Title")).toHaveValue("hello");
  });

  it("renders a required marker when field.required is true", () => {
    const { container } = render(
      <TextField
        field={textField({ required: true })}
        value=""
        onChange={jest.fn()}
      />,
    );
    expect(container.querySelector('[data-required="true"]')).toBeInTheDocument();
  });

  it("renders helper text from field.description", () => {
    render(
      <TextField
        field={textField({ description: "Up to 256 characters." })}
        value=""
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByText("Up to 256 characters.")).toBeInTheDocument();
  });

  it("renders inline error text instead of helper when error is supplied", () => {
    render(
      <TextField
        field={textField({ description: "Up to 256 characters." })}
        value=""
        error="Title is required."
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Title is required.");
    expect(screen.queryByText("Up to 256 characters.")).not.toBeInTheDocument();
  });

  it("marks input as aria-invalid when error is present", () => {
    render(
      <TextField
        field={textField()}
        value=""
        error="bad"
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByLabelText("Title")).toHaveAttribute("aria-invalid", "true");
  });

  it("invokes onChange with the raw string on input", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <TextField field={textField()} value="" onChange={onChange} />,
    );
    await user.type(screen.getByLabelText("Title"), "ab");
    expect(onChange).toHaveBeenCalledWith("a");
    expect(onChange).toHaveBeenLastCalledWith("b");
  });

  it("disables input when disabled prop is set", () => {
    render(
      <TextField
        field={textField()}
        value=""
        onChange={jest.fn()}
        disabled
      />,
    );
    expect(screen.getByLabelText("Title")).toBeDisabled();
  });
});

describe("TextareaField", () => {
  it("renders a multi-line textarea wired to value/onChange", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <TextareaField
        field={textField({ name: "body", label: "Body", type: "textarea" })}
        value=""
        onChange={onChange}
      />,
    );
    const ta = screen.getByLabelText("Body") as HTMLTextAreaElement;
    expect(ta.tagName).toBe("TEXTAREA");
    await user.type(ta, "x");
    expect(onChange).toHaveBeenCalledWith("x");
  });
});

describe("NumberField", () => {
  function numberField(overrides: Partial<FieldMeta> = {}): FieldMeta {
    return {
      name: "seconds",
      label: "Seconds",
      type: "number",
      required: true,
      numeric: { min: 1, max: 30, integer: true, step: 1 },
      ...overrides,
    } as FieldMeta;
  }

  it("applies min/max/step from numeric bounds", () => {
    render(
      <NumberField
        field={numberField()}
        value={5}
        onChange={jest.fn()}
      />,
    );
    const input = screen.getByLabelText("Seconds");
    expect(input).toHaveAttribute("min", "1");
    expect(input).toHaveAttribute("max", "30");
    expect(input).toHaveAttribute("step", "1");
    expect(input).toHaveValue(5);
  });

  it("emits undefined when cleared", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <NumberField field={numberField()} value={5} onChange={onChange} />,
    );
    await user.clear(screen.getByLabelText("Seconds"));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("emits parsed integer when integer bound is set", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(
      <NumberField field={numberField()} value="" onChange={onChange} />,
    );
    await user.type(screen.getByLabelText("Seconds"), "7");
    expect(onChange).toHaveBeenLastCalledWith(7);
  });
});

describe("CronField", () => {
  it("renders a monospace text input with cron placeholder", () => {
    render(
      <CronField
        field={textField({
          name: "cronExpression",
          label: "Cron Expression",
          type: "cron",
          required: true,
        })}
        value=""
        onChange={jest.fn()}
      />,
    );
    const input = screen.getByLabelText("Cron Expression");
    expect(input).toHaveAttribute("placeholder", "0 9 * * 1-5");
    expect(input).toHaveClass("font-mono");
  });

  it("uses the field description verbatim as the helper text (no slice-3.1 appendix)", () => {
    // Slice 3.3 wired the humanizer into a separate <p> below the input,
    // so the helper text is just the field's own description — no
    // "Humanized preview arrives" trailing hint anymore.
    render(
      <CronField
        field={textField({
          name: "cronExpression",
          label: "Cron Expression",
          type: "cron",
          required: true,
          description: "5-field UTC.",
        })}
        value=""
        onChange={jest.fn()}
      />,
    );
    const helper = screen.getByText("5-field UTC.");
    expect(helper).toBeInTheDocument();
    // The detailed CronField → humanizer behavior is covered by
    // CronField.test.tsx — text-style-renderers only sanity-checks the
    // FieldShell-shape parity.
  });
});

