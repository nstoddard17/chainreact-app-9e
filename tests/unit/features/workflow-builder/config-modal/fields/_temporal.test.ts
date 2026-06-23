/**
 * Pure-logic tests for the temporal helpers (CS-1).
 */
import {
  fromControlValue,
  isTemporalCompatible,
  listTimezones,
  nativeInputType,
  normalizeDatetimeSeconds,
} from "@/features/workflow-builder/config-modal/fields/_temporal";

describe("nativeInputType", () => {
  it("maps each kind to its native input type", () => {
    expect(nativeInputType("date")).toBe("date");
    expect(nativeInputType("time")).toBe("time");
    expect(nativeInputType("datetime")).toBe("datetime-local");
  });
});

describe("isTemporalCompatible", () => {
  it("treats empty as compatible (blank control)", () => {
    expect(isTemporalCompatible("date", "")).toBe(true);
    expect(isTemporalCompatible("datetime", "")).toBe(true);
  });
  it("accepts well-formed values", () => {
    expect(isTemporalCompatible("date", "2026-06-01")).toBe(true);
    expect(isTemporalCompatible("time", "09:00")).toBe(true);
    expect(isTemporalCompatible("time", "09:00:30")).toBe(true);
    expect(isTemporalCompatible("datetime", "2026-06-01T09:00")).toBe(true);
    expect(isTemporalCompatible("datetime", "2026-06-01T09:00:00")).toBe(true);
  });
  it("rejects variables, offset-bearing instants, and garbage", () => {
    expect(isTemporalCompatible("date", "{{trigger.date}}")).toBe(false);
    expect(isTemporalCompatible("datetime", "2026-06-01T09:00:00Z")).toBe(false);
    expect(isTemporalCompatible("datetime", "2026-06-01T09:00:00-04:00")).toBe(false);
    expect(isTemporalCompatible("date", "June 1")).toBe(false);
  });
});

describe("normalizeDatetimeSeconds", () => {
  it("appends :00 to minute-precision datetimes", () => {
    expect(normalizeDatetimeSeconds("2026-06-01T09:00")).toBe("2026-06-01T09:00:00");
  });
  it("leaves seconds-precision datetimes untouched", () => {
    expect(normalizeDatetimeSeconds("2026-06-01T09:00:45")).toBe("2026-06-01T09:00:45");
  });
  it("strips fractional seconds to canonical second precision", () => {
    expect(normalizeDatetimeSeconds("2026-06-01T09:00:45.000")).toBe("2026-06-01T09:00:45");
  });
});

describe("fromControlValue", () => {
  it("clears to undefined on empty", () => {
    expect(fromControlValue("date", "")).toBeUndefined();
    expect(fromControlValue("datetime", "")).toBeUndefined();
  });
  it("passes date/time through; normalizes datetime seconds", () => {
    expect(fromControlValue("date", "2026-06-01")).toBe("2026-06-01");
    expect(fromControlValue("time", "09:30")).toBe("09:30");
    expect(fromControlValue("datetime", "2026-06-01T09:30")).toBe("2026-06-01T09:30:00");
  });
});

describe("listTimezones", () => {
  it("returns a sorted list that always includes UTC", () => {
    const zones = listTimezones();
    expect(zones).toContain("UTC");
    expect(zones.length).toBeGreaterThan(0);
    const sorted = [...zones].sort();
    expect(zones).toEqual(sorted);
  });
});
