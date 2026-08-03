/** @jest-environment node */
/**
 * Tests for features/apps/relativeDate (Slice 4.APPS-PAGE-1).
 *
 * Pure helper — no I/O, deterministic on UTC math.
 */
import { formatConnectedOn } from "@/features/apps/relativeDate";

describe("formatConnectedOn", () => {
  it("formats a typical ISO date", () => {
    expect(formatConnectedOn("2026-04-15T12:00:00Z")).toBe("Apr 15, 2026");
  });

  it("preserves month boundaries (UTC math, no local-tz drift)", () => {
    expect(formatConnectedOn("2026-01-01T00:00:00Z")).toBe("Jan 1, 2026");
    expect(formatConnectedOn("2026-12-31T23:59:59Z")).toBe("Dec 31, 2026");
  });

  it("returns empty string on invalid input rather than throwing", () => {
    expect(formatConnectedOn("not-a-date")).toBe("");
  });
});
