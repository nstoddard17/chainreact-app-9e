/**
 * @jest-environment node
 *
 * Tests for integrations/slack/triggers/reactionAdded/filter.
 */
import { reactionAddedFilter } from "@/integrations/slack/triggers/reactionAdded/filter";
import type { TriggerEvent } from "@/contracts/triggerEvent";

function makeEvent(payload: Record<string, unknown>): TriggerEvent {
  return {
    provider: "slack",
    eventType: "slack.reaction_added",
    eventId: "Ev1",
    occurredAt: "2026-05-07T00:00:00Z",
    providerAccountId: "T0001",
    payload,
  };
}

const basePayload = {
  type: "reaction_added",
  user: "U-REACTOR",
  reaction: "thumbsup",
  item: { type: "message", channel: "C1", ts: "1.0" },
  item_user: "U-AUTHOR",
};

describe("reactionAddedFilter — identity", () => {
  it("declares provider=slack and eventType=slack.reaction_added", () => {
    expect(reactionAddedFilter.provider).toBe("slack");
    expect(reactionAddedFilter.eventType).toBe("slack.reaction_added");
  });
});

describe("reactionAddedFilter — match-all when no filters set", () => {
  it("matches any reaction in any channel when config is empty", () => {
    const config = reactionAddedFilter.parseConfig({});
    expect(reactionAddedFilter.evaluate(makeEvent(basePayload), config)).toEqual({
      kind: "match",
    });
  });
});

describe("reactionAddedFilter — reactionEmoji filter", () => {
  it("matches when reaction equals configured emoji (bare form on both sides)", () => {
    const config = reactionAddedFilter.parseConfig({ reactionEmoji: "thumbsup" });
    expect(reactionAddedFilter.evaluate(makeEvent(basePayload), config)).toEqual({
      kind: "match",
    });
  });

  it("matches when config uses :thumbsup: but Slack payload uses bare 'thumbsup' (normalize both)", () => {
    const config = reactionAddedFilter.parseConfig({ reactionEmoji: ":thumbsup:" });
    expect(reactionAddedFilter.evaluate(makeEvent(basePayload), config)).toEqual({
      kind: "match",
    });
  });

  it("does NOT match when Slack reaction differs from configured emoji", () => {
    const config = reactionAddedFilter.parseConfig({ reactionEmoji: "tada" });
    const result = reactionAddedFilter.evaluate(makeEvent(basePayload), config);
    expect(result.kind).toBe("no-match");
    if (result.kind === "no-match") {
      expect(result.reason).toMatch(/reaction thumbsup does not match filter tada/);
    }
  });
});

describe("reactionAddedFilter — channelId filter (reads item.channel)", () => {
  it("matches when item.channel equals configured channelId", () => {
    const config = reactionAddedFilter.parseConfig({ channelId: "C1" });
    expect(reactionAddedFilter.evaluate(makeEvent(basePayload), config)).toEqual({
      kind: "match",
    });
  });

  it("does NOT match when item.channel differs from configured channelId", () => {
    const config = reactionAddedFilter.parseConfig({ channelId: "C99" });
    const result = reactionAddedFilter.evaluate(makeEvent(basePayload), config);
    expect(result.kind).toBe("no-match");
    if (result.kind === "no-match") {
      expect(result.reason).toMatch(/item channel C1 does not match filter C99/);
    }
  });

  it("does NOT match when payload has no item.channel field", () => {
    const config = reactionAddedFilter.parseConfig({ channelId: "C1" });
    const result = reactionAddedFilter.evaluate(
      makeEvent({ ...basePayload, item: undefined }),
      config,
    );
    expect(result.kind).toBe("no-match");
  });
});

describe("reactionAddedFilter — AND combination of filters", () => {
  it("matches when both reactionEmoji and channelId match", () => {
    const config = reactionAddedFilter.parseConfig({
      reactionEmoji: "thumbsup",
      channelId: "C1",
    });
    expect(reactionAddedFilter.evaluate(makeEvent(basePayload), config)).toEqual({
      kind: "match",
    });
  });

  it("does NOT match when reaction matches but channel doesn't", () => {
    const config = reactionAddedFilter.parseConfig({
      reactionEmoji: "thumbsup",
      channelId: "C99",
    });
    const result = reactionAddedFilter.evaluate(makeEvent(basePayload), config);
    expect(result.kind).toBe("no-match");
  });

  it("does NOT match when channel matches but reaction doesn't", () => {
    const config = reactionAddedFilter.parseConfig({
      reactionEmoji: "tada",
      channelId: "C1",
    });
    const result = reactionAddedFilter.evaluate(makeEvent(basePayload), config);
    expect(result.kind).toBe("no-match");
  });
});

describe("reactionAddedFilter — parseConfig validates strictly", () => {
  it("throws on non-C-prefixed channelId", () => {
    expect(() =>
      reactionAddedFilter.parseConfig({ channelId: "G123" }),
    ).toThrow();
  });

  it("throws on empty reactionEmoji", () => {
    expect(() =>
      reactionAddedFilter.parseConfig({ reactionEmoji: "" }),
    ).toThrow();
  });
});
