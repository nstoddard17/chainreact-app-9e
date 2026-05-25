/**
 * @jest-environment node
 *
 * Tests for integrations/slack/triggers/newMessageChannel/filter.
 */
import { newMessageChannelFilter } from "@/integrations/slack/triggers/newMessageChannel/filter";
import type { TriggerEvent } from "@/contracts/triggerEvent";

function makeEvent(payload: Record<string, unknown>): TriggerEvent {
  return {
    provider: "slack",
    eventType: "slack.message.channel",
    eventId: "Ev1",
    occurredAt: "2026-05-07T00:00:00Z",
    accountId: "T0001",
    payload,
  };
}

describe("newMessageChannelFilter — identity + registration shape", () => {
  it("declares provider=slack and eventType=slack.message.channel", () => {
    expect(newMessageChannelFilter.provider).toBe("slack");
    expect(newMessageChannelFilter.eventType).toBe("slack.message.channel");
  });
});

describe("newMessageChannelFilter — match-all when channelId is absent", () => {
  it("matches every event when config is empty", () => {
    const config = newMessageChannelFilter.parseConfig({});
    const result = newMessageChannelFilter.evaluate(
      makeEvent({ channel: "C-ANY", text: "hi" }),
      config,
    );
    expect(result).toEqual({ kind: "match" });
  });
});

describe("newMessageChannelFilter — channelId filter", () => {
  it("matches when the event channel equals the configured channelId", () => {
    const config = newMessageChannelFilter.parseConfig({ channelId: "C12345" });
    const result = newMessageChannelFilter.evaluate(
      makeEvent({ channel: "C12345", text: "hi" }),
      config,
    );
    expect(result).toEqual({ kind: "match" });
  });

  it("does NOT match when the event channel differs from the configured channelId", () => {
    const config = newMessageChannelFilter.parseConfig({ channelId: "C12345" });
    const result = newMessageChannelFilter.evaluate(
      makeEvent({ channel: "C99999", text: "hi" }),
      config,
    );
    expect(result.kind).toBe("no-match");
    if (result.kind === "no-match") {
      expect(result.reason).toMatch(/does not match/);
    }
  });
});

describe("newMessageChannelFilter — parseConfig validates strictly (fail-closed)", () => {
  it("throws on non-C-prefixed channelId", () => {
    expect(() =>
      newMessageChannelFilter.parseConfig({ channelId: "G123" }),
    ).toThrow();
  });

  it("throws on empty channelId", () => {
    expect(() =>
      newMessageChannelFilter.parseConfig({ channelId: "" }),
    ).toThrow();
  });
});
