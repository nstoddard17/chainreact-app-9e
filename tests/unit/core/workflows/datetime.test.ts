/** @jest-environment node */
import {
  addMinutesToTime,
  parseTimeOrFail,
  resolveTimezone,
} from "@/core/workflows/datetime";

describe("resolveTimezone (Q12)", () => {
  it("returns explicit IANA when valid", () => {
    expect(resolveTimezone({ explicitTz: "America/New_York" })).toBe(
      "America/New_York",
    );
    expect(resolveTimezone({ explicitTz: "Europe/Berlin" })).toBe(
      "Europe/Berlin",
    );
  });

  it("trims whitespace from explicit IANA", () => {
    expect(resolveTimezone({ explicitTz: "  America/Los_Angeles  " })).toBe(
      "America/Los_Angeles",
    );
  });

  it("falls back to UTC when explicitTz is undefined", () => {
    expect(resolveTimezone({})).toBe("UTC");
  });

  it("falls back to UTC when explicitTz is null", () => {
    expect(resolveTimezone({ explicitTz: null })).toBe("UTC");
  });

  it("falls back to UTC when explicitTz is empty or whitespace", () => {
    expect(resolveTimezone({ explicitTz: "" })).toBe("UTC");
    expect(resolveTimezone({ explicitTz: "   " })).toBe("UTC");
  });

  it("falls back to UTC when explicitTz is 'auto'", () => {
    expect(resolveTimezone({ explicitTz: "auto" })).toBe("UTC");
    expect(resolveTimezone({ explicitTz: "AUTO" })).toBe("UTC");
  });

  it("falls back to UTC when IANA is invalid", () => {
    expect(resolveTimezone({ explicitTz: "Atlantis/Lost_City" })).toBe("UTC");
    expect(resolveTimezone({ explicitTz: "not-a-timezone" })).toBe("UTC");
  });
});

describe("parseTimeOrFail (Q12)", () => {
  it("parses a valid HH:MM string", () => {
    expect(parseTimeOrFail("09:30", "startTime")).toEqual({
      ok: true,
      value: { hours: 9, minutes: 30 },
    });
  });

  it("parses 00:00 and 23:59", () => {
    expect(parseTimeOrFail("00:00", "x").ok).toBe(true);
    expect(parseTimeOrFail("23:59", "x").ok).toBe(true);
  });

  it("rejects single-digit hour (must be HH:MM)", () => {
    const r = parseTimeOrFail("9:30", "startTime");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.failure.error.code).toBe("INVALID_FIELD_FORMAT");
      expect(r.failure.error.path).toBe("startTime");
    }
  });

  it("rejects 24:00 (24-hour clock is 00..23)", () => {
    expect(parseTimeOrFail("24:00", "x").ok).toBe(false);
  });

  it("rejects minutes >= 60", () => {
    expect(parseTimeOrFail("12:60", "x").ok).toBe(false);
    expect(parseTimeOrFail("12:99", "x").ok).toBe(false);
  });

  it("rejects nonsense input", () => {
    expect(parseTimeOrFail("abc", "x").ok).toBe(false);
    expect(parseTimeOrFail("", "x").ok).toBe(false);
    expect(parseTimeOrFail(null, "x").ok).toBe(false);
    expect(parseTimeOrFail(undefined, "x").ok).toBe(false);
  });
});

describe("addMinutesToTime (Q12)", () => {
  it("adds 60 minutes to 09:00 → 10:00", () => {
    expect(addMinutesToTime("09:00", 60)).toBe("10:00");
  });

  it("wraps past midnight: 23:30 + 60 → 00:30", () => {
    expect(addMinutesToTime("23:30", 60)).toBe("00:30");
  });

  it("handles wrap by exactly midnight: 00:00 + 1440 → 00:00", () => {
    expect(addMinutesToTime("00:00", 1440)).toBe("00:00");
  });

  it("handles 30-min increments and zero-padding", () => {
    expect(addMinutesToTime("09:00", 30)).toBe("09:30");
    expect(addMinutesToTime("09:30", 30)).toBe("10:00");
    expect(addMinutesToTime("00:00", 5)).toBe("00:05");
  });

  it("throws on invalid input", () => {
    expect(() => addMinutesToTime("9:00", 60)).toThrow(/24-hour HH:MM/);
    expect(() => addMinutesToTime("not-a-time", 60)).toThrow();
  });
});
