/**
 * @jest-environment node
 *
 * CONFIG-UX sweep — Outlook Calendar create_event / update_event meta
 * Advanced-tab placement.
 *
 * The four optional calendar-presentation refinements (`showAs`,
 * `sensitivity`, `importance`, `reminderMinutesBeforeStart`) move to
 * the Advanced tab; the Q11 explicit-decision fields (`isAllDay`,
 * `responseRequested` on create) stay required in the normal setup
 * path with NO default, and `bodyContentType` stays in setup (its
 * controller `body` is free text, which top-level `visibleWhen`
 * cannot gate on).
 */

import { microsoftOutlookCalendarCreateEventMeta } from "@/integrations/microsoft-outlook-calendar/actions/createEvent.meta";
import { microsoftOutlookCalendarUpdateEventMeta } from "@/integrations/microsoft-outlook-calendar/actions/updateEvent.meta";

const ADVANCED_QUARTET = [
  "showAs",
  "sensitivity",
  "importance",
  "reminderMinutesBeforeStart",
];

describe.each([
  ["create_event", microsoftOutlookCalendarCreateEventMeta],
  ["update_event", microsoftOutlookCalendarUpdateEventMeta],
])("Outlook Calendar %s meta — Advanced-tab placement", (_key, meta) => {
  it("showAs / sensitivity / importance / reminder are advanced + optional", () => {
    for (const name of ADVANCED_QUARTET) {
      const field = meta.fields.find((f) => f.name === name)!;
      expect(field).toBeDefined();
      expect(field.advanced).toBe(true);
      expect(field.required).toBe(false);
    }
  });

  it("bodyContentType stays in the normal setup path (no advanced, no visibleWhen)", () => {
    const field = meta.fields.find((f) => f.name === "bodyContentType")!;
    expect(field.advanced).toBeUndefined();
    expect(field.visibleWhen).toBeUndefined();
  });
});

describe("Outlook Calendar create_event meta — Q11 fields stay required with no default", () => {
  it("isAllDay + responseRequested are required booleans without defaultValue", () => {
    for (const name of ["isAllDay", "responseRequested"]) {
      const field = microsoftOutlookCalendarCreateEventMeta.fields.find(
        (f) => f.name === name,
      )!;
      expect(field.type).toBe("boolean");
      expect(field.required).toBe(true);
      expect(field.defaultValue).toBeUndefined();
      expect(field.advanced).toBeUndefined();
    }
  });
});
