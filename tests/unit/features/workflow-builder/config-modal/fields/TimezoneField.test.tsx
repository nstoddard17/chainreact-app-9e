/**
 * Tests for TimezoneField (CS-1 IANA timezone selector).
 *
 * Proves: renders a <select> (not raw text), lists IANA zones incl. UTC,
 * hydrates the current value, preserves an unknown/legacy stored value,
 * stores the IANA string on change, and clears to undefined for optional use.
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { TimezoneField } from "@/features/workflow-builder/config-modal/fields/TimezoneField";
import type { FieldMeta, FieldType } from "@/contracts/actionMeta";

function meta(name: string, over: Partial<FieldMeta> = {}): FieldMeta {
  return { name, label: "Time Zone", type: "timezone" as FieldType, required: false, ...over } as FieldMeta;
}

describe("TimezoneField", () => {
  it("renders a select control with IANA options including UTC", () => {
    render(<TimezoneField field={meta("tz")} value={undefined} onChange={jest.fn()} />);
    const select = screen.getByTestId("timezone-tz");
    expect(select.tagName).toBe("SELECT");
    expect(
      Array.from(select.querySelectorAll("option")).some((o) => o.value === "UTC"),
    ).toBe(true);
  });

  it("hydrates the current value", () => {
    render(<TimezoneField field={meta("tz")} value="America/New_York" onChange={jest.fn()} />);
    expect(screen.getByTestId("timezone-tz")).toHaveValue("America/New_York");
  });

  it("preserves an unknown/legacy stored value as a selectable option", () => {
    render(<TimezoneField field={meta("tz")} value="Mars/Olympus_Mons" onChange={jest.fn()} />);
    const select = screen.getByTestId("timezone-tz");
    expect(select).toHaveValue("Mars/Olympus_Mons");
    expect(
      Array.from(select.querySelectorAll("option")).some((o) => o.value === "Mars/Olympus_Mons"),
    ).toBe(true);
  });

  it("stores the IANA string on change", () => {
    const onChange = jest.fn();
    render(<TimezoneField field={meta("tz")} value={undefined} onChange={onChange} />);
    fireEvent.change(screen.getByTestId("timezone-tz"), { target: { value: "Europe/Paris" } });
    expect(onChange).toHaveBeenCalledWith("Europe/Paris");
  });

  it("clears an optional timezone to undefined via the blank option", () => {
    const onChange = jest.fn();
    render(<TimezoneField field={meta("tz")} value="Europe/Paris" onChange={onChange} />);
    fireEvent.change(screen.getByTestId("timezone-tz"), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
