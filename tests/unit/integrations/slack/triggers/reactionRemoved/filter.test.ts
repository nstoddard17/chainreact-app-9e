/**
 * @jest-environment node
 *
 * Tests for integrations/slack/triggers/reactionRemoved/filter.
 *
 * Same contract as reactionAddedFilter — duplicates a subset of the
 * happy-path / no-match scenarios on the removal event type. The
 * shared filter shape (parseConfig + evaluate semantics) is covered
 * in detail by reactionAdded.filter.test.ts; this file pins the
 * eventType + cross-cutting behavior.
 */
import { reactionRemovedFilter } from "@/integrations/slack/triggers/reactionRemoved/filter";
import type { TriggerEvent } from "@/contracts/triggerEvent";

function makeEvent(payload: Record<string, unknown>): TriggerEvent {
  return {
    provider: "slack",
    eventType: "slack.reaction_removed",
    eventId: "Ev1",
    occurredAt: "2026-05-07T00:00:00Z",
    providerAccountId: "T0001",
    payload,
  };
}

const basePayload = {
  type: "reaction_removed",
  user: "U-REACTOR",
  reaction: "thumbsup",
  item: { type: "message", channel: "C1", ts: "1.0" },
  item_user: "U-AUTHOR",
};

describe("reactionRemovedFilter — identity", () => {
  it("declares provider=slack and eventType=slack.reaction_removed", () => {
    expect(reactionRemovedFilter.provider).toBe("slack");
    expect(reactionRemovedFilter.eventType).toBe("slack.reaction_removed");
  });
});

describe("reactionRemovedFilter — match/no-match across both filter axes", () => {
  it("matches when no filters set", () => {
    const config = reactionRemovedFilter.parseConfig({});
    expect(reactionRemovedFilter.evaluate(makeEvent(basePayload), config)).toEqual({
      kind: "match",
    });
  });

  it("matches when reactionEmoji matches (colons stripped on both sides)", () => {
    const config = reactionRemovedFilter.parseConfig({ reactionEmoji: ":thumbsup:" });
    expect(reactionRemovedFilter.evaluate(makeEvent(basePayload), config)).toEqual({
      kind: "match",
    });
  });

  it("does NOT match when reaction differs", () => {
    const config = reactionRemovedFilter.parseConfig({ reactionEmoji: "tada" });
    expect(reactionRemovedFilter.evaluate(makeEvent(basePayload), config).kind).toBe(
      "no-match",
    );
  });

  it("matches when channelId matches the item.channel", () => {
    const config = reactionRemovedFilter.parseConfig({ channelId: "C1" });
    expect(reactionRemovedFilter.evaluate(makeEvent(basePayload), config)).toEqual({
      kind: "match",
    });
  });

  it("does NOT match when channelId differs from item.channel", () => {
    const config = reactionRemovedFilter.parseConfig({ channelId: "C99" });
    expect(reactionRemovedFilter.evaluate(makeEvent(basePayload), config).kind).toBe(
      "no-match",
    );
  });
});

describe("reactionRemovedFilter — parseConfig validates strictly", () => {
  it("throws on non-C-prefixed channelId", () => {
    expect(() =>
      reactionRemovedFilter.parseConfig({ channelId: "G123" }),
    ).toThrow();
  });
});
