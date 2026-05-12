/**
 * @jest-environment node
 *
 * Tests for integrations/slack/actions/parsePostAt.
 *
 * Pinning the Q11 contract: postAt accepts only Unix seconds (positive
 * integer) or ISO-8601 with explicit timezone. Naive datetimes are
 * rejected loudly so the operator must specify intent.
 */
import { parsePostAt } from "@/integrations/slack/actions/parsePostAt";

describe("parsePostAt — accepts Unix-seconds string", () => {
  it("parses a positive integer string to a number", () => {
    expect(parsePostAt("1730000000")).toBe(1730000000);
  });

  it("rejects zero (Slack would also reject as past)", () => {
    expect(() => parsePostAt("0")).toThrow(/positive Unix-second/);
  });

  it("rejects the Slack ts microsecond format (1730000000.000123)", () => {
    // Slack's `ts` for messages includes microseconds with a dot; that's
    // a message id, not a post_at. Must not be accepted as Unix seconds.
    expect(() => parsePostAt("1730000000.000123")).toThrow();
  });
});

describe("parsePostAt — accepts ISO-8601 with explicit timezone", () => {
  it("parses Z-suffix UTC string to Unix seconds (floor)", () => {
    const result = parsePostAt("2026-05-20T15:30:00Z");
    // Compute reference epoch independently to avoid double-implementing
    // the conversion in the test.
    const expected = Math.floor(Date.UTC(2026, 4, 20, 15, 30, 0) / 1000);
    expect(result).toBe(expected);
  });

  it("parses positive-offset string to Unix seconds (floor)", () => {
    // 2026-05-20T15:30:00+05:30 → 2026-05-20T10:00:00Z
    const result = parsePostAt("2026-05-20T15:30:00+05:30");
    const expected = Math.floor(Date.UTC(2026, 4, 20, 10, 0, 0) / 1000);
    expect(result).toBe(expected);
  });

  it("parses negative-offset string to Unix seconds (floor)", () => {
    // 2026-05-20T08:00:00-07:00 → 2026-05-20T15:00:00Z
    const result = parsePostAt("2026-05-20T08:00:00-07:00");
    const expected = Math.floor(Date.UTC(2026, 4, 20, 15, 0, 0) / 1000);
    expect(result).toBe(expected);
  });

  it("accepts ISO with fractional seconds plus timezone", () => {
    const result = parsePostAt("2026-05-20T15:30:00.123Z");
    const expected = Math.floor(Date.UTC(2026, 4, 20, 15, 30, 0, 123) / 1000);
    expect(result).toBe(expected);
  });
});

describe("parsePostAt — rejects everything else (Q11 strictness)", () => {
  it("rejects naive ISO (no timezone)", () => {
    expect(() => parsePostAt("2026-05-20T15:30:00")).toThrow(
      /explicit timezone/,
    );
  });

  it("rejects date-only ISO", () => {
    expect(() => parsePostAt("2026-05-20")).toThrow(/explicit timezone/);
  });

  it("rejects freeform date strings", () => {
    expect(() => parsePostAt("tomorrow at 3pm")).toThrow();
  });

  it("rejects an empty string", () => {
    // The schema's .min(1) catches empty in normal flow, but parsePostAt
    // is exported for direct use and should also reject defensively.
    expect(() => parsePostAt("")).toThrow();
  });

  it("rejects a 'now + 1h' style relative phrase", () => {
    expect(() => parsePostAt("now+3600")).toThrow();
  });

  it("rejects ISO with a `Z` in the middle (not at the end)", () => {
    expect(() => parsePostAt("2026-05-20TZ15:30:00")).toThrow();
  });
});
