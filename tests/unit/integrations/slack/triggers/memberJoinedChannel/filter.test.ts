/**
 * @jest-environment node
 *
 * Tests for integrations/slack/triggers/memberJoinedChannel/filter
 * (Slack 2.2 Commit 3).
 */
import { memberJoinedChannelFilter } from "@/integrations/slack/triggers/memberJoinedChannel/filter";
import type { TriggerEvent } from "@/contracts/triggerEvent";

function makeEvent(payload: Record<string, unknown>): TriggerEvent {
  return {
    provider: "slack",
    eventType: "slack.member_joined_channel",
    eventId: "Ev1",
    occurredAt: "2026-05-11T00:00:00Z",
    accountId: "T0001",
    payload,
  };
}

describe("memberJoinedChannelFilter — identity + registration shape", () => {
  it("declares provider=slack and eventType=slack.member_joined_channel", () => {
    expect(memberJoinedChannelFilter.provider).toBe("slack");
    expect(memberJoinedChannelFilter.eventType).toBe("slack.member_joined_channel");
  });
});

describe("memberJoinedChannelFilter — match-all when channelId is absent", () => {
  it("matches every event when config is empty", () => {
    const config = memberJoinedChannelFilter.parseConfig({});
    const result = memberJoinedChannelFilter.evaluate(
      makeEvent({ user: "U1", channel: "C-ANY", team: "T0001" }),
      config,
    );
    expect(result).toEqual({ kind: "match" });
  });
});

describe("memberJoinedChannelFilter — channelId filter", () => {
  it("matches when a public C-prefixed channel id equals the configured channelId", () => {
    const config = memberJoinedChannelFilter.parseConfig({ channelId: "C100" });
    const result = memberJoinedChannelFilter.evaluate(
      makeEvent({ user: "U1", channel: "C100", team: "T0001" }),
      config,
    );
    expect(result).toEqual({ kind: "match" });
  });

  it("matches when a legacy G-prefixed private channel id equals the configured channelId", () => {
    const config = memberJoinedChannelFilter.parseConfig({ channelId: "GLEGACY1" });
    const result = memberJoinedChannelFilter.evaluate(
      makeEvent({ user: "U1", channel: "GLEGACY1", team: "T0001" }),
      config,
    );
    expect(result).toEqual({ kind: "match" });
  });

  it("does NOT match when the event channel differs from the configured channelId", () => {
    const config = memberJoinedChannelFilter.parseConfig({ channelId: "C100" });
    const result = memberJoinedChannelFilter.evaluate(
      makeEvent({ user: "U1", channel: "C200", team: "T0001" }),
      config,
    );
    expect(result.kind).toBe("no-match");
    if (result.kind === "no-match") {
      expect(result.reason).toMatch(/does not match/);
    }
  });
});

describe("memberJoinedChannelFilter — parseConfig validates strictly (fail-closed)", () => {
  it("throws on a D-prefixed (DM) channelId", () => {
    expect(() =>
      memberJoinedChannelFilter.parseConfig({ channelId: "DABC123" }),
    ).toThrow();
  });

  it("throws on a lowercase channelId", () => {
    expect(() =>
      memberJoinedChannelFilter.parseConfig({ channelId: "cabc123" }),
    ).toThrow();
  });

  it("throws on an empty channelId", () => {
    expect(() =>
      memberJoinedChannelFilter.parseConfig({ channelId: "" }),
    ).toThrow();
  });

  it("accepts an absent channelId (match-all)", () => {
    expect(() => memberJoinedChannelFilter.parseConfig({})).not.toThrow();
  });
});
