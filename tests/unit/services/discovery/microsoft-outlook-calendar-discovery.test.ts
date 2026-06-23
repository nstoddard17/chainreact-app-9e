/**
 * @jest-environment node
 *
 * Slice 4.OUTLOOK-CAL-META-2 — Microsoft Outlook Calendar discovery
 * coverage. Final launch-gap provider — `COVERED_PROVIDERS` reaches
 * 26/26 once this meta surface lands.
 *
 * Pins the full 5-action surface: keys in displayOrder, key===provider:type,
 * category 'calendar', camelCase fields, the Approach-A flat-time-fields
 * shape on create_event + update_event (no nested `start`/`end` field
 * exposed in the meta — schema preprocess handles both shapes), NO
 * resolver wiring on any field (zero `optionsSource` references), Q11
 * required booleans + select, the delete_event destructive trio, and
 * the deliberate sensitive marks (attendees / organizer / events /
 * attendeesAdded / attendeesAlreadyPresent). The deferred / rejected
 * resolvers must stay unreferenced. Trigger assertions live in
 * microsoft-outlook-calendar-triggers-discovery.test.ts.
 */
import {
  getActionMeta,
  listActionMetasForProvider,
  listProvidersWithMetadata,
} from "@/services/discovery/_registry";

const EXPECTED_KEYS_IN_ORDER = [
  "microsoft-outlook-calendar:create_event",
  "microsoft-outlook-calendar:list_events",
  "microsoft-outlook-calendar:update_event",
  "microsoft-outlook-calendar:delete_event",
  "microsoft-outlook-calendar:add_attendees",
];

const EVENT_ID_ACTIONS = [
  "microsoft-outlook-calendar:update_event",
  "microsoft-outlook-calendar:delete_event",
  "microsoft-outlook-calendar:add_attendees",
];

const DEFERRED_OR_REJECTED_RESOLVERS = [
  "microsoft-outlook-calendar:calendars",
  "microsoft-outlook-calendar:events",
  "microsoft-outlook-calendar:timezones",
  "microsoft-outlook-calendar:categories",
];

describe("microsoft-outlook-calendar discovery — surface", () => {
  it("registers exactly 5 action metas in displayOrder", () => {
    const metas = listActionMetasForProvider("microsoft-outlook-calendar");
    expect(metas).toHaveLength(5);
    expect(metas.map((m) => m.key)).toEqual(EXPECTED_KEYS_IN_ORDER);
  });

  it("every key equals provider:type and provider is 'microsoft-outlook-calendar'", () => {
    for (const m of listActionMetasForProvider("microsoft-outlook-calendar")) {
      expect(m.provider).toBe("microsoft-outlook-calendar");
      expect(m.key).toBe(`microsoft-outlook-calendar:${m.type}`);
    }
  });

  it("every action is category 'calendar' + requiresIntegration; no FileRef", () => {
    for (const m of listActionMetasForProvider("microsoft-outlook-calendar")) {
      expect(m.category).toBe("calendar");
      expect(m.requiresIntegration).toBe(true);
      expect(m.producesFileRef).toBe(false);
      expect(m.consumesFileRef).toBe(false);
    }
  });

  it("displayOrder is strictly ascending (10..50)", () => {
    const orders = listActionMetasForProvider("microsoft-outlook-calendar").map(
      (m) => m.displayOrder,
    );
    expect(orders[0]).toBe(10);
    expect(orders[orders.length - 1]).toBe(50);
    for (let i = 1; i < orders.length; i++) {
      expect(orders[i]!).toBeGreaterThan(orders[i - 1]!);
    }
  });

  it("microsoft-outlook-calendar is reported by listProvidersWithMetadata", () => {
    expect(listProvidersWithMetadata()).toContain("microsoft-outlook-calendar");
  });
});

describe("microsoft-outlook-calendar discovery — field hygiene + zero resolver wiring", () => {
  it("all field names are camelCase (mirror the runtime Zod schemas)", () => {
    for (const m of listActionMetasForProvider("microsoft-outlook-calendar")) {
      for (const f of m.fields) {
        expect(f.name).toMatch(/^[a-z][a-zA-Z0-9]*$/);
      }
    }
  });

  it("Approach-A flat time fields on create_event (datetime pair required, timezone pair optional)", () => {
    const create = getActionMeta("microsoft-outlook-calendar:create_event")!;
    const startDateTime = create.fields.find((f) => f.name === "startDateTime")!;
    const endDateTime = create.fields.find((f) => f.name === "endDateTime")!;
    const startTimeZone = create.fields.find((f) => f.name === "startTimeZone")!;
    const endTimeZone = create.fields.find((f) => f.name === "endTimeZone")!;
    expect(startDateTime.type).toBe("datetime");
    expect(startDateTime.required).toBe(true);
    expect(endDateTime.type).toBe("datetime");
    expect(endDateTime.required).toBe(true);
    expect(startTimeZone.type).toBe("timezone");
    expect(startTimeZone.required).toBe(false);
    expect(endTimeZone.type).toBe("timezone");
    expect(endTimeZone.required).toBe(false);
    // No nested start/end exposed.
    expect(create.fields.find((f) => f.name === "start")).toBeUndefined();
    expect(create.fields.find((f) => f.name === "end")).toBeUndefined();
  });

  it("Approach-A flat time fields on update_event (4 flat fields, all optional; datetime pair + timezone pair)", () => {
    const update = getActionMeta("microsoft-outlook-calendar:update_event")!;
    for (const name of ["startDateTime", "endDateTime"]) {
      const f = update.fields.find((x) => x.name === name)!;
      expect(f.type).toBe("datetime");
      expect(f.required).toBe(false);
    }
    for (const name of ["startTimeZone", "endTimeZone"]) {
      const f = update.fields.find((x) => x.name === name)!;
      expect(f.type).toBe("timezone");
      expect(f.required).toBe(false);
    }
    expect(update.fields.find((f) => f.name === "start")).toBeUndefined();
    expect(update.fields.find((f) => f.name === "end")).toBeUndefined();
  });

  it("eventId is typeable text (no resolver) on update/delete/add_attendees, required", () => {
    for (const key of EVENT_ID_ACTIONS) {
      const f = getActionMeta(key)!.fields.find((x) => x.name === "eventId")!;
      expect(f.type).toBe("text");
      expect(f.optionsSource).toBeUndefined();
      expect(f.required).toBe(true);
    }
  });

  it("NO field anywhere references a resolver (zero optionsSource across the surface)", () => {
    for (const m of listActionMetasForProvider("microsoft-outlook-calendar")) {
      for (const f of m.fields) {
        expect(f.optionsSource).toBeUndefined();
      }
    }
  });

  it("the deferred / rejected resolvers stay unreferenced", () => {
    for (const m of listActionMetasForProvider("microsoft-outlook-calendar")) {
      for (const f of m.fields) {
        for (const resolver of DEFERRED_OR_REJECTED_RESOLVERS) {
          expect(f.optionsSource).not.toBe(resolver);
        }
      }
    }
  });

  it("Q11 required fields wired (create isAllDay + responseRequested; create bodyContentType-when-body documented)", () => {
    const create = getActionMeta("microsoft-outlook-calendar:create_event")!;
    expect(create.fields.find((f) => f.name === "isAllDay")!.required).toBe(true);
    expect(create.fields.find((f) => f.name === "responseRequested")!.required).toBe(true);
    // bodyContentType is field-level optional (cross-field rule lives in
    // the schema refine); meta documents the relationship via help text.
    const bct = create.fields.find((f) => f.name === "bodyContentType")!;
    expect(bct.type).toBe("select");
    expect(bct.options!.map((o) => o.value)).toEqual(["Text", "HTML"]);
  });

  it("Q11 add_attendees.attendeeType is a required select (required|optional)", () => {
    const add = getActionMeta("microsoft-outlook-calendar:add_attendees")!;
    const at = add.fields.find((f) => f.name === "attendeeType")!;
    expect(at.type).toBe("select");
    expect(at.required).toBe(true);
    expect(at.options!.map((o) => o.value)).toEqual(["required", "optional"]);
  });

  it("list_events.top is a number with bounds matching the schema (1..100, default 25)", () => {
    const top = getActionMeta("microsoft-outlook-calendar:list_events")!.fields.find(
      (f) => f.name === "top",
    )!;
    expect(top.type).toBe("number");
    expect(top.defaultValue).toBe(25);
    expect(top.numeric).toEqual({ min: 1, max: 100, integer: true });
  });

  it("list_events.orderBy is a static select (start | subject, default start)", () => {
    const ob = getActionMeta("microsoft-outlook-calendar:list_events")!.fields.find(
      (f) => f.name === "orderBy",
    )!;
    expect(ob.type).toBe("select");
    expect(ob.defaultValue).toBe("start");
    expect(ob.options!.map((o) => o.value)).toEqual(["start", "subject"]);
  });

  it("attendees fields are string-array (create optional, update optional, add_attendees required)", () => {
    const create = getActionMeta("microsoft-outlook-calendar:create_event")!.fields.find(
      (f) => f.name === "attendees",
    )!;
    expect(create.type).toBe("string-array");
    expect(create.required).toBe(false);
    const update = getActionMeta("microsoft-outlook-calendar:update_event")!.fields.find(
      (f) => f.name === "attendees",
    )!;
    expect(update.type).toBe("string-array");
    expect(update.required).toBe(false);
    const add = getActionMeta("microsoft-outlook-calendar:add_attendees")!.fields.find(
      (f) => f.name === "attendees",
    )!;
    expect(add.type).toBe("string-array");
    expect(add.required).toBe(true);
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
      "downloadUrl",
    ];
    for (const m of listActionMetasForProvider("microsoft-outlook-calendar")) {
      const names = m.outputs.map((o) => o.name);
      for (const banned of BANNED) expect(names).not.toContain(banned);
    }
  });
});

describe("microsoft-outlook-calendar discovery — risk (delete destructive; writes medium; read low)", () => {
  it("delete_event is high + destructive + requiresConfirmation", () => {
    const del = getActionMeta("microsoft-outlook-calendar:delete_event")!;
    expect(del.riskLevel).toBe("high");
    expect(del.isDestructive).toBe(true);
    expect(del.requiresConfirmation).toBe(true);
    expect(del.riskDescription).toMatch(/cancellation/i);
  });

  it("create/update/add_attendees are medium; list_events is low; none but delete is destructive", () => {
    for (const key of [
      "microsoft-outlook-calendar:create_event",
      "microsoft-outlook-calendar:update_event",
      "microsoft-outlook-calendar:add_attendees",
    ]) {
      expect(getActionMeta(key)!.riskLevel).toBe("medium");
    }
    expect(getActionMeta("microsoft-outlook-calendar:list_events")!.riskLevel).toBe("low");
    for (const key of [
      "microsoft-outlook-calendar:create_event",
      "microsoft-outlook-calendar:list_events",
      "microsoft-outlook-calendar:update_event",
      "microsoft-outlook-calendar:add_attendees",
    ]) {
      expect(getActionMeta(key)!.isDestructive).toBe(false);
      expect(getActionMeta(key)!.requiresConfirmation).toBe(false);
    }
  });
});

describe("microsoft-outlook-calendar discovery — sensitive outputs", () => {
  it("attendee + organizer arrays/objects are sensitive on create + update", () => {
    for (const key of [
      "microsoft-outlook-calendar:create_event",
      "microsoft-outlook-calendar:update_event",
    ]) {
      expect(
        getActionMeta(key)!.outputs.find((o) => o.name === "attendees")!.sensitive,
      ).toBe(true);
      expect(
        getActionMeta(key)!.outputs.find((o) => o.name === "organizer")!.sensitive,
      ).toBe(true);
    }
  });

  it("list_events.events bulk read is sensitive", () => {
    expect(
      getActionMeta("microsoft-outlook-calendar:list_events")!.outputs.find(
        (o) => o.name === "events",
      )!.sensitive,
    ).toBe(true);
  });

  it("add_attendees email-list outputs are sensitive (attendeesAdded + attendeesAlreadyPresent)", () => {
    const add = getActionMeta("microsoft-outlook-calendar:add_attendees")!;
    expect(add.outputs.find((o) => o.name === "attendeesAdded")!.sensitive).toBe(true);
    expect(
      add.outputs.find((o) => o.name === "attendeesAlreadyPresent")!.sensitive,
    ).toBe(true);
  });

  it("ids / subject / start / end / isAllDay / webLink / counts / cursors / dates are NOT marked sensitive", () => {
    const NON_SENSITIVE = new Set([
      "id",
      "eventId",
      "subject",
      "start",
      "end",
      "isAllDay",
      "webLink",
      "count",
      "hasMore",
      "nextLink",
      "deleted",
      "alreadyMissing",
      "attendeesTotal",
    ]);
    for (const m of listActionMetasForProvider("microsoft-outlook-calendar")) {
      for (const o of m.outputs) {
        if (NON_SENSITIVE.has(o.name)) expect(o.sensitive).not.toBe(true);
      }
    }
  });
});
