/**
 * @jest-environment node
 *
 * Slice 4.OUTLOOK-CAL-META-2 — Microsoft Outlook Calendar provider-route
 * coverage (final launch-gap provider).
 *
 * GET /api/providers/microsoft-outlook-calendar/actions returns the 5
 * actions in display order with the full wire shape (Approach-A flat
 * time fields on create/update, NO resolver wiring, destructive
 * delete_event, sensitive attendees / organizer / events / attendees-
 * lists); GET .../triggers returns the event_changed Graph-subscription
 * webhook trigger with `fields:[]` + sensitive body / attendees /
 * organizer / onlineMeetingUrl; the providers index marks
 * microsoft-outlook-calendar hasMetadata=true. No provider API calls
 * (pure registry read).
 */

const mockGetUser = jest.fn();
jest.mock("@/utils/supabase/server", () => ({
  createClient: jest.fn(async () => ({
    auth: { getUser: () => mockGetUser() },
  })),
}));

import { GET as getProviders } from "@/app/api/providers/route";
import { GET as getActions } from "@/app/api/providers/[id]/actions/route";
import { GET as getTriggers } from "@/app/api/providers/[id]/triggers/route";

beforeEach(() => {
  mockGetUser.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
});

interface WireField {
  name: string;
  type: string;
  required: boolean;
  defaultValue?: unknown;
  optionsSource?: string;
  options?: Array<{ value: string; label: string }>;
}
interface WireOutput {
  name: string;
  type: string;
  sensitive?: boolean;
}
interface WireAction {
  key: string;
  category: string;
  requiresIntegration: boolean;
  isDestructive: boolean;
  requiresConfirmation: boolean;
  riskLevel: string;
  producesFileRef: boolean;
  consumesFileRef: boolean;
  fields: WireField[];
  outputs: WireOutput[];
}

async function fetchActions(): Promise<WireAction[]> {
  const res = await getActions(
    new Request("http://x/microsoft-outlook-calendar/actions"),
    { params: Promise.resolve({ id: "microsoft-outlook-calendar" }) },
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as { provider: string; actions: WireAction[] };
  expect(body.provider).toBe("microsoft-outlook-calendar");
  return body.actions;
}

describe("GET /api/providers/microsoft-outlook-calendar/actions", () => {
  it("returns the full 5-action surface in display order", async () => {
    const actions = await fetchActions();
    expect(actions.map((a) => a.key)).toEqual([
      "microsoft-outlook-calendar:create_event",
      "microsoft-outlook-calendar:list_events",
      "microsoft-outlook-calendar:update_event",
      "microsoft-outlook-calendar:delete_event",
      "microsoft-outlook-calendar:add_attendees",
    ]);
  });

  it("every action requiresIntegration + category calendar + no FileRef", async () => {
    for (const a of await fetchActions()) {
      expect(a.requiresIntegration).toBe(true);
      expect(a.category).toBe("calendar");
      expect(a.producesFileRef).toBe(false);
      expect(a.consumesFileRef).toBe(false);
    }
  });

  it("create_event exposes 4 Approach-A flat time fields (no nested start/end)", async () => {
    const create = (await fetchActions()).find(
      (a) => a.key === "microsoft-outlook-calendar:create_event",
    )!;
    const names = new Set(create.fields.map((f) => f.name));
    for (const n of ["startDateTime", "startTimeZone", "endDateTime", "endTimeZone"]) {
      expect(names.has(n)).toBe(true);
    }
    expect(names.has("start")).toBe(false);
    expect(names.has("end")).toBe(false);
    // CONFIG-UX-SETUP-ADVANCED-1: date-times use the datetime picker, zones the timezone picker.
    const startDateTime = create.fields.find((f) => f.name === "startDateTime")!;
    expect(startDateTime.type).toBe("datetime");
    expect(startDateTime.required).toBe(true);
    const startTimeZone = create.fields.find((f) => f.name === "startTimeZone")!;
    expect(startTimeZone.type).toBe("timezone");
    const endDateTime = create.fields.find((f) => f.name === "endDateTime")!;
    expect(endDateTime.type).toBe("datetime");
    expect(endDateTime.required).toBe(true);
  });

  it("update_event exposes the same 4 flat time fields (all optional)", async () => {
    const update = (await fetchActions()).find(
      (a) => a.key === "microsoft-outlook-calendar:update_event",
    )!;
    for (const n of ["startDateTime", "endDateTime"]) {
      const f = update.fields.find((x) => x.name === n)!;
      expect(f.type).toBe("datetime");
      expect(f.required).toBe(false);
    }
    for (const n of ["startTimeZone", "endTimeZone"]) {
      const f = update.fields.find((x) => x.name === n)!;
      expect(f.type).toBe("timezone");
      expect(f.required).toBe(false);
    }
  });

  it("eventId is the ONLY resolver-wired action field across the surface (RESOLVERS-2)", async () => {
    // Was: "NO action field references any resolver". RESOLVERS-2 shipped
    // `microsoft-outlook-calendar:events`, so the surface is no longer
    // resolver-free — but eventId is still the only wired field, and this pins
    // that rather than deleting the invariant.
    for (const a of await fetchActions()) {
      for (const f of a.fields) {
        if (f.name === "eventId") {
          expect(f.optionsSource).toBe("microsoft-outlook-calendar:events");
          continue;
        }
        expect(`${a.key}.${f.name}:${f.optionsSource}`).toBe(
          `${a.key}.${f.name}:undefined`,
        );
      }
    }
  });

  it("eventId is an events picker with NO dependsOn — these actions have no calendarId field (RESOLVERS-2)", async () => {
    // Deliberately asymmetric with google-calendar, which cascades off a real
    // `calendarId` field. The Outlook update/delete/add_attendees schemas take
    // eventId ONLY: their wrappers address /me/events, the signed-in user's
    // default calendar. So the picker is dep-less and lists from that same
    // default-calendar scope — every id it offers is one the handler can
    // actually address. Inventing a calendarId field to create a cascade parent
    // would mean changing a shipped .strict() runtime schema.
    const byKey = new Map((await fetchActions()).map((a) => [a.key, a]));
    for (const key of [
      "microsoft-outlook-calendar:update_event",
      "microsoft-outlook-calendar:delete_event",
      "microsoft-outlook-calendar:add_attendees",
    ]) {
      const action = byKey.get(key)!;
      const f = action.fields.find((x) => x.name === "eventId")!;
      expect(f.type).toBe("combobox");
      expect(f.optionsSource).toBe("microsoft-outlook-calendar:events");
      expect(f.dependsOn).toBeUndefined();
      expect(f.allowManualEntry).toBe(true);
      expect(f.required).toBe(true);
      // The premise of the dep-less design: there is no calendar field to
      // depend on. If one is ever added, this picker must become a cascade.
      expect(action.fields.map((x) => x.name)).not.toContain("calendarId");
    }
  });

  it("delete_event is destructive + requires confirmation + high; others non-destructive", async () => {
    const byKey = new Map((await fetchActions()).map((a) => [a.key, a]));
    const del = byKey.get("microsoft-outlook-calendar:delete_event")!;
    expect(del.isDestructive).toBe(true);
    expect(del.requiresConfirmation).toBe(true);
    expect(del.riskLevel).toBe("high");
    for (const key of [
      "microsoft-outlook-calendar:create_event",
      "microsoft-outlook-calendar:list_events",
      "microsoft-outlook-calendar:update_event",
      "microsoft-outlook-calendar:add_attendees",
    ]) {
      expect(byKey.get(key)!.isDestructive).toBe(false);
      expect(byKey.get(key)!.requiresConfirmation).toBe(false);
    }
  });

  it("attendees + organizer outputs serialize sensitive on create + update; events on list", async () => {
    const byKey = new Map((await fetchActions()).map((a) => [a.key, a]));
    for (const key of [
      "microsoft-outlook-calendar:create_event",
      "microsoft-outlook-calendar:update_event",
    ]) {
      const action = byKey.get(key)!;
      expect(action.outputs.find((o) => o.name === "attendees")!.sensitive).toBe(true);
      expect(action.outputs.find((o) => o.name === "organizer")!.sensitive).toBe(true);
    }
    expect(
      byKey.get("microsoft-outlook-calendar:list_events")!.outputs.find(
        (o) => o.name === "events",
      )!.sensitive,
    ).toBe(true);
  });
});

interface WireTrigger {
  key: string;
  type: string;
  activation: string;
  requiresIntegration: boolean;
  category: string;
  fields: WireField[];
  payloadShape: Array<{ name: string; type: string; sensitive?: boolean }>;
}

async function fetchTriggers(): Promise<WireTrigger[]> {
  const res = await getTriggers(
    new Request("http://x/microsoft-outlook-calendar/triggers"),
    { params: Promise.resolve({ id: "microsoft-outlook-calendar" }) },
  );
  expect(res.status).toBe(200);
  const body = (await res.json()) as { provider: string; triggers: WireTrigger[] };
  expect(body.provider).toBe("microsoft-outlook-calendar");
  return body.triggers;
}

describe("GET /api/providers/microsoft-outlook-calendar/triggers", () => {
  it("returns the 1 event_changed Graph-subscription webhook trigger with fields:[]", async () => {
    const triggers = await fetchTriggers();
    expect(triggers.map((t) => t.key)).toEqual([
      "microsoft-outlook-calendar:event_changed",
    ]);
    const t = triggers[0]!;
    expect(t.activation).toBe("webhook");
    expect(t.requiresIntegration).toBe(true);
    expect(t.category).toBe("calendar");
    expect(t.fields).toEqual([]);
  });

  it("body + attendees + organizer + onlineMeetingUrl payload fields serialize sensitive", async () => {
    const t = (await fetchTriggers())[0]!;
    const byName = new Map(t.payloadShape.map((p) => [p.name, p]));
    expect(byName.get("body")!.sensitive).toBe(true);
    expect(byName.get("attendees")!.sensitive).toBe(true);
    expect(byName.get("organizer")!.sensitive).toBe(true);
    expect(byName.get("onlineMeetingUrl")!.sensitive).toBe(true);
    expect(byName.get("eventId")!.sensitive).not.toBe(true);
    expect(byName.get("subject")!.sensitive).not.toBe(true);
  });
});

describe("GET /api/providers — microsoft-outlook-calendar hasMetadata (final launch-gap provider, closes 26/26)", () => {
  it("marks microsoft-outlook-calendar hasMetadata=true now that OUTLOOK-CAL-META-2 shipped its metas", async () => {
    const res = await getProviders();
    const body = (await res.json()) as {
      providers: Array<{ id: string; hasMetadata: boolean }>;
    };
    const outlookCal = body.providers.find(
      (p) => p.id === "microsoft-outlook-calendar",
    );
    expect(outlookCal).toBeDefined();
    expect(outlookCal?.hasMetadata).toBe(true);
  });
});
