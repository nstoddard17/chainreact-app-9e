/**
 * @jest-environment node
 *
 * Tests for integrations/slack/triggers/newMessagePrivateChannel/filter
 * (Slack 2.2 Commit 2).
 */
import { newMessagePrivateChannelFilter } from "@/integrations/slack/triggers/newMessagePrivateChannel/filter";
import type { TriggerEvent } from "@/contracts/triggerEvent";

function makeEvent(payload: Record<string, unknown>): TriggerEvent {
  return {
    provider: "slack",
    eventType: "slack.message.group",
    eventId: "Ev1",
    occurredAt: "2026-05-11T00:00:00Z",
    accountId: "T0001",
    payload,
  };
}

describe("newMessagePrivateChannelFilter — identity + registration shape", () => {
  it("declares provider=slack and eventType=slack.message.group", () => {
    expect(newMessagePrivateChannelFilter.provider).toBe("slack");
    expect(newMessagePrivateChannelFilter.eventType).toBe("slack.message.group");
  });
});

describe("newMessagePrivateChannelFilter — match-all when channelId is absent", () => {
  it("matches every event when config is empty", () => {
    const config = newMessagePrivateChannelFilter.parseConfig({});
    const result = newMessagePrivateChannelFilter.evaluate(
      makeEvent({ channel: "C-ANY", channel_type: "group", text: "hi" }),
      config,
    );
    expect(result).toEqual({ kind: "match" });
  });
});

describe("newMessagePrivateChannelFilter — channelId filter", () => {
  it("matches when a modern C-prefixed private channel id equals the configured channelId", () => {
    const config = newMessagePrivateChannelFilter.parseConfig({
      channelId: "CPRIV001",
    });
    const result = newMessagePrivateChannelFilter.evaluate(
      makeEvent({ channel: "CPRIV001", channel_type: "group", text: "hi" }),
      config,
    );
    expect(result).toEqual({ kind: "match" });
  });

  it("matches when a legacy G-prefixed private channel id equals the configured channelId", () => {
    const config = newMessagePrivateChannelFilter.parseConfig({
      channelId: "GLEGACY1",
    });
    const result = newMessagePrivateChannelFilter.evaluate(
      makeEvent({ channel: "GLEGACY1", channel_type: "group", text: "hi" }),
      config,
    );
    expect(result).toEqual({ kind: "match" });
  });

  it("does NOT match when the event channel differs from the configured channelId", () => {
    const config = newMessagePrivateChannelFilter.parseConfig({
      channelId: "CPRIV001",
    });
    const result = newMessagePrivateChannelFilter.evaluate(
      makeEvent({ channel: "CPRIV999", channel_type: "group", text: "hi" }),
      config,
    );
    expect(result.kind).toBe("no-match");
    if (result.kind === "no-match") {
      expect(result.reason).toMatch(/does not match/);
    }
  });
});

describe("newMessagePrivateChannelFilter — parseConfig validates strictly (fail-closed)", () => {
  it("throws on a D-prefixed (DM) channelId", () => {
    expect(() =>
      newMessagePrivateChannelFilter.parseConfig({ channelId: "DABC123" }),
    ).toThrow();
  });

  it("throws on a lowercase channelId", () => {
    expect(() =>
      newMessagePrivateChannelFilter.parseConfig({ channelId: "cpriv001" }),
    ).toThrow();
  });

  it("throws on an empty channelId", () => {
    expect(() =>
      newMessagePrivateChannelFilter.parseConfig({ channelId: "" }),
    ).toThrow();
  });

  it("accepts an absent channelId (match-all)", () => {
    expect(() => newMessagePrivateChannelFilter.parseConfig({})).not.toThrow();
  });
});
