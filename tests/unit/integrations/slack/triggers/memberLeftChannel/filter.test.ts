/**
 * @jest-environment node
 *
 * Tests for integrations/slack/triggers/memberLeftChannel/filter
 * (Slack 2.2 Commit 3).
 */
import { memberLeftChannelFilter } from "@/integrations/slack/triggers/memberLeftChannel/filter";
import type { TriggerEvent } from "@/contracts/triggerEvent";

function makeEvent(payload: Record<string, unknown>): TriggerEvent {
  return {
    provider: "slack",
    eventType: "slack.member_left_channel",
    eventId: "Ev1",
    occurredAt: "2026-05-11T00:00:00Z",
    accountId: "T0001",
    payload,
  };
}

describe("memberLeftChannelFilter — identity + registration shape", () => {
  it("declares provider=slack and eventType=slack.member_left_channel", () => {
    expect(memberLeftChannelFilter.provider).toBe("slack");
    expect(memberLeftChannelFilter.eventType).toBe("slack.member_left_channel");
  });
});

describe("memberLeftChannelFilter — match-all when channelId is absent", () => {
  it("matches every event when config is empty", () => {
    const config = memberLeftChannelFilter.parseConfig({});
    const result = memberLeftChannelFilter.evaluate(
      makeEvent({ user: "U1", channel: "C-ANY", team: "T0001" }),
      config,
    );
    expect(result).toEqual({ kind: "match" });
  });
});

describe("memberLeftChannelFilter — channelId filter", () => {
  it("matches when a public C-prefixed channel id equals the configured channelId", () => {
    const config = memberLeftChannelFilter.parseConfig({ channelId: "C100" });
    const result = memberLeftChannelFilter.evaluate(
      makeEvent({ user: "U1", channel: "C100", team: "T0001" }),
      config,
    );
    expect(result).toEqual({ kind: "match" });
  });

  it("matches when a legacy G-prefixed private channel id equals the configured channelId", () => {
    const config = memberLeftChannelFilter.parseConfig({ channelId: "GLEGACY1" });
    const result = memberLeftChannelFilter.evaluate(
      makeEvent({ user: "U1", channel: "GLEGACY1", team: "T0001" }),
      config,
    );
    expect(result).toEqual({ kind: "match" });
  });

  it("does NOT match when the event channel differs from the configured channelId", () => {
    const config = memberLeftChannelFilter.parseConfig({ channelId: "C100" });
    const result = memberLeftChannelFilter.evaluate(
      makeEvent({ user: "U1", channel: "C200", team: "T0001" }),
      config,
    );
    expect(result.kind).toBe("no-match");
    if (result.kind === "no-match") {
      expect(result.reason).toMatch(/does not match/);
    }
  });
});

describe("memberLeftChannelFilter — parseConfig validates strictly (fail-closed)", () => {
  it("throws on a D-prefixed (DM) channelId", () => {
    expect(() =>
      memberLeftChannelFilter.parseConfig({ channelId: "DABC123" }),
    ).toThrow();
  });

  it("throws on a lowercase channelId", () => {
    expect(() =>
      memberLeftChannelFilter.parseConfig({ channelId: "cabc123" }),
    ).toThrow();
  });

  it("throws on an empty channelId", () => {
    expect(() =>
      memberLeftChannelFilter.parseConfig({ channelId: "" }),
    ).toThrow();
  });

  it("accepts an absent channelId (match-all)", () => {
    expect(() => memberLeftChannelFilter.parseConfig({})).not.toThrow();
  });
});
