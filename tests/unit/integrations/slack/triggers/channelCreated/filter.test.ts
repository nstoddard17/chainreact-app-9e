/**
 * @jest-environment node
 *
 * Tests for integrations/slack/triggers/channelCreated/filter
 * (Slack 2.2 Commit 3).
 */
import { channelCreatedFilter } from "@/integrations/slack/triggers/channelCreated/filter";
import type { TriggerEvent } from "@/contracts/triggerEvent";

function makeEvent(payload: Record<string, unknown>): TriggerEvent {
  return {
    provider: "slack",
    eventType: "slack.channel_created",
    eventId: "Ev1",
    occurredAt: "2026-05-11T00:00:00Z",
    providerAccountId: "T0001",
    payload,
  };
}

describe("channelCreatedFilter — identity + registration shape", () => {
  it("declares provider=slack and eventType=slack.channel_created", () => {
    expect(channelCreatedFilter.provider).toBe("slack");
    expect(channelCreatedFilter.eventType).toBe("slack.channel_created");
  });
});

describe("channelCreatedFilter — match-all (no per-workflow config)", () => {
  it("matches every event when config is empty", () => {
    const config = channelCreatedFilter.parseConfig({});
    const result = channelCreatedFilter.evaluate(
      makeEvent({
        channel: { id: "C100", name: "new-room", is_private: false },
      }),
      config,
    );
    expect(result).toEqual({ kind: "match" });
  });

  it("matches a private-channel creation payload (is_private: true) — workflow downstream guards if needed", () => {
    const config = channelCreatedFilter.parseConfig({});
    const result = channelCreatedFilter.evaluate(
      makeEvent({
        channel: { id: "C200", name: "secret-plan", is_private: true },
      }),
      config,
    );
    expect(result).toEqual({ kind: "match" });
  });

  it("strips unknown keys from config (z.object({}) default behavior)", () => {
    expect(() =>
      channelCreatedFilter.parseConfig({ noSuchField: "x" }),
    ).not.toThrow();
  });
});

describe("channelCreatedFilter — parseConfig validates shape (fail-closed)", () => {
  it("throws when config is a primitive (not an object)", () => {
    expect(() => channelCreatedFilter.parseConfig("nope")).toThrow();
    expect(() => channelCreatedFilter.parseConfig(123)).toThrow();
  });
});
