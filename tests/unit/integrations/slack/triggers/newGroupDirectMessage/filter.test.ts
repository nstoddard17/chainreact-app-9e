/**
 * @jest-environment node
 *
 * Tests for integrations/slack/triggers/newGroupDirectMessage/filter.
 */
import { newGroupDirectMessageFilter } from "@/integrations/slack/triggers/newGroupDirectMessage/filter";
import type { TriggerEvent } from "@/contracts/triggerEvent";

function makeEvent(payload: Record<string, unknown>): TriggerEvent {
  return {
    provider: "slack",
    eventType: "slack.message.mpim",
    eventId: "Ev1",
    occurredAt: "2026-05-07T00:00:00Z",
    providerAccountId: "T0001",
    payload,
  };
}

describe("newGroupDirectMessageFilter — identity", () => {
  it("declares provider=slack and eventType=slack.message.mpim", () => {
    expect(newGroupDirectMessageFilter.provider).toBe("slack");
    expect(newGroupDirectMessageFilter.eventType).toBe("slack.message.mpim");
  });
});

describe("newGroupDirectMessageFilter — channelId filter", () => {
  it("matches every event when config is empty", () => {
    const config = newGroupDirectMessageFilter.parseConfig({});
    const result = newGroupDirectMessageFilter.evaluate(
      makeEvent({ channel: "G-ANY", user: "U1" }),
      config,
    );
    expect(result).toEqual({ kind: "match" });
  });

  it("matches when the event channel equals the configured channelId", () => {
    const config = newGroupDirectMessageFilter.parseConfig({ channelId: "G12345" });
    const result = newGroupDirectMessageFilter.evaluate(
      makeEvent({ channel: "G12345", user: "U1" }),
      config,
    );
    expect(result).toEqual({ kind: "match" });
  });

  it("does NOT match when the event channel differs", () => {
    const config = newGroupDirectMessageFilter.parseConfig({ channelId: "G12345" });
    const result = newGroupDirectMessageFilter.evaluate(
      makeEvent({ channel: "G99999", user: "U1" }),
      config,
    );
    expect(result.kind).toBe("no-match");
  });
});

describe("newGroupDirectMessageFilter — parseConfig validates strictly", () => {
  it("throws on non-G-prefixed channelId", () => {
    expect(() =>
      newGroupDirectMessageFilter.parseConfig({ channelId: "C123" }),
    ).toThrow();
  });
});
