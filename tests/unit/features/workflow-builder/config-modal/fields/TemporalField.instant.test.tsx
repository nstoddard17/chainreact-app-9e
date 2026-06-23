/**
 * Tests for the `datetime-utc` (instant) kind of TemporalField — the
 * config-field UX sweep instant follow-up.
 *
 * Contract proved here:
 *   - renders the native datetime-local control + a "UTC" note,
 *   - hydrates a stored `…Z` instant by stripping the Z for display,
 *   - STORES a true UTC instant `YYYY-MM-DDTHH:MM:SSZ` on change (picked
 *     wall-clock treated AS UTC — no local-zone conversion),
 *   - preserves a `{{variable}}`, an offset-bearing value, or a Unix-epoch
 *     integer as safe free text (never silently reinterpreted),
 *   - the existing `datetime` (wall-clock) kind is unaffected (no trailing Z).
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { TemporalField } from "@/features/workflow-builder/config-modal/fields/TemporalField";
import type { FieldMeta, FieldType } from "@/contracts/actionMeta";

function meta(name: string, type: FieldType, over: Partial<FieldMeta> = {}): FieldMeta {
  return { name, label: "When", type, required: false, ...over } as FieldMeta;
}

describe("TemporalField — datetime-utc (instant)", () => {
  it("renders the native datetime-local control with a UTC note", () => {
    render(<TemporalField field={meta("at", "datetime-utc")} value={undefined} onChange={jest.fn()} />);
    const input = screen.getByTestId("temporal-at");
    expect(input).toHaveAttribute("type", "datetime-local");
    expect(input).toHaveAttribute("data-temporal-kind", "datetime-utc");
    expect(screen.getByTestId("temporal-at-utc-note")).toBeInTheDocument();
  });

  it("hydrates a stored `…Z` instant into the native control (Z stripped, not the fallback)", () => {
    render(
      <TemporalField field={meta("at", "datetime-utc")} value="2026-06-22T15:30:00Z" onChange={jest.fn()} />,
    );
    const input = screen.getByTestId("temporal-at");
    expect(input).not.toHaveAttribute("data-temporal-fallback");
    // The native datetime-local control renders minute precision (the trailing
    // `Z` and `:00` seconds are not shown); the stored value keeps its `…Z`.
    expect((input as HTMLInputElement).value).toMatch(/^2026-06-22T15:30/);
    expect((input as HTMLInputElement).value).not.toContain("Z");
  });

  it("stores a UTC instant with trailing Z on change (minute precision → :00Z)", () => {
    const onChange = jest.fn();
    render(<TemporalField field={meta("at", "datetime-utc")} value={undefined} onChange={onChange} />);
    fireEvent.change(screen.getByTestId("temporal-at"), { target: { value: "2026-06-22T15:30" } });
    expect(onChange).toHaveBeenCalledWith("2026-06-22T15:30:00Z");
  });

  it("preserves seconds already present and appends Z", () => {
    const onChange = jest.fn();
    render(<TemporalField field={meta("at", "datetime-utc")} value={undefined} onChange={onChange} />);
    fireEvent.change(screen.getByTestId("temporal-at"), { target: { value: "2026-06-22T15:30:45" } });
    expect(onChange).toHaveBeenCalledWith("2026-06-22T15:30:45Z");
  });

  it("clearing an optional instant emits undefined", () => {
    const onChange = jest.fn();
    render(<TemporalField field={meta("at", "datetime-utc")} value="2026-06-22T15:30:00Z" onChange={onChange} />);
    fireEvent.change(screen.getByTestId("temporal-at"), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it("preserves a {{variable}} token as safe free text (fallback, not reinterpreted)", () => {
    render(
      <TemporalField field={meta("at", "datetime-utc")} value="{{trigger.when}}" onChange={jest.fn()} />,
    );
    const input = screen.getByTestId("temporal-at");
    expect(input).toHaveAttribute("data-temporal-fallback", "true");
    expect(input).toHaveValue("{{trigger.when}}");
  });

  it("preserves an offset-bearing instant as free text (only Z round-trips through the picker)", () => {
    render(
      <TemporalField field={meta("at", "datetime-utc")} value="2026-06-22T15:30:00-07:00" onChange={jest.fn()} />,
    );
    expect(screen.getByTestId("temporal-at")).toHaveAttribute("data-temporal-fallback", "true");
  });

  it("preserves a Unix-epoch integer string as free text", () => {
    render(<TemporalField field={meta("at", "datetime-utc")} value="1748793600" onChange={jest.fn()} />);
    expect(screen.getByTestId("temporal-at")).toHaveAttribute("data-temporal-fallback", "true");
  });
});

describe("TemporalField — wall-clock datetime unaffected by the instant kind", () => {
  it("the plain `datetime` kind still stores an offset-LESS string (no trailing Z, no UTC note)", () => {
    const onChange = jest.fn();
    render(<TemporalField field={meta("dt", "datetime")} value={undefined} onChange={onChange} />);
    expect(screen.queryByTestId("temporal-dt-utc-note")).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId("temporal-dt"), { target: { value: "2026-06-22T15:30" } });
    expect(onChange).toHaveBeenCalledWith("2026-06-22T15:30:00");
  });

  it("a `…Z` value in a plain datetime field stays incompatible (unchanged pre-sweep behavior)", () => {
    render(<TemporalField field={meta("dt", "datetime")} value="2026-06-22T15:30:00Z" onChange={jest.fn()} />);
    expect(screen.getByTestId("temporal-dt")).toHaveAttribute("data-temporal-fallback", "true");
  });
});
