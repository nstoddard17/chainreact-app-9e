/**
 * @jest-environment node
 *
 * Slice 4.OUTLOOK-CAL-META-2 — Microsoft Outlook Calendar trigger
 * discovery coverage.
 *
 * Pins the single `event_changed` Graph-subscription webhook trigger:
 * key, webhook activation, `fields:[]` (zero per-workflow config —
 * mirror OneDrive `file_changed`), the 17-field payload shape, and the
 * sensitive marks (`body` FORCED by SUSPICIOUS_NAMES; `attendees` /
 * `organizer` / `onlineMeetingUrl` plan-marked; subject / location /
 * webLink / dates / enums NOT marked). The activation-registry side is
 * pinned by tests/structure/trigger-meta-activation-invariant.test.ts.
 */
import {
  getTriggerMeta,
  listTriggerMetasForProvider,
} from "@/services/discovery/_registry";

describe("microsoft-outlook-calendar trigger discovery — event_changed", () => {
  it("registers exactly 1 trigger meta (event_changed)", () => {
    const metas = listTriggerMetasForProvider("microsoft-outlook-calendar");
    expect(metas.map((m) => m.key)).toEqual([
      "microsoft-outlook-calendar:event_changed",
    ]);
  });

  it("is a webhook trigger requiring an integration, category calendar", () => {
    const t = getTriggerMeta("microsoft-outlook-calendar:event_changed")!;
    expect(t.provider).toBe("microsoft-outlook-calendar");
    expect(t.key).toBe("microsoft-outlook-calendar:event_changed");
    expect(t.activation).toBe("webhook");
    expect(t.requiresIntegration).toBe(true);
    expect(t.category).toBe("calendar");
  });

  it("fields:[] — no per-workflow config (mirrors OneDrive file_changed)", () => {
    const t = getTriggerMeta("microsoft-outlook-calendar:event_changed")!;
    expect(t.fields).toEqual([]);
  });

  it("payload includes the documented 17-field shape", () => {
    const t = getTriggerMeta("microsoft-outlook-calendar:event_changed")!;
    const names = t.payloadShape.map((p) => p.name);
    for (const expected of [
      "eventId",
      "changeType",
      "subject",
      "start",
      "end",
      "isAllDay",
      "location",
      "body",
      "attendees",
      "organizer",
      "isOnlineMeeting",
      "onlineMeetingUrl",
      "webLink",
      "importance",
      "sensitivity",
      "createdDateTime",
      "lastModifiedDateTime",
    ]) {
      expect(names).toContain(expected);
    }
  });

  it("body (FORCED by SUSPICIOUS_NAMES) + attendees + organizer + onlineMeetingUrl payload fields are sensitive", () => {
    const t = getTriggerMeta("microsoft-outlook-calendar:event_changed")!;
    const byName = new Map(t.payloadShape.map((p) => [p.name, p]));
    for (const name of ["body", "attendees", "organizer", "onlineMeetingUrl"]) {
      expect(byName.get(name)!.sensitive).toBe(true);
    }
  });

  it("ids / subject / location / webLink / dates / enums are NOT marked sensitive", () => {
    const t = getTriggerMeta("microsoft-outlook-calendar:event_changed")!;
    const byName = new Map(t.payloadShape.map((p) => [p.name, p]));
    for (const name of [
      "eventId",
      "changeType",
      "subject",
      "location",
      "webLink",
      "isAllDay",
      "isOnlineMeeting",
      "importance",
      "sensitivity",
      "createdDateTime",
      "lastModifiedDateTime",
    ]) {
      expect(byName.get(name)!.sensitive).not.toBe(true);
    }
  });

  it("no secret-shaped payload names", () => {
    const BANNED = [
      "token",
      "accessToken",
      "refreshToken",
      "apiKey",
      "secret",
      "webhookSecret",
      "password",
      "downloadUrl",
    ];
    const t = getTriggerMeta("microsoft-outlook-calendar:event_changed")!;
    const names = t.payloadShape.map((p) => p.name);
    for (const b of BANNED) expect(names).not.toContain(b);
  });
});
