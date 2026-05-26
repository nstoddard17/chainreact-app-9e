/**
 * @jest-environment node
 *
 * Slice 4.OUTLOOK-CAL-META-2 — Approach-A flat-time-fields shim tests
 * for `CreateEventConfigSchema`. The schema accepts BOTH the canonical
 * nested shape AND the builder-friendly flat shape via a narrow Zod
 * preprocess. The handler is unchanged and always receives the nested
 * shape after `.parse()`.
 *
 * Pins:
 *   - existing nested-shape callers (direct handler tests, API consumers)
 *     parse unchanged → REGRESSION GUARD.
 *   - flat shape normalizes to nested before strict validation.
 *   - mixed input (nested + flat) prefers nested.
 *   - empty / whitespace-only flat strings are treated as absent (the
 *     "both start & end required" invariant still fires).
 *   - unknown extra fields still rejected (strict mode preserved).
 */
import { CreateEventConfigSchema } from "@/integrations/microsoft-outlook-calendar/actions/createEvent.schema";

const NESTED_REQUIRED = {
  subject: "Team sync",
  start: { dateTime: "2026-06-01T09:00:00", timeZone: "America/New_York" },
  end: { dateTime: "2026-06-01T10:00:00", timeZone: "America/New_York" },
  isAllDay: false,
  responseRequested: true,
};

const FLAT_REQUIRED = {
  subject: "Team sync",
  startDateTime: "2026-06-01T09:00:00",
  startTimeZone: "America/New_York",
  endDateTime: "2026-06-01T10:00:00",
  endTimeZone: "America/New_York",
  isAllDay: false,
  responseRequested: true,
};

describe("CreateEventConfigSchema — Approach A flat-time-fields shim", () => {
  it("parses the canonical NESTED shape unchanged (regression guard)", () => {
    const parsed = CreateEventConfigSchema.parse(NESTED_REQUIRED);
    expect(parsed).toMatchObject({
      subject: "Team sync",
      start: { dateTime: "2026-06-01T09:00:00", timeZone: "America/New_York" },
      end: { dateTime: "2026-06-01T10:00:00", timeZone: "America/New_York" },
      isAllDay: false,
      responseRequested: true,
    });
    // No flat keys leak through.
    expect(parsed).not.toHaveProperty("startDateTime");
    expect(parsed).not.toHaveProperty("endDateTime");
  });

  it("normalizes the builder FLAT shape into the nested shape", () => {
    const parsed = CreateEventConfigSchema.parse(FLAT_REQUIRED);
    expect(parsed.start).toEqual({
      dateTime: "2026-06-01T09:00:00",
      timeZone: "America/New_York",
    });
    expect(parsed.end).toEqual({
      dateTime: "2026-06-01T10:00:00",
      timeZone: "America/New_York",
    });
    expect(parsed).not.toHaveProperty("startDateTime");
    expect(parsed).not.toHaveProperty("startTimeZone");
    expect(parsed).not.toHaveProperty("endDateTime");
    expect(parsed).not.toHaveProperty("endTimeZone");
  });

  it("omits timeZone when flat startTimeZone/endTimeZone are absent", () => {
    const parsed = CreateEventConfigSchema.parse({
      ...FLAT_REQUIRED,
      startTimeZone: undefined,
      endTimeZone: undefined,
    });
    expect(parsed.start).toEqual({ dateTime: "2026-06-01T09:00:00" });
    expect(parsed.end).toEqual({ dateTime: "2026-06-01T10:00:00" });
  });

  it("treats empty / whitespace-only flat strings as absent (start required → fails)", () => {
    expect(() =>
      CreateEventConfigSchema.parse({
        ...FLAT_REQUIRED,
        startDateTime: "   ",
      }),
    ).toThrow(); // start becomes undefined → required nested DateTimeFieldSchema fails
  });

  it("rejects mixed-shape input by preferring NESTED (flat ignored when nested present)", () => {
    const parsed = CreateEventConfigSchema.parse({
      ...NESTED_REQUIRED,
      // Flat fields with conflicting values — nested wins.
      startDateTime: "2099-01-01T00:00:00",
      endDateTime: "2099-01-01T01:00:00",
    });
    expect(parsed.start.dateTime).toBe("2026-06-01T09:00:00");
    expect(parsed.end.dateTime).toBe("2026-06-01T10:00:00");
  });

  it("preserves strict mode — unknown extra fields still rejected", () => {
    expect(() =>
      CreateEventConfigSchema.parse({
        ...NESTED_REQUIRED,
        unknownField: "leak",
      }),
    ).toThrow();
  });

  it("preserves the Q11 bodyContentType-when-body refine", () => {
    expect(() =>
      CreateEventConfigSchema.parse({
        ...NESTED_REQUIRED,
        body: "Meeting agenda…",
        // bodyContentType deliberately omitted
      }),
    ).toThrow();
    // Same body with bodyContentType passes
    expect(() =>
      CreateEventConfigSchema.parse({
        ...NESTED_REQUIRED,
        body: "Meeting agenda…",
        bodyContentType: "Text",
      }),
    ).not.toThrow();
  });
});
