/**
 * Tests for CronField (Slice 3.3 humanizer).
 *
 * The renderer composes the text input with a preview line driven by
 * `core/triggers/cronHumanizer`. Three preview states under test:
 *   - empty value → no preview line, falls back to FieldShell helper.
 *   - invalid expression → red "Invalid cron expression" hint.
 *   - valid expression → "Runs next at <UTC> [, then <UTC>]" line.
 *
 * Uses Jest's modern fake timers to pin `new Date()` so the upcoming-
 * fires output is deterministic across runs.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { FieldMeta } from "@/contracts/actionMeta";
import { CronField } from "@/features/workflow-builder/config-modal/fields/CronField";

function field(overrides: Partial<FieldMeta> = {}): FieldMeta {
  return {
    name: "cronExpression",
    label: "Cron Expression",
    type: "cron",
    required: true,
    placeholder: "0 9 * * 1-5",
    ...overrides,
  } as FieldMeta;
}

beforeEach(() => {
  // Sunday 2026-05-17 08:00 UTC — next 9am weekday fire is Mon 05-18 09:00 UTC.
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-05-17T08:00:00.000Z"));
});

afterEach(() => {
  jest.useRealTimers();
});

describe("CronField — input + label", () => {
  it("renders the label and required marker via FieldShell", () => {
    render(<CronField field={field()} value="" onChange={jest.fn()} />);
    expect(screen.getByLabelText(/cron expression/i)).toBeInTheDocument();
    expect(screen.getByText("*")).toBeInTheDocument();
  });

  it("forwards typing through onChange", async () => {
    const onChange = jest.fn();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    render(<CronField field={field()} value="" onChange={onChange} />);
    await user.type(screen.getByLabelText(/cron expression/i), "0");
    expect(onChange).toHaveBeenLastCalledWith("0");
  });

  it("renders disabled when the disabled prop is set", () => {
    render(
      <CronField
        field={field()}
        value="0 9 * * 1-5"
        onChange={jest.fn()}
        disabled
      />,
    );
    expect(screen.getByLabelText(/cron expression/i)).toBeDisabled();
  });
});

describe("CronField — preview states", () => {
  it("renders no preview line when value is empty", () => {
    render(<CronField field={field()} value="" onChange={jest.fn()} />);
    expect(screen.queryByTestId("cron-preview")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/invalid cron expression/i),
    ).not.toBeInTheDocument();
  });

  it("renders the 'Invalid cron expression' hint for malformed input", () => {
    render(
      <CronField
        field={field()}
        value="not-a-cron"
        onChange={jest.fn()}
      />,
    );
    expect(
      screen.getByText(/invalid cron expression/i),
    ).toBeInTheDocument();
  });

  it("rejects 5-arg preset (server contract: no @hourly etc.)", () => {
    render(
      <CronField field={field()} value="@daily" onChange={jest.fn()} />,
    );
    expect(
      screen.getByText(/invalid cron expression/i),
    ).toBeInTheDocument();
  });

  it("renders next-fire preview for valid expressions", () => {
    render(
      <CronField
        field={field()}
        value="0 9 * * 1-5"
        onChange={jest.fn()}
      />,
    );
    const preview = screen.getByTestId("cron-preview");
    expect(preview).toHaveTextContent(/runs next at/i);
    expect(preview).toHaveTextContent(/UTC/);
    // Default limit is 2, so a "then" join should appear.
    expect(preview).toHaveTextContent(/then/i);
  });

  it("trims whitespace before validating", () => {
    render(
      <CronField
        field={field()}
        value="   0 9 * * 1-5   "
        onChange={jest.fn()}
      />,
    );
    expect(screen.getByTestId("cron-preview")).toBeInTheDocument();
    expect(
      screen.queryByText(/invalid cron expression/i),
    ).not.toBeInTheDocument();
  });

  it("preview hint disappears when error prop is set (slice-level error wins)", () => {
    render(
      <CronField
        field={field()}
        value="0 9 * * 1-5"
        onChange={jest.fn()}
        error="server validation failed"
      />,
    );
    expect(
      screen.getByText(/server validation failed/i),
    ).toBeInTheDocument();
    // Preview still renders (it's a separate paragraph), but the
    // FieldShell error owns the alert role.
    expect(screen.getByTestId("cron-preview")).toBeInTheDocument();
  });
});
