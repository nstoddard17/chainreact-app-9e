/**
 * @jest-environment node
 *
 * Tests for integrations/slack/triggers/fileUploaded/filter
 * (Slack 2.5 Commit 2).
 *
 * Covers:
 *   - identity + eventType
 *   - parseConfig: empty config (match-all), valid C-id, valid G-id, invalid id
 *   - evaluate: match-all when channelId omitted, match on channel_id equality,
 *     no-match on channel_id mismatch, no-match when payload.channel_id missing
 *   - critical regression guard: payload.channel (bare, like `message` events)
 *     does NOT satisfy a channelId filter. file_shared uses snake_case
 *     payload.channel_id.
 */
import { fileUploadedFilter } from "@/integrations/slack/triggers/fileUploaded/filter";
import type { TriggerEvent } from "@/contracts/triggerEvent";

function makeEvent(payload: Record<string, unknown>): TriggerEvent {
  return {
    provider: "slack",
    eventType: "slack.file_shared",
    eventId: "Ev0001",
    occurredAt: "2026-05-14T00:00:00Z",
    accountId: "T0001",
    payload,
  };
}

describe("fileUploadedFilter — identity + registration shape", () => {
  it("declares provider=slack and eventType=slack.file_shared", () => {
    expect(fileUploadedFilter.provider).toBe("slack");
    expect(fileUploadedFilter.eventType).toBe("slack.file_shared");
  });
});

describe("fileUploadedFilter — parseConfig", () => {
  it("accepts an empty config (match-all)", () => {
    expect(() => fileUploadedFilter.parseConfig({})).not.toThrow();
    const parsed = fileUploadedFilter.parseConfig({});
    expect(parsed).toEqual({});
  });

  it("accepts a valid public C-prefixed channel id", () => {
    expect(() =>
      fileUploadedFilter.parseConfig({ channelId: "C0001" }),
    ).not.toThrow();
    const parsed = fileUploadedFilter.parseConfig({ channelId: "CMATCH001" });
    expect(parsed).toEqual({ channelId: "CMATCH001" });
  });

  it("accepts a valid legacy G-prefixed private channel id", () => {
    expect(() =>
      fileUploadedFilter.parseConfig({ channelId: "GLEGACY1" }),
    ).not.toThrow();
    const parsed = fileUploadedFilter.parseConfig({ channelId: "GPRIV001" });
    expect(parsed).toEqual({ channelId: "GPRIV001" });
  });

  it("rejects a D-prefixed (DM) channelId — DMs not in v1 surface", () => {
    expect(() =>
      fileUploadedFilter.parseConfig({ channelId: "DABC123" }),
    ).toThrow();
  });

  it("rejects a lowercase channelId", () => {
    expect(() =>
      fileUploadedFilter.parseConfig({ channelId: "cabc123" }),
    ).toThrow();
  });

  it("rejects an empty-string channelId", () => {
    expect(() =>
      fileUploadedFilter.parseConfig({ channelId: "" }),
    ).toThrow();
  });

  it("rejects a channelId with disallowed characters (hyphens, lowercase, etc.)", () => {
    expect(() =>
      fileUploadedFilter.parseConfig({ channelId: "C-WITH-HYPHEN" }),
    ).toThrow();
  });
});

describe("fileUploadedFilter — evaluate (match-all)", () => {
  it("matches every event when channelId is omitted", () => {
    const config = fileUploadedFilter.parseConfig({});
    const result = fileUploadedFilter.evaluate(
      makeEvent({
        type: "file_shared",
        file_id: "F0001",
        user_id: "U0001",
        channel_id: "C-ANY",
        event_ts: "1711900808.000900",
        file: { id: "F0001" },
      }),
      config,
    );
    expect(result).toEqual({ kind: "match" });
  });
});

describe("fileUploadedFilter — evaluate (channelId filter)", () => {
  it("matches when payload.channel_id equals the configured channelId (C-prefixed)", () => {
    const config = fileUploadedFilter.parseConfig({ channelId: "CMATCH001" });
    const result = fileUploadedFilter.evaluate(
      makeEvent({
        type: "file_shared",
        file_id: "F0001",
        user_id: "U0001",
        channel_id: "CMATCH001",
        event_ts: "1711900808.000900",
        file: { id: "F0001" },
      }),
      config,
    );
    expect(result).toEqual({ kind: "match" });
  });

  it("matches when payload.channel_id equals the configured channelId (G-prefixed legacy private)", () => {
    const config = fileUploadedFilter.parseConfig({ channelId: "GPRIV001" });
    const result = fileUploadedFilter.evaluate(
      makeEvent({
        type: "file_shared",
        file_id: "F0001",
        user_id: "U0001",
        channel_id: "GPRIV001",
        event_ts: "1711900808.000900",
        file: { id: "F0001" },
      }),
      config,
    );
    expect(result).toEqual({ kind: "match" });
  });

  it("does NOT match when payload.channel_id differs from configured channelId", () => {
    const config = fileUploadedFilter.parseConfig({ channelId: "CMATCH001" });
    const result = fileUploadedFilter.evaluate(
      makeEvent({
        type: "file_shared",
        file_id: "F0001",
        user_id: "U0001",
        channel_id: "COTHER999",
        event_ts: "1711900808.000900",
        file: { id: "F0001" },
      }),
      config,
    );
    expect(result.kind).toBe("no-match");
    if (result.kind === "no-match") {
      expect(result.reason).toMatch(/does not match/);
      expect(result.reason).toContain("COTHER999");
      expect(result.reason).toContain("CMATCH001");
    }
  });

  it("does NOT match when payload.channel_id is missing", () => {
    const config = fileUploadedFilter.parseConfig({ channelId: "CMATCH001" });
    const result = fileUploadedFilter.evaluate(
      makeEvent({
        type: "file_shared",
        file_id: "F0001",
        user_id: "U0001",
        // channel_id intentionally absent
        event_ts: "1711900808.000900",
        file: { id: "F0001" },
      }),
      config,
    );
    expect(result.kind).toBe("no-match");
  });

  // ── Regression guard ──
  //
  // Slack's `file_shared` event uses snake_case `payload.channel_id`,
  // NOT `payload.channel`. A wrong-field implementation (copy-pasted
  // from message / member_joined_channel filters which use bare
  // `payload.channel`) would silently accept ALL events as no-match
  // when channelId is set, even when the user clearly intended a
  // match. This test pins that behavior so a future refactor that
  // accidentally reads `payload.channel` instead of `payload.channel_id`
  // fails loudly.
  it("does NOT satisfy the channelId filter when only payload.channel is present (regression: file_shared uses channel_id, not channel)", () => {
    const config = fileUploadedFilter.parseConfig({ channelId: "CMATCH001" });
    const result = fileUploadedFilter.evaluate(
      makeEvent({
        type: "file_shared",
        file_id: "F0001",
        user_id: "U0001",
        channel: "CMATCH001", // wrong field — bare channel, like message events
        // channel_id absent
        event_ts: "1711900808.000900",
        file: { id: "F0001" },
      }),
      config,
    );
    expect(result.kind).toBe("no-match");
  });
});

describe("fileUploadedFilter — pure / no I/O", () => {
  // Lightweight smoke check: the filter must not call into any
  // network / DB / files.info path. parseConfig + evaluate are pure
  // and synchronous. Guard the contract by asserting evaluate returns
  // a synchronous FilterResult (not a Promise).
  it("evaluate returns a synchronous FilterResult, not a Promise", () => {
    const config = fileUploadedFilter.parseConfig({});
    const result = fileUploadedFilter.evaluate(
      makeEvent({
        type: "file_shared",
        file_id: "F0001",
        user_id: "U0001",
        channel_id: "CANY",
        event_ts: "1711900808.000900",
      }),
      config,
    );
    expect(result).toEqual({ kind: "match" });
    // If evaluate ever became async, this property check would catch it.
    expect((result as unknown as Promise<unknown>).then).toBeUndefined();
  });

  it("does NOT construct or return a FileRef", () => {
    const config = fileUploadedFilter.parseConfig({});
    const result = fileUploadedFilter.evaluate(
      makeEvent({
        type: "file_shared",
        file_id: "F0001",
        user_id: "U0001",
        channel_id: "CANY",
        event_ts: "1711900808.000900",
      }),
      config,
    );
    // FilterResult is { kind: "match" } | { kind: "no-match", reason }.
    // It carries no `file`, no FileRef, no bytes, no metadata.
    expect(Object.keys(result).sort()).toEqual(
      result.kind === "match" ? ["kind"] : ["kind", "reason"].sort(),
    );
  });
});
