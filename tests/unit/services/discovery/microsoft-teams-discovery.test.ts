/**
 * @jest-environment node
 *
 * Slice 4.TEAMS-META-3 — Microsoft Teams discovery-registry coverage.
 *
 * Pins the full 8-action Teams surface (TEAMS-READ-2 added the read-only
 * `list_teams` / `list_channels` / `list_channel_messages`): keys in
 * displayOrder, key===provider:type, category 'messaging', camelCase fields,
 * resolver wiring (teams root + channels dependsOn teamId), chatId/messageId
 * staying typeable text (no deferred-resolver references), get_team_members.top
 * bounds, all-medium-or-low / none-destructive risk, sensitive bodyContent
 * + channel/member email outputs, and the rejected/deferred Teams resolvers
 * staying absent. Trigger assertions live in
 * microsoft-teams-triggers-discovery.test.ts.
 */
import {
  getActionMeta,
  listActionMetasForProvider,
  listProvidersWithMetadata,
} from "@/services/discovery/_registry";

const EXPECTED_KEYS_IN_ORDER = [
  "microsoft-teams:send_channel_message",
  "microsoft-teams:reply_to_channel_message",
  "microsoft-teams:send_chat_message",
  "microsoft-teams:get_channel_details",
  "microsoft-teams:get_team_members",
  "microsoft-teams:list_teams",
  "microsoft-teams:list_channels",
  "microsoft-teams:list_channel_messages",
];

/** Actions that carry the team→channel cascade (channelId dependsOn teamId). */
const TEAM_CHANNEL = [
  "microsoft-teams:send_channel_message",
  "microsoft-teams:reply_to_channel_message",
  "microsoft-teams:get_channel_details",
  "microsoft-teams:list_channel_messages",
];

/** Actions carrying a teamId picker (teams root, no dep). */
const TEAM_PICKER = [
  "microsoft-teams:send_channel_message",
  "microsoft-teams:reply_to_channel_message",
  "microsoft-teams:get_channel_details",
  "microsoft-teams:get_team_members",
  "microsoft-teams:list_channels",
  "microsoft-teams:list_channel_messages",
];

describe("microsoft-teams discovery — surface", () => {
  it("registers exactly 8 action metas in displayOrder", () => {
    const metas = listActionMetasForProvider("microsoft-teams");
    expect(metas).toHaveLength(8);
    expect(metas.map((m) => m.key)).toEqual(EXPECTED_KEYS_IN_ORDER);
  });

  it("every key equals provider:type and provider is 'microsoft-teams'", () => {
    for (const m of listActionMetasForProvider("microsoft-teams")) {
      expect(m.provider).toBe("microsoft-teams");
      expect(m.key).toBe(`microsoft-teams:${m.type}`);
    }
  });

  it("every action is category 'messaging' + requiresIntegration; no FileRef", () => {
    for (const m of listActionMetasForProvider("microsoft-teams")) {
      expect(m.category).toBe("messaging");
      expect(m.requiresIntegration).toBe(true);
      expect(m.producesFileRef).toBe(false);
      expect(m.consumesFileRef).toBe(false);
    }
  });

  it("displayOrder is strictly ascending (10..80)", () => {
    const orders = listActionMetasForProvider("microsoft-teams").map((m) => m.displayOrder);
    expect(orders[0]).toBe(10);
    expect(orders[orders.length - 1]).toBe(80);
    for (let i = 1; i < orders.length; i++) {
      expect(orders[i]!).toBeGreaterThan(orders[i - 1]!);
    }
  });

  it("microsoft-teams is reported by listProvidersWithMetadata", () => {
    expect(listProvidersWithMetadata()).toContain("microsoft-teams");
  });
});

describe("microsoft-teams discovery — field hygiene + resolver wiring", () => {
  it("all field names are camelCase (mirror the runtime Zod schemas)", () => {
    for (const m of listActionMetasForProvider("microsoft-teams")) {
      for (const f of m.fields) {
        expect(f.name).toMatch(/^[a-z][a-zA-Z0-9]*$/);
      }
    }
  });

  it("teamId fields use microsoft-teams:teams (no dep)", () => {
    for (const key of TEAM_PICKER) {
      const team = getActionMeta(key)!.fields.find((f) => f.name === "teamId")!;
      expect(team.optionsSource).toBe("microsoft-teams:teams");
      expect(team.dependsOn).toBeUndefined();
      expect(team.required).toBe(true);
    }
  });

  it("channelId fields use microsoft-teams:channels dependsOn teamId", () => {
    for (const key of TEAM_CHANNEL) {
      const channel = getActionMeta(key)!.fields.find((f) => f.name === "channelId")!;
      expect(channel.optionsSource).toBe("microsoft-teams:channels");
      expect(channel.dependsOn).toBe("teamId");
      expect(channel.required).toBe(true);
    }
  });

  it("send_chat_message.chatId stays typeable text — no chats resolver", () => {
    const chatId = getActionMeta("microsoft-teams:send_chat_message")!.fields.find(
      (f) => f.name === "chatId",
    )!;
    expect(chatId.type).toBe("text");
    expect(chatId.optionsSource).toBeUndefined();
  });

  it("reply_to_channel_message.messageId stays typeable text — no messages resolver", () => {
    const messageId = getActionMeta("microsoft-teams:reply_to_channel_message")!.fields.find(
      (f) => f.name === "messageId",
    )!;
    expect(messageId.type).toBe("text");
    expect(messageId.optionsSource).toBeUndefined();
  });

  it("get_team_members.top is a number with bounds matching the schema (1..999)", () => {
    const top = getActionMeta("microsoft-teams:get_team_members")!.fields.find(
      (f) => f.name === "top",
    )!;
    expect(top.type).toBe("number");
    expect(top.numeric).toEqual({ min: 1, max: 999, integer: true });
  });

  it("contentType is a static select (html/text) on the message actions", () => {
    for (const key of [
      "microsoft-teams:send_channel_message",
      "microsoft-teams:reply_to_channel_message",
      "microsoft-teams:send_chat_message",
    ]) {
      const ct = getActionMeta(key)!.fields.find((f) => f.name === "contentType")!;
      expect(ct.type).toBe("select");
      expect(ct.options!.map((o) => o.value)).toEqual(["html", "text"]);
      const content = getActionMeta(key)!.fields.find((f) => f.name === "content")!;
      expect(content.type).toBe("textarea");
    }
  });

  it("no field anywhere references the rejected/deferred Teams resolvers", () => {
    for (const m of listActionMetasForProvider("microsoft-teams")) {
      for (const f of m.fields) {
        expect(f.optionsSource).not.toBe("microsoft-teams:members");
        expect(f.optionsSource).not.toBe("microsoft-teams:chats");
        expect(f.optionsSource).not.toBe("microsoft-teams:messages");
      }
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
    for (const m of listActionMetasForProvider("microsoft-teams")) {
      const names = m.outputs.map((o) => o.name);
      for (const banned of BANNED) expect(names).not.toContain(banned);
    }
  });
});

describe("microsoft-teams discovery — risk (medium writes / low reads, none destructive)", () => {
  it("message writes are medium; reads are low", () => {
    for (const key of [
      "microsoft-teams:send_channel_message",
      "microsoft-teams:reply_to_channel_message",
      "microsoft-teams:send_chat_message",
    ]) {
      expect(getActionMeta(key)!.riskLevel).toBe("medium");
    }
    for (const key of [
      "microsoft-teams:get_channel_details",
      "microsoft-teams:get_team_members",
      "microsoft-teams:list_teams",
      "microsoft-teams:list_channels",
      "microsoft-teams:list_channel_messages",
    ]) {
      expect(getActionMeta(key)!.riskLevel).toBe("low");
    }
  });

  it("no action is destructive or requires confirmation", () => {
    for (const m of listActionMetasForProvider("microsoft-teams")) {
      expect(m.isDestructive).toBe(false);
      expect(m.requiresConfirmation).toBe(false);
    }
  });
});

describe("microsoft-teams discovery — sensitive outputs", () => {
  it("bodyContent is sensitive on the 3 message actions", () => {
    for (const key of [
      "microsoft-teams:send_channel_message",
      "microsoft-teams:reply_to_channel_message",
      "microsoft-teams:send_chat_message",
    ]) {
      const o = getActionMeta(key)!.outputs.find((x) => x.name === "bodyContent")!;
      expect(o.sensitive).toBe(true);
    }
  });

  it("channel email (get_channel_details) + nested member email (get_team_members) are sensitive", () => {
    expect(
      getActionMeta("microsoft-teams:get_channel_details")!.outputs.find(
        (o) => o.name === "email",
      )!.sensitive,
    ).toBe(true);
    const members = getActionMeta("microsoft-teams:get_team_members")!.outputs.find(
      (o) => o.name === "members",
    )!;
    expect(members.fields!.find((f) => f.name === "email")!.sensitive).toBe(true);
    expect(members.fields!.find((f) => f.name === "memberId")!.sensitive).not.toBe(true);
  });

  it("ids / names / webUrl / dates are NOT marked sensitive", () => {
    const NON_SENSITIVE = new Set([
      "messageId",
      "teamId",
      "channelId",
      "chatId",
      "parentMessageId",
      "displayName",
      "webUrl",
      "subject",
      "fromUserId",
      "fromUserDisplayName",
      "createdDateTime",
      "lastModifiedDateTime",
      "replyToId",
      "bodyContentType",
      "membershipType",
      "description",
      "count",
      "hasMore",
      "nextLink",
    ]);
    for (const m of listActionMetasForProvider("microsoft-teams")) {
      for (const o of m.outputs) {
        if (NON_SENSITIVE.has(o.name)) expect(o.sensitive).not.toBe(true);
      }
    }
  });
});
