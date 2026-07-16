/**
 * @jest-environment node
 *
 * Slice 4.GCAL-META-2 — Google Calendar provider-route coverage.
 *
 * GET /api/providers/google-calendar/actions returns the 5 actions in display
 * order with the full wire shape (typeable calendarId/eventId, risk, sensitive
 * outputs); GET .../triggers returns the event_changed webhook trigger; the
 * providers index marks google-calendar hasMetadata=true. No provider API
 * calls (pure registry read).
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
  dependsOn?: string | string[];
  options?: Array<{ value: string; label: string }>;
}
interface WireOutput {
  name: string;
  type: string;
  sensitive?: boolean;
  fields?: WireOutput[];
}
interface WireAction {
  key: string;
  category: string;
  requiresIntegration: boolean;
  isDestructive: boolean;
  requiresConfirmation: boolean;
  riskLevel: string;
  fields: WireField[];
  outputs: WireOutput[];
}

async function fetchActions(): Promise<WireAction[]> {
  const res = await getActions(new Request("http://x/google-calendar/actions"), {
    params: Promise.resolve({ id: "google-calendar" }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { provider: string; actions: WireAction[] };
  expect(body.provider).toBe("google-calendar");
  return body.actions;
}

describe("GET /api/providers/google-calendar/actions", () => {
  it("returns the full 5-action surface in display order", async () => {
    const actions = await fetchActions();
    expect(actions.map((a) => a.key)).toEqual([
      "google-calendar:create_event",
      "google-calendar:list_events",
      "google-calendar:update_event",
      "google-calendar:delete_event",
      "google-calendar:add_attendees",
    ]);
  });

  it("every action requiresIntegration + category calendar", async () => {
    for (const a of await fetchActions()) {
      expect(a.requiresIntegration).toBe(true);
      expect(a.category).toBe("calendar");
    }
  });

  it("calendarId serializes as a combobox on the calendars resolver, default 'primary' (CONFIG-UX-SETUP-ADVANCED-1)", async () => {
    for (const a of await fetchActions()) {
      const cal = a.fields.find((f) => f.name === "calendarId")!;
      expect(cal.type).toBe("combobox");
      expect(cal.defaultValue).toBe("primary");
      expect(cal.optionsSource).toBe("google-calendar:calendars");
    }
  });

  it("eventId serializes as typeable text with no resolver (update/delete/add_attendees)", async () => {
    const byKey = new Map((await fetchActions()).map((a) => [a.key, a]));
    for (const key of [
      "google-calendar:update_event",
      "google-calendar:delete_event",
      "google-calendar:add_attendees",
    ]) {
      const ev = byKey.get(key)!.fields.find((f) => f.name === "eventId")!;
      expect(ev.type).toBe("text");
      expect(ev.optionsSource).toBeUndefined();
      expect(ev.required).toBe(true);
    }
  });

  it("delete_event is destructive + requires confirmation + high; others non-destructive", async () => {
    const byKey = new Map((await fetchActions()).map((a) => [a.key, a]));
    const del = byKey.get("google-calendar:delete_event")!;
    expect(del.isDestructive).toBe(true);
    expect(del.requiresConfirmation).toBe(true);
    expect(del.riskLevel).toBe("high");
    for (const key of [
      "google-calendar:create_event",
      "google-calendar:list_events",
      "google-calendar:update_event",
      "google-calendar:add_attendees",
    ]) {
      expect(byKey.get(key)!.isDestructive).toBe(false);
      expect(byKey.get(key)!.requiresConfirmation).toBe(false);
    }
  });

  it("attendees + meetLink outputs serialize sensitive", async () => {
    const byKey = new Map((await fetchActions()).map((a) => [a.key, a]));
    expect(
      byKey.get("google-calendar:create_event")!.outputs.find((o) => o.name === "attendees")!
        .sensitive,
    ).toBe(true);
    expect(
      byKey.get("google-calendar:create_event")!.outputs.find((o) => o.name === "meetLink")!
        .sensitive,
    ).toBe(true);
    expect(
      byKey.get("google-calendar:list_events")!.outputs.find((o) => o.name === "events")!
        .sensitive,
    ).toBe(true);
  });

  it("only calendarId references the calendars resolver; deferred/rejected Calendar resolvers stay unwired", async () => {
    for (const a of await fetchActions()) {
      for (const f of a.fields) {
        if (f.name === "calendarId") {
          // CONFIG-UX-SETUP-ADVANCED-1 wired the calendars resolver.
          expect(f.optionsSource).toBe("google-calendar:calendars");
          continue;
        }
        for (const resolver of [
          "google-calendar:calendars",
          "google-calendar:events",
          "google-calendar:timezones",
          "google-calendar:colors",
        ]) {
          expect(f.optionsSource).not.toBe(resolver);
        }
      }
    }
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
  const res = await getTriggers(new Request("http://x/google-calendar/triggers"), {
    params: Promise.resolve({ id: "google-calendar" }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { provider: string; triggers: WireTrigger[] };
  expect(body.provider).toBe("google-calendar");
  return body.triggers;
}

describe("GET /api/providers/google-calendar/triggers", () => {
  it("returns the 1 event_changed webhook trigger with a calendarId field", async () => {
    const triggers = await fetchTriggers();
    expect(triggers.map((t) => t.key)).toEqual(["google-calendar:event_changed"]);
    const t = triggers[0]!;
    expect(t.activation).toBe("webhook");
    expect(t.requiresIntegration).toBe(true);
    expect(t.category).toBe("calendar");
    const cal = t.fields.find((f) => f.name === "calendarId")!;
    expect(cal.type).toBe("combobox");
    expect(cal.defaultValue).toBe("primary");
    expect(cal.optionsSource).toBe("google-calendar:calendars");
  });

  it("attendees + description payload fields serialize sensitive", async () => {
    const t = (await fetchTriggers())[0]!;
    const byName = new Map(t.payloadShape.map((p) => [p.name, p]));
    expect(byName.get("attendees")!.sensitive).toBe(true);
    expect(byName.get("description")!.sensitive).toBe(true);
    expect(byName.get("eventId")!.sensitive).not.toBe(true);
  });
});

describe("GET /api/providers — google-calendar hasMetadata", () => {
  it("marks google-calendar hasMetadata=true now that GCAL-META-2 shipped its metas", async () => {
    const res = await getProviders();
    const body = (await res.json()) as {
      providers: Array<{ id: string; hasMetadata: boolean }>;
    };
    const cal = body.providers.find((p) => p.id === "google-calendar");
    expect(cal).toBeDefined();
    expect(cal?.hasMetadata).toBe(true);
  });
});
