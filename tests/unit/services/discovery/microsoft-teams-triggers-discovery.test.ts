/**
 * @jest-environment node
 *
 * Slice 4.TEAMS-META-3 — Microsoft Teams trigger discovery coverage.
 *
 * Pins the single `new_channel_message` per-(team,channel) webhook trigger:
 * key, webhook activation, the team→channel picker cascade, and the
 * sensitive bodyContent / bodyPreview payload fields. The activation-registry
 * side is pinned by tests/structure/trigger-meta-activation-invariant.test.ts.
 */
import {
  getTriggerMeta,
  listTriggerMetasForProvider,
} from "@/services/discovery/_registry";

describe("microsoft-teams trigger discovery — new_channel_message", () => {
  it("registers exactly 1 trigger meta (new_channel_message)", () => {
    const metas = listTriggerMetasForProvider("microsoft-teams");
    expect(metas.map((m) => m.key)).toEqual([
      "microsoft-teams:new_channel_message",
    ]);
  });

  it("is a webhook trigger requiring an integration, category messaging", () => {
    const t = getTriggerMeta("microsoft-teams:new_channel_message")!;
    expect(t.provider).toBe("microsoft-teams");
    expect(t.key).toBe("microsoft-teams:new_channel_message");
    expect(t.activation).toBe("webhook");
    expect(t.requiresIntegration).toBe(true);
    expect(t.category).toBe("messaging");
  });

  it("teamId → microsoft-teams:teams (required); channelId → microsoft-teams:channels (dep teamId, required)", () => {
    const t = getTriggerMeta("microsoft-teams:new_channel_message")!;
    const team = t.fields.find((f) => f.name === "teamId")!;
    const channel = t.fields.find((f) => f.name === "channelId")!;
    expect(team.optionsSource).toBe("microsoft-teams:teams");
    expect(team.dependsOn).toBeUndefined();
    expect(team.required).toBe(true);
    expect(channel.optionsSource).toBe("microsoft-teams:channels");
    expect(channel.dependsOn).toBe("teamId");
    expect(channel.required).toBe(true);
  });

  it("bodyContent + bodyPreview payload fields are sensitive; ids/names/dates are not", () => {
    const t = getTriggerMeta("microsoft-teams:new_channel_message")!;
    const byName = new Map(t.payloadShape.map((p) => [p.name, p]));
    for (const name of ["bodyContent", "bodyPreview"]) {
      expect(byName.get(name)!.sensitive).toBe(true);
    }
    for (const name of [
      "messageId",
      "teamId",
      "channelId",
      "fromUserId",
      "fromUserDisplayName",
      "webUrl",
      "createdDateTime",
      "changeType",
    ]) {
      expect(byName.get(name)!.sensitive).not.toBe(true);
    }
  });

  it("payload includes the documented shape", () => {
    const t = getTriggerMeta("microsoft-teams:new_channel_message")!;
    const names = t.payloadShape.map((p) => p.name);
    for (const expected of [
      "messageId",
      "teamId",
      "channelId",
      "subject",
      "bodyContent",
      "bodyContentType",
      "bodyPreview",
      "importance",
      "messageType",
      "replyToId",
      "fromUserId",
      "fromUserDisplayName",
      "createdDateTime",
      "lastModifiedDateTime",
      "webUrl",
      "changeType",
    ]) {
      expect(names).toContain(expected);
    }
  });

  it("no trigger field references the rejected/deferred Teams resolvers", () => {
    const t = getTriggerMeta("microsoft-teams:new_channel_message")!;
    for (const f of t.fields) {
      expect(f.optionsSource).not.toBe("microsoft-teams:members");
      expect(f.optionsSource).not.toBe("microsoft-teams:chats");
      expect(f.optionsSource).not.toBe("microsoft-teams:messages");
    }
  });

  it("no secret-shaped payload names", () => {
    const BANNED = ["token", "accessToken", "refreshToken", "apiKey", "secret", "webhookSecret", "password"];
    const t = getTriggerMeta("microsoft-teams:new_channel_message")!;
    const names = t.payloadShape.map((p) => p.name);
    for (const b of BANNED) expect(names).not.toContain(b);
  });
});
