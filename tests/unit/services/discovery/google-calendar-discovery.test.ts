/**
 * @jest-environment node
 *
 * Slice 4.GCAL-META-2 — Google Calendar discovery-registry coverage.
 *
 * Pins the full 5-action Calendar surface: keys in displayOrder,
 * key===provider:type, category 'calendar', camelCase fields, NO resolver
 * wiring (calendarId text/default "primary"; eventId typeable text), Q11
 * required fields, list_events.maxResults bounds, the delete_event
 * destructive trio, and the deliberate sensitive marks (attendee email
 * arrays + meetLink + events bulk read + description bodies). The
 * rejected/deferred Calendar resolvers must stay unreferenced. Trigger
 * assertions live in google-calendar-triggers-discovery.test.ts.
 */
import {
  getActionMeta,
  listActionMetasForProvider,
  listProvidersWithMetadata,
} from "@/services/discovery/_registry";

const EXPECTED_KEYS_IN_ORDER = [
  "google-calendar:create_event",
  "google-calendar:list_events",
  "google-calendar:update_event",
  "google-calendar:delete_event",
  "google-calendar:add_attendees",
];

/** Actions that take a typeable eventId. */
const EVENT_ID_ACTIONS = [
  "google-calendar:update_event",
  "google-calendar:delete_event",
  "google-calendar:add_attendees",
];

const DEFERRED_RESOLVERS = [
  "google-calendar:calendars",
  "google-calendar:events",
  "google-calendar:timezones",
  "google-calendar:colors",
];

describe("google-calendar discovery — surface", () => {
  it("registers exactly 5 action metas in displayOrder", () => {
    const metas = listActionMetasForProvider("google-calendar");
    expect(metas).toHaveLength(5);
    expect(metas.map((m) => m.key)).toEqual(EXPECTED_KEYS_IN_ORDER);
  });

  it("every key equals provider:type and provider is 'google-calendar'", () => {
    for (const m of listActionMetasForProvider("google-calendar")) {
      expect(m.provider).toBe("google-calendar");
      expect(m.key).toBe(`google-calendar:${m.type}`);
    }
  });

  it("every action is category 'calendar' + requiresIntegration; no FileRef", () => {
    for (const m of listActionMetasForProvider("google-calendar")) {
      expect(m.category).toBe("calendar");
      expect(m.requiresIntegration).toBe(true);
      expect(m.producesFileRef).toBe(false);
      expect(m.consumesFileRef).toBe(false);
    }
  });

  it("displayOrder is strictly ascending (10..50)", () => {
    const orders = listActionMetasForProvider("google-calendar").map((m) => m.displayOrder);
    expect(orders[0]).toBe(10);
    expect(orders[orders.length - 1]).toBe(50);
    for (let i = 1; i < orders.length; i++) {
      expect(orders[i]!).toBeGreaterThan(orders[i - 1]!);
    }
  });

  it("google-calendar is reported by listProvidersWithMetadata", () => {
    expect(listProvidersWithMetadata()).toContain("google-calendar");
  });
});

describe("google-calendar discovery — field hygiene + no resolver wiring", () => {
  it("all field names are camelCase (mirror the runtime Zod schemas)", () => {
    for (const m of listActionMetasForProvider("google-calendar")) {
      for (const f of m.fields) {
        expect(f.name).toMatch(/^[a-z][a-zA-Z0-9]*$/);
      }
    }
  });

  it("calendarId is typeable text defaulting to 'primary' with no resolver (all 5 actions)", () => {
    for (const key of EXPECTED_KEYS_IN_ORDER) {
      const cal = getActionMeta(key)!.fields.find((f) => f.name === "calendarId")!;
      expect(cal.type).toBe("text");
      expect(cal.defaultValue).toBe("primary");
      expect(cal.optionsSource).toBeUndefined();
      expect(cal.required).toBe(false);
    }
  });

  it("eventId is typeable text with no resolver (update/delete/add_attendees, required)", () => {
    for (const key of EVENT_ID_ACTIONS) {
      const ev = getActionMeta(key)!.fields.find((f) => f.name === "eventId")!;
      expect(ev.type).toBe("text");
      expect(ev.optionsSource).toBeUndefined();
      expect(ev.required).toBe(true);
    }
  });

  it("no field anywhere references the deferred/rejected Calendar resolvers", () => {
    for (const m of listActionMetasForProvider("google-calendar")) {
      for (const f of m.fields) {
        for (const resolver of DEFERRED_RESOLVERS) {
          expect(f.optionsSource).not.toBe(resolver);
        }
      }
    }
  });

  it("sendNotifications is a required select (all/externalOnly/none) on every write", () => {
    for (const key of [
      "google-calendar:create_event",
      "google-calendar:update_event",
      "google-calendar:delete_event",
      "google-calendar:add_attendees",
    ]) {
      const f = getActionMeta(key)!.fields.find((x) => x.name === "sendNotifications")!;
      expect(f.type).toBe("select");
      expect(f.required).toBe(true);
      expect(f.options!.map((o) => o.value)).toEqual(["all", "externalOnly", "none"]);
    }
  });

  it("create_event Q11 guest-permission fields are required booleans", () => {
    const create = getActionMeta("google-calendar:create_event")!;
    for (const name of ["guestsCanInviteOthers", "guestsCanSeeOtherGuests"]) {
      const f = create.fields.find((x) => x.name === name)!;
      expect(f.type).toBe("boolean");
      expect(f.required).toBe(true);
    }
  });

  it("list_events.maxResults is a number with bounds matching the schema (1..2500)", () => {
    const max = getActionMeta("google-calendar:list_events")!.fields.find(
      (f) => f.name === "maxResults",
    )!;
    expect(max.type).toBe("number");
    expect(max.numeric).toEqual({ min: 1, max: 2500, integer: true });
  });

  it("attendees fields are string-array (create/update/add_attendees)", () => {
    for (const key of [
      "google-calendar:create_event",
      "google-calendar:update_event",
      "google-calendar:add_attendees",
    ]) {
      const f = getActionMeta(key)!.fields.find((x) => x.name === "attendees")!;
      expect(f.type).toBe("string-array");
    }
  });

  it("no secret-shaped output names anywhere", () => {
    const BANNED = [
      "token",
      "accessToken",
      "refreshToken",
      "apiKey",
      "clientSecret",
      "secret",
      "webhookSecret",
      "password",
    ];
    for (const m of listActionMetasForProvider("google-calendar")) {
      const names = m.outputs.map((o) => o.name);
      for (const banned of BANNED) expect(names).not.toContain(banned);
    }
  });
});

describe("google-calendar discovery — risk (delete destructive; writes medium; read low)", () => {
  it("delete_event is high + destructive + requiresConfirmation", () => {
    const del = getActionMeta("google-calendar:delete_event")!;
    expect(del.riskLevel).toBe("high");
    expect(del.isDestructive).toBe(true);
    expect(del.requiresConfirmation).toBe(true);
  });

  it("create/update/add_attendees are medium; list_events is low; none but delete is destructive", () => {
    for (const key of [
      "google-calendar:create_event",
      "google-calendar:update_event",
      "google-calendar:add_attendees",
    ]) {
      expect(getActionMeta(key)!.riskLevel).toBe("medium");
    }
    expect(getActionMeta("google-calendar:list_events")!.riskLevel).toBe("low");
    for (const key of [
      "google-calendar:create_event",
      "google-calendar:list_events",
      "google-calendar:update_event",
      "google-calendar:add_attendees",
    ]) {
      expect(getActionMeta(key)!.isDestructive).toBe(false);
      expect(getActionMeta(key)!.requiresConfirmation).toBe(false);
    }
  });
});

describe("google-calendar discovery — sensitive outputs", () => {
  it("attendee email arrays are sensitive", () => {
    expect(
      getActionMeta("google-calendar:create_event")!.outputs.find((o) => o.name === "attendees")!
        .sensitive,
    ).toBe(true);
    expect(
      getActionMeta("google-calendar:update_event")!.outputs.find((o) => o.name === "attendees")!
        .sensitive,
    ).toBe(true);
    const add = getActionMeta("google-calendar:add_attendees")!;
    for (const name of ["attendees", "addedAttendees", "alreadyInvited"]) {
      expect(add.outputs.find((o) => o.name === name)!.sensitive).toBe(true);
    }
  });

  it("list_events.events bulk read is sensitive", () => {
    expect(
      getActionMeta("google-calendar:list_events")!.outputs.find((o) => o.name === "events")!
        .sensitive,
    ).toBe(true);
  });

  it("create_event.meetLink is sensitive (access-bearing Meet URL)", () => {
    expect(
      getActionMeta("google-calendar:create_event")!.outputs.find((o) => o.name === "meetLink")!
        .sensitive,
    ).toBe(true);
  });

  it("event description body is sensitive on update_event", () => {
    expect(
      getActionMeta("google-calendar:update_event")!.outputs.find((o) => o.name === "description")!
        .sensitive,
    ).toBe(true);
  });

  it("ids / titles / location / htmlLink / dates / counts / cursors are NOT marked sensitive", () => {
    const NON_SENSITIVE = new Set([
      "eventId",
      "calendarId",
      "htmlLink",
      "summary",
      "location",
      "status",
      "start",
      "end",
      "updated",
      "count",
      "firstEventId",
      "lastEventId",
      "nextPageToken",
      "nextSyncToken",
      "timeMin",
      "timeMax",
      "deleted",
      "alreadyDeleted",
      "deletedAt",
      "eventTitle",
      "eventStart",
      "eventEnd",
      "actuallyAdded",
      "totalAttendees",
    ]);
    for (const m of listActionMetasForProvider("google-calendar")) {
      for (const o of m.outputs) {
        if (NON_SENSITIVE.has(o.name)) expect(o.sensitive).not.toBe(true);
      }
    }
  });
});
