/**
 * @jest-environment node
 *
 * Slice 4.TEAMS-META-3 — Microsoft Teams provider-route coverage.
 *
 * GET /api/providers/microsoft-teams/actions returns the 5 actions in
 * display order with the full wire shape (optionsSource / dependsOn / risk
 * / sensitive outputs); GET .../triggers returns the new_channel_message
 * webhook trigger; the providers index marks microsoft-teams
 * hasMetadata=true. No provider API calls (pure registry read).
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
  const res = await getActions(new Request("http://x/microsoft-teams/actions"), {
    params: Promise.resolve({ id: "microsoft-teams" }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { provider: string; actions: WireAction[] };
  expect(body.provider).toBe("microsoft-teams");
  return body.actions;
}

describe("GET /api/providers/microsoft-teams/actions", () => {
  it("returns the full 5-action surface in display order", async () => {
    const actions = await fetchActions();
    expect(actions.map((a) => a.key)).toEqual([
      "microsoft-teams:send_channel_message",
      "microsoft-teams:reply_to_channel_message",
      "microsoft-teams:send_chat_message",
      "microsoft-teams:get_channel_details",
      "microsoft-teams:get_team_members",
    ]);
  });

  it("every action requiresIntegration + category messaging", async () => {
    for (const a of await fetchActions()) {
      expect(a.requiresIntegration).toBe(true);
      expect(a.category).toBe("messaging");
    }
  });

  it("teamId → teams (no dep); channelId → channels (dep teamId)", async () => {
    const byKey = new Map((await fetchActions()).map((a) => [a.key, a]));
    const send = byKey.get("microsoft-teams:send_channel_message")!;
    const team = send.fields.find((f) => f.name === "teamId")!;
    const channel = send.fields.find((f) => f.name === "channelId")!;
    expect(team.optionsSource).toBe("microsoft-teams:teams");
    expect(team.dependsOn).toBeUndefined();
    expect(channel.optionsSource).toBe("microsoft-teams:channels");
    expect(channel.dependsOn).toBe("teamId");
  });

  it("chatId + messageId serialize as typeable text (no deferred resolvers)", async () => {
    const byKey = new Map((await fetchActions()).map((a) => [a.key, a]));
    const chatId = byKey.get("microsoft-teams:send_chat_message")!.fields.find(
      (f) => f.name === "chatId",
    )!;
    expect(chatId.type).toBe("text");
    expect(chatId.optionsSource).toBeUndefined();
    const messageId = byKey.get("microsoft-teams:reply_to_channel_message")!.fields.find(
      (f) => f.name === "messageId",
    )!;
    expect(messageId.type).toBe("text");
    expect(messageId.optionsSource).toBeUndefined();
  });

  it("every action is non-destructive; writes medium, reads low", async () => {
    const byKey = new Map((await fetchActions()).map((a) => [a.key, a]));
    for (const a of byKey.values()) {
      expect(a.isDestructive).toBe(false);
      expect(a.requiresConfirmation).toBe(false);
    }
    for (const key of [
      "microsoft-teams:send_channel_message",
      "microsoft-teams:reply_to_channel_message",
      "microsoft-teams:send_chat_message",
    ]) {
      expect(byKey.get(key)!.riskLevel).toBe("medium");
    }
    for (const key of [
      "microsoft-teams:get_channel_details",
      "microsoft-teams:get_team_members",
    ]) {
      expect(byKey.get(key)!.riskLevel).toBe("low");
    }
  });

  it("bodyContent + channel/member email outputs serialize sensitive", async () => {
    const byKey = new Map((await fetchActions()).map((a) => [a.key, a]));
    expect(
      byKey.get("microsoft-teams:send_channel_message")!.outputs.find(
        (o) => o.name === "bodyContent",
      )!.sensitive,
    ).toBe(true);
    expect(
      byKey.get("microsoft-teams:get_channel_details")!.outputs.find(
        (o) => o.name === "email",
      )!.sensitive,
    ).toBe(true);
    const members = byKey.get("microsoft-teams:get_team_members")!.outputs.find(
      (o) => o.name === "members",
    )!;
    expect(members.fields!.find((f) => f.name === "email")!.sensitive).toBe(true);
  });

  it("no action field references a rejected/deferred Teams resolver", async () => {
    for (const a of await fetchActions()) {
      for (const f of a.fields) {
        expect(f.optionsSource).not.toBe("microsoft-teams:members");
        expect(f.optionsSource).not.toBe("microsoft-teams:chats");
        expect(f.optionsSource).not.toBe("microsoft-teams:messages");
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
  const res = await getTriggers(new Request("http://x/microsoft-teams/triggers"), {
    params: Promise.resolve({ id: "microsoft-teams" }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { provider: string; triggers: WireTrigger[] };
  expect(body.provider).toBe("microsoft-teams");
  return body.triggers;
}

describe("GET /api/providers/microsoft-teams/triggers", () => {
  it("returns the 1 new_channel_message webhook trigger with team+channel pickers", async () => {
    const triggers = await fetchTriggers();
    expect(triggers.map((t) => t.key)).toEqual([
      "microsoft-teams:new_channel_message",
    ]);
    const t = triggers[0]!;
    expect(t.activation).toBe("webhook");
    expect(t.requiresIntegration).toBe(true);
    expect(t.category).toBe("messaging");
    const team = t.fields.find((f) => f.name === "teamId")!;
    const channel = t.fields.find((f) => f.name === "channelId")!;
    expect(team.optionsSource).toBe("microsoft-teams:teams");
    expect(channel.optionsSource).toBe("microsoft-teams:channels");
    expect(channel.dependsOn).toBe("teamId");
  });

  it("bodyContent + bodyPreview payload fields serialize sensitive", async () => {
    const t = (await fetchTriggers())[0]!;
    const byName = new Map(t.payloadShape.map((p) => [p.name, p]));
    expect(byName.get("bodyContent")!.sensitive).toBe(true);
    expect(byName.get("bodyPreview")!.sensitive).toBe(true);
    expect(byName.get("messageId")!.sensitive).not.toBe(true);
  });
});

describe("GET /api/providers — microsoft-teams hasMetadata", () => {
  it("marks microsoft-teams hasMetadata=true now that TEAMS-META-3 shipped its metas", async () => {
    const res = await getProviders();
    const body = (await res.json()) as {
      providers: Array<{ id: string; hasMetadata: boolean }>;
    };
    const teams = body.providers.find((p) => p.id === "microsoft-teams");
    expect(teams).toBeDefined();
    expect(teams?.hasMetadata).toBe(true);
  });
});
