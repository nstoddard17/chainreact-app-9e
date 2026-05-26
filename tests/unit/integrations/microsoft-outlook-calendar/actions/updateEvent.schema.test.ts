/**
 * @jest-environment node
 *
 * Slice 4.OUTLOOK-CAL-META-2 — Approach-A flat-time-fields shim tests
 * for `UpdateEventConfigSchema`. Mirrors the create_event tests but
 * accounts for `start` / `end` being OPTIONAL on update (Graph rejects
 * one-sided time edits, but the schema doesn't pre-empt that).
 */
import { UpdateEventConfigSchema } from "@/integrations/microsoft-outlook-calendar/actions/updateEvent.schema";

describe("UpdateEventConfigSchema — Approach A flat-time-fields shim", () => {
  it("parses the canonical NESTED shape unchanged (regression guard)", () => {
    const parsed = UpdateEventConfigSchema.parse({
      eventId: "evt-1",
      subject: "Renamed",
      start: { dateTime: "2026-06-01T09:00:00", timeZone: "America/New_York" },
      end: { dateTime: "2026-06-01T10:00:00", timeZone: "America/New_York" },
    });
    expect(parsed).toMatchObject({
      eventId: "evt-1",
      subject: "Renamed",
      start: { dateTime: "2026-06-01T09:00:00", timeZone: "America/New_York" },
      end: { dateTime: "2026-06-01T10:00:00", timeZone: "America/New_York" },
    });
    expect(parsed).not.toHaveProperty("startDateTime");
  });

  it("normalizes the builder FLAT shape into the nested shape", () => {
    const parsed = UpdateEventConfigSchema.parse({
      eventId: "evt-1",
      subject: "Renamed",
      startDateTime: "2026-06-01T09:00:00",
      startTimeZone: "America/New_York",
      endDateTime: "2026-06-01T10:00:00",
      endTimeZone: "America/New_York",
    });
    expect(parsed.start).toEqual({
      dateTime: "2026-06-01T09:00:00",
      timeZone: "America/New_York",
    });
    expect(parsed.end).toEqual({
      dateTime: "2026-06-01T10:00:00",
      timeZone: "America/New_York",
    });
    expect(parsed).not.toHaveProperty("startDateTime");
  });

  it("normalizes one-sided flat input (start only) — Graph rejects later but schema accepts", () => {
    const parsed = UpdateEventConfigSchema.parse({
      eventId: "evt-1",
      startDateTime: "2026-06-01T09:00:00",
      startTimeZone: "America/New_York",
    });
    expect(parsed.start).toEqual({
      dateTime: "2026-06-01T09:00:00",
      timeZone: "America/New_York",
    });
    expect(parsed.end).toBeUndefined();
  });

  it("treats empty / whitespace-only flat strings as absent (preserves the ≥1-mutable-field refine)", () => {
    expect(() =>
      UpdateEventConfigSchema.parse({
        eventId: "evt-1",
        startDateTime: "   ",
        endDateTime: "",
      }),
    ).toThrow(); // start/end become undefined → no mutable field → ≥1 refine fails
  });

  it("rejects an update with no mutable fields besides eventId (existing refine)", () => {
    expect(() => UpdateEventConfigSchema.parse({ eventId: "evt-1" })).toThrow();
  });

  it("prefers nested on mixed-shape input (flat ignored when nested present)", () => {
    const parsed = UpdateEventConfigSchema.parse({
      eventId: "evt-1",
      start: { dateTime: "2026-06-01T09:00:00" },
      end: { dateTime: "2026-06-01T10:00:00" },
      // Conflicting flat — nested wins.
      startDateTime: "2099-01-01T00:00:00",
      endDateTime: "2099-01-01T01:00:00",
    });
    expect(parsed.start?.dateTime).toBe("2026-06-01T09:00:00");
    expect(parsed.end?.dateTime).toBe("2026-06-01T10:00:00");
  });

  it("preserves strict mode — unknown extra fields still rejected", () => {
    expect(() =>
      UpdateEventConfigSchema.parse({
        eventId: "evt-1",
        subject: "Renamed",
        unknownField: "leak",
      }),
    ).toThrow();
  });

  it("preserves the Q11 bodyContentType-when-body refine", () => {
    expect(() =>
      UpdateEventConfigSchema.parse({
        eventId: "evt-1",
        body: "New body",
        // bodyContentType deliberately omitted
      }),
    ).toThrow();
    expect(() =>
      UpdateEventConfigSchema.parse({
        eventId: "evt-1",
        body: "New body",
        bodyContentType: "HTML",
      }),
    ).not.toThrow();
  });
});
