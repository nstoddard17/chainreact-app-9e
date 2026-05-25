/**
 * @jest-environment node
 *
 * Slice 3.DISCORD-7 — Discord snowflake helpers.
 *
 * Pinned facts:
 *   - Discord epoch = 1420070400000 ms (2015-01-01T00:00:00Z).
 *   - Snowflake = ((unixMs - epoch) << 22) for the empty-counter case.
 *   - 64-bit ints; encoded as ASCII decimal strings end-to-end.
 *   - All math goes through BigInt — JS Number loses precision after
 *     `2024-12-04T07:50:23Z`.
 */
import {
  DISCORD_EPOCH_MS,
  maxSnowflake,
  snowflakeFromTimestamp,
} from "@/integrations/discord/triggers/newMessage/snowflake";

describe("snowflakeFromTimestamp", () => {
  it("equals 0 when timestampMs equals the Discord epoch", () => {
    expect(snowflakeFromTimestamp(Number(DISCORD_EPOCH_MS))).toBe("0");
  });

  it("produces ((ms - epoch) << 22) for a known timestamp", () => {
    // 2024-01-01T00:00:00Z = 1704067200000 ms
    // ms - epoch = 283996800000
    // << 22 = 283996800000 * 2^22 = 1191182643363840000... let's just compute via BigInt.
    const ms = 1704067200000;
    const expected = ((BigInt(ms) - DISCORD_EPOCH_MS) << 22n).toString();
    expect(snowflakeFromTimestamp(ms)).toBe(expected);
  });

  it("produces strictly larger values for later timestamps (BigInt monotonicity)", () => {
    const earlier = snowflakeFromTimestamp(1700000000000);
    const later = snowflakeFromTimestamp(1700000001000);
    expect(BigInt(later) > BigInt(earlier)).toBe(true);
  });

  it("throws when timestampMs is before the Discord epoch", () => {
    expect(() => snowflakeFromTimestamp(0)).toThrow(/before the Discord epoch/);
    expect(() => snowflakeFromTimestamp(Number(DISCORD_EPOCH_MS) - 1)).toThrow(
      /before the Discord epoch/,
    );
  });

  it("Date.now() produces a snowflake larger than every historical message id", () => {
    // Sanity-check the empty-channel activation path: a synthesized
    // snowflake from `Date.now()` MUST be larger than any plausible
    // Discord-issued historical message id. Discord message ids in
    // current circulation are all >> 2^60; our synthesized value at
    // current wall-clock is ~((now - epoch) << 22) which is in the
    // same magnitude range and increasing monotonically.
    const synth = BigInt(snowflakeFromTimestamp(Date.now()));
    // 2020-01-01 snowflake — chosen as a value any real channel's
    // current newest message is guaranteed to exceed by now.
    const oldRef = BigInt(snowflakeFromTimestamp(1577836800000));
    expect(synth > oldRef).toBe(true);
  });
});

describe("maxSnowflake", () => {
  it("returns the larger of two parseable snowflakes (a > b)", () => {
    expect(maxSnowflake("1000", "500")).toBe("1000");
  });

  it("returns the larger of two parseable snowflakes (b > a)", () => {
    expect(maxSnowflake("500", "1000")).toBe("1000");
  });

  it("returns either when equal (deterministic — prefers `a` per implementation)", () => {
    expect(maxSnowflake("500", "500")).toBe("500");
  });

  it("compares as BigInt, not lexicographically (the regression guard)", () => {
    // Lexicographic compare would say "9" > "10" (because '9' > '1');
    // BigInt compare correctly says 10 > 9.
    expect(maxSnowflake("9", "10")).toBe("10");
  });

  it("handles values past Number.MAX_SAFE_INTEGER (real Discord snowflakes)", () => {
    // Real Discord snowflakes are ~2^60+; this range overflows JS Number.
    const a = "1234567890123456789";
    const b = "1234567890123456790";
    expect(maxSnowflake(a, b)).toBe(b);
  });

  it("falls back to the other value when a is null/undefined/empty", () => {
    expect(maxSnowflake(null, "100")).toBe("100");
    expect(maxSnowflake(undefined, "100")).toBe("100");
    expect(maxSnowflake("", "100")).toBe("100");
  });

  it("falls back to the other value when b is null/undefined/empty", () => {
    expect(maxSnowflake("100", null)).toBe("100");
    expect(maxSnowflake("100", undefined)).toBe("100");
    expect(maxSnowflake("100", "")).toBe("100");
  });

  it("returns a sentinel when both inputs are unparseable", () => {
    expect(maxSnowflake("not-a-number", "also-not")).toBe("not-a-number");
  });

  it("falls back to b when a is unparseable but b is valid", () => {
    expect(maxSnowflake("not-a-number", "100")).toBe("100");
  });
});
