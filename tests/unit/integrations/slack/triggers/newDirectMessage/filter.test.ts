/**
 * @jest-environment node
 *
 * Tests for integrations/slack/triggers/newDirectMessage/filter.
 */
import { newDirectMessageFilter } from "@/integrations/slack/triggers/newDirectMessage/filter";
import type { TriggerEvent } from "@/contracts/triggerEvent";

function makeEvent(payload: Record<string, unknown>): TriggerEvent {
  return {
    provider: "slack",
    eventType: "slack.message.im",
    eventId: "Ev1",
    occurredAt: "2026-05-07T00:00:00Z",
    accountId: "T0001",
    payload,
  };
}

describe("newDirectMessageFilter — identity", () => {
  it("declares provider=slack and eventType=slack.message.im", () => {
    expect(newDirectMessageFilter.provider).toBe("slack");
    expect(newDirectMessageFilter.eventType).toBe("slack.message.im");
  });
});

describe("newDirectMessageFilter — withUserId filter", () => {
  it("matches every event when config is empty", () => {
    const config = newDirectMessageFilter.parseConfig({});
    const result = newDirectMessageFilter.evaluate(
      makeEvent({ channel: "D1", user: "U-ANY" }),
      config,
    );
    expect(result).toEqual({ kind: "match" });
  });

  it("matches when the sender equals the configured withUserId", () => {
    const config = newDirectMessageFilter.parseConfig({ withUserId: "U12345" });
    const result = newDirectMessageFilter.evaluate(
      makeEvent({ channel: "D1", user: "U12345", text: "hi" }),
      config,
    );
    expect(result).toEqual({ kind: "match" });
  });

  it("does NOT match when the sender differs from the configured withUserId", () => {
    const config = newDirectMessageFilter.parseConfig({ withUserId: "U12345" });
    const result = newDirectMessageFilter.evaluate(
      makeEvent({ channel: "D1", user: "U99999", text: "hi" }),
      config,
    );
    expect(result.kind).toBe("no-match");
    if (result.kind === "no-match") {
      expect(result.reason).toMatch(/sender U99999 does not match/);
    }
  });
});

describe("newDirectMessageFilter — parseConfig validates strictly (fail-closed)", () => {
  it("throws on non-U-prefixed withUserId", () => {
    expect(() =>
      newDirectMessageFilter.parseConfig({ withUserId: "C123" }),
    ).toThrow();
  });

  it("throws on empty withUserId", () => {
    expect(() =>
      newDirectMessageFilter.parseConfig({ withUserId: "" }),
    ).toThrow();
  });
});
