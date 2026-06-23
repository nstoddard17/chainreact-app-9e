/**
 * @jest-environment node
 *
 * Slice 4.GCAL-META-2 — Google Calendar trigger discovery coverage.
 *
 * Pins the single `event_changed` watch-based webhook trigger: key, webhook
 * activation, the single typeable `calendarId` config field (default
 * "primary", no resolver), and the sensitive `attendees` / `description`
 * payload fields. The activation-registry side is pinned by
 * tests/structure/trigger-meta-activation-invariant.test.ts.
 */
import {
  getTriggerMeta,
  listTriggerMetasForProvider,
} from "@/services/discovery/_registry";

describe("google-calendar trigger discovery — event_changed", () => {
  it("registers exactly 1 trigger meta (event_changed)", () => {
    const metas = listTriggerMetasForProvider("google-calendar");
    expect(metas.map((m) => m.key)).toEqual(["google-calendar:event_changed"]);
  });

  it("is a webhook trigger requiring an integration, category calendar", () => {
    const t = getTriggerMeta("google-calendar:event_changed")!;
    expect(t.provider).toBe("google-calendar");
    expect(t.key).toBe("google-calendar:event_changed");
    expect(t.activation).toBe("webhook");
    expect(t.requiresIntegration).toBe(true);
    expect(t.category).toBe("calendar");
  });

  it("calendarId is the single google-calendar:calendars combobox config field (default 'primary', manual entry)", () => {
    // CONFIG-FIELD-UX-SWEEP-4: the watch trigger's calendarId now picks from the
    // calendar list with a typeable-id fallback; default stays 'primary'.
    const t = getTriggerMeta("google-calendar:event_changed")!;
    expect(t.fields.map((f) => f.name)).toEqual(["calendarId"]);
    const cal = t.fields[0]!;
    expect(cal.type).toBe("combobox");
    expect(cal.optionsSource).toBe("google-calendar:calendars");
    expect(cal.allowManualEntry).toBe(true);
    expect(cal.defaultValue).toBe("primary");
  });

  it("attendees + description payload fields are sensitive; ids/titles/dates are not", () => {
    const t = getTriggerMeta("google-calendar:event_changed")!;
    const byName = new Map(t.payloadShape.map((p) => [p.name, p]));
    for (const name of ["attendees", "description"]) {
      expect(byName.get(name)!.sensitive).toBe(true);
    }
    for (const name of [
      "changeKind",
      "calendarId",
      "eventId",
      "summary",
      "location",
      "htmlLink",
      "status",
      "updated",
    ]) {
      expect(byName.get(name)!.sensitive).not.toBe(true);
    }
  });

  it("payload includes the documented 12-field shape", () => {
    const t = getTriggerMeta("google-calendar:event_changed")!;
    const names = t.payloadShape.map((p) => p.name);
    for (const expected of [
      "changeKind",
      "calendarId",
      "eventId",
      "summary",
      "description",
      "location",
      "start",
      "end",
      "attendees",
      "htmlLink",
      "status",
      "updated",
    ]) {
      expect(names).toContain(expected);
    }
  });

  it("no trigger field references the still-deferred/rejected Calendar resolvers", () => {
    // `google-calendar:calendars` shipped in SWEEP-4 (now wired above); the rest
    // remain unbuilt.
    const t = getTriggerMeta("google-calendar:event_changed")!;
    for (const f of t.fields) {
      for (const resolver of [
        "google-calendar:events",
        "google-calendar:timezones",
        "google-calendar:colors",
      ]) {
        expect(f.optionsSource).not.toBe(resolver);
      }
    }
  });

  it("no secret-shaped payload names", () => {
    const BANNED = ["token", "accessToken", "refreshToken", "apiKey", "secret", "webhookSecret", "password"];
    const t = getTriggerMeta("google-calendar:event_changed")!;
    const names = t.payloadShape.map((p) => p.name);
    for (const b of BANNED) expect(names).not.toContain(b);
  });
});
