/** @jest-environment node */
import {
  formatRunDuration,
  formatRunStartedAt,
} from "@/features/runs/formatRunDuration";

describe("formatRunDuration", () => {
  it("renders an em-dash for null (no finishedAt)", () => {
    expect(formatRunDuration(null)).toBe("—");
  });

  it("guards against negative values", () => {
    expect(formatRunDuration(-1)).toBe("0ms");
  });

  it("renders sub-1s in milliseconds", () => {
    expect(formatRunDuration(0)).toBe("0ms");
    expect(formatRunDuration(742)).toBe("742ms");
  });

  it("renders sub-10s with one decimal", () => {
    expect(formatRunDuration(1_400)).toBe("1.4s");
    expect(formatRunDuration(9_900)).toBe("9.9s");
  });

  it("renders sub-60s as integer seconds", () => {
    expect(formatRunDuration(12_000)).toBe("12s");
    expect(formatRunDuration(59_000)).toBe("59s");
  });

  it("renders sub-1h as Xm Ys (drops seconds when 0)", () => {
    expect(formatRunDuration(60_000)).toBe("1m");
    expect(formatRunDuration(134_000)).toBe("2m 14s");
    expect(formatRunDuration(3_540_000)).toBe("59m");
  });

  it("renders sub-1d as Xh Ym", () => {
    expect(formatRunDuration(3_600_000)).toBe("1h");
    expect(formatRunDuration(4_020_000)).toBe("1h 7m");
    expect(formatRunDuration(86_340_000)).toBe("23h 59m");
  });

  it("renders >= 1d as Xd Yh", () => {
    expect(formatRunDuration(86_400_000)).toBe("1d");
    expect(formatRunDuration(97_200_000)).toBe("1d 3h");
  });
});

describe("formatRunStartedAt", () => {
  const REAL_NOW = Date.now;
  beforeAll(() => {
    Date.now = () => Date.UTC(2026, 4, 30, 12, 0, 0); // 2026-05-30T12:00:00Z
  });
  afterAll(() => {
    Date.now = REAL_NOW;
  });

  it("renders empty string for unparseable timestamps", () => {
    expect(formatRunStartedAt("not-a-date")).toBe("");
  });

  it("renders just now for sub-1m diffs", () => {
    expect(formatRunStartedAt(new Date(Date.now() - 10_000).toISOString())).toBe(
      "just now",
    );
  });

  it("renders Xm ago for sub-1h diffs", () => {
    expect(
      formatRunStartedAt(new Date(Date.now() - 5 * 60_000).toISOString()),
    ).toBe("5m ago");
  });

  it("renders Xh ago for sub-1d diffs", () => {
    expect(
      formatRunStartedAt(new Date(Date.now() - 3 * 60 * 60_000).toISOString()),
    ).toBe("3h ago");
  });

  it("renders Xd ago for sub-1w diffs", () => {
    expect(
      formatRunStartedAt(
        new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString(),
      ),
    ).toBe("2d ago");
  });

  it("falls back to a localized date for >= 1w diffs", () => {
    const out = formatRunStartedAt(
      new Date(Date.now() - 10 * 24 * 60 * 60_000).toISOString(),
    );
    // The exact format depends on the runner's locale; we just assert
    // it's non-empty and not one of the relative-time fallbacks.
    expect(out.length).toBeGreaterThan(0);
    expect(out).not.toMatch(/ago$|just now/);
  });
});
