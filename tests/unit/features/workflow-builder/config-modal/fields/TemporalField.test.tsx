/**
 * Tests for TemporalField (CS-1 date/time/datetime renderer).
 *
 * Proves the audit/CS-1 contract: native pickers (not raw text), correct
 * hydration, schema-compatible stored strings (date "YYYY-MM-DD";
 * datetime "YYYY-MM-DDTHH:MM:SS"), optional clear, required marker, an
 * invalid existing value falling back to text without crashing, and no
 * network/provider/LLM calls.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { TemporalField } from "@/features/workflow-builder/config-modal/fields/TemporalField";
import type { FieldMeta, FieldType } from "@/contracts/actionMeta";

function meta(name: string, type: FieldType, over: Partial<FieldMeta> = {}): FieldMeta {
  return { name, label: "When", type, required: false, ...over } as FieldMeta;
}

describe("TemporalField — native controls", () => {
  it("renders a native date control (not a plain text input)", () => {
    render(<TemporalField field={meta("d", "date")} value={undefined} onChange={jest.fn()} />);
    const input = screen.getByTestId("temporal-d");
    expect(input).toHaveAttribute("type", "date");
    expect(input).toHaveAttribute("data-temporal-kind", "date");
  });

  it("renders a native time control", () => {
    render(<TemporalField field={meta("t", "time")} value={undefined} onChange={jest.fn()} />);
    expect(screen.getByTestId("temporal-t")).toHaveAttribute("type", "time");
  });

  it("renders a native datetime control (not raw ISO text)", () => {
    render(<TemporalField field={meta("dt", "datetime")} value={undefined} onChange={jest.fn()} />);
    const input = screen.getByTestId("temporal-dt");
    expect(input).toHaveAttribute("type", "datetime-local");
    expect(input).not.toHaveAttribute("data-temporal-fallback");
  });
});

describe("TemporalField — hydration", () => {
  it("hydrates an existing date value", () => {
    render(<TemporalField field={meta("d", "date")} value="2026-06-01" onChange={jest.fn()} />);
    expect(screen.getByTestId("temporal-d")).toHaveValue("2026-06-01");
  });

  it("hydrates an existing datetime value into the native control (not the fallback)", () => {
    render(
      <TemporalField field={meta("dt", "datetime")} value="2026-06-01T09:00:00" onChange={jest.fn()} />,
    );
    const input = screen.getByTestId("temporal-dt");
    expect(input).toHaveAttribute("type", "datetime-local");
    expect(input).not.toHaveAttribute("data-temporal-fallback");
  });
});

describe("TemporalField — writes schema-compatible strings", () => {
  it("changing a date writes YYYY-MM-DD verbatim", () => {
    const onChange = jest.fn();
    render(<TemporalField field={meta("d", "date")} value={undefined} onChange={onChange} />);
    fireEvent.change(screen.getByTestId("temporal-d"), { target: { value: "2026-07-04" } });
    expect(onChange).toHaveBeenCalledWith("2026-07-04");
  });

  it("changing a datetime appends :00 seconds to match the ISO string handlers expect", () => {
    const onChange = jest.fn();
    render(<TemporalField field={meta("dt", "datetime")} value={undefined} onChange={onChange} />);
    fireEvent.change(screen.getByTestId("temporal-dt"), { target: { value: "2026-07-04T08:30" } });
    expect(onChange).toHaveBeenCalledWith("2026-07-04T08:30:00");
  });

  it("preserves seconds already present in a datetime change", () => {
    const onChange = jest.fn();
    render(<TemporalField field={meta("dt", "datetime")} value={undefined} onChange={onChange} />);
    fireEvent.change(screen.getByTestId("temporal-dt"), { target: { value: "2026-07-04T08:30:45" } });
    expect(onChange).toHaveBeenCalledWith("2026-07-04T08:30:45");
  });
});

describe("TemporalField — optional clear + required", () => {
  it("clearing an optional field emits undefined", () => {
    const onChange = jest.fn();
    render(<TemporalField field={meta("d", "date")} value="2026-06-01" onChange={onChange} />);
    fireEvent.change(screen.getByTestId("temporal-d"), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("shows the required marker for a required field", () => {
    render(
      <TemporalField field={meta("d", "date", { required: true })} value={undefined} onChange={jest.fn()} />,
    );
    expect(screen.getByText("When").parentElement?.querySelector('[data-required="true"]')).toBeTruthy();
  });
});

describe("TemporalField — invalid existing value is safe", () => {
  it("falls back to a text input (no crash) and shows a note for an unrecognized value", () => {
    render(
      <TemporalField field={meta("dt", "datetime")} value="{{trigger.when}}" onChange={jest.fn()} />,
    );
    const input = screen.getByTestId("temporal-dt");
    expect(input).toHaveAttribute("data-temporal-fallback", "true");
    expect(input).toHaveValue("{{trigger.when}}");
    expect(screen.getByTestId("temporal-dt-fallback-note")).toBeInTheDocument();
  });

  it("treats an offset-bearing instant as incompatible (never silently reinterpreted)", () => {
    render(
      <TemporalField field={meta("dt", "datetime")} value="2026-06-01T09:00:00Z" onChange={jest.fn()} />,
    );
    expect(screen.getByTestId("temporal-dt")).toHaveAttribute("data-temporal-fallback", "true");
  });

  it("editing the fallback text still writes the raw value (and clears to undefined)", () => {
    const onChange = jest.fn();
    render(<TemporalField field={meta("dt", "datetime")} value="garbage" onChange={onChange} />);
    fireEvent.change(screen.getByTestId("temporal-dt"), { target: { value: "still-garbage" } });
    expect(onChange).toHaveBeenLastCalledWith("still-garbage");
    fireEvent.change(screen.getByTestId("temporal-dt"), { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });
});

describe("TemporalField — no side effects", () => {
  it("makes no network/provider/LLM calls on render or change", () => {
    const fetchMock = jest.fn();
    const had = "fetch" in global;
    const prev = (global as { fetch?: unknown }).fetch;
    (global as { fetch?: unknown }).fetch = fetchMock;
    try {
      const onChange = jest.fn();
      render(<TemporalField field={meta("d", "date")} value={undefined} onChange={onChange} />);
      fireEvent.change(screen.getByTestId("temporal-d"), { target: { value: "2026-01-01" } });
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      if (had) (global as { fetch?: unknown }).fetch = prev;
      else delete (global as { fetch?: unknown }).fetch;
    }
  });
});
