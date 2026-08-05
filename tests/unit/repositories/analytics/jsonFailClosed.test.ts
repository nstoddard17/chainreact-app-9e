/**
 * @jest-environment node
 *
 * SUPABASE-TABLE-TYPING-1C — the runtime half of the analytics JSON decision.
 *
 * `repositories/analyticsDashboards.ts` and
 * `repositories/analyticsSourceSnapshots.ts` keep their jsonb columns OPAQUE
 * and validate nothing. That is only defensible if the chokepoints which DO
 * interpret them fail closed, so this suite drives the real validators with
 * corrupted persisted blobs — proving the classification is a DELEGATION, not
 * an omission.
 */

import { normalizeDashboardWidgets, validateLayout } from "@/core/analytics/layout";
import type { AnalyticsLayout } from "@/core/analytics/layout";
import { NormalizedAnalyticsResultSchema } from "@/services/analytics/sources/types";

describe("corrupt dashboard widgets → degraded, never trusted", () => {
  it.each([
    ["null", null],
    ["a number", 42],
    ["a bare string", "widgets"],
    ["a non-array object", { id: "w1" }],
    ["an array of junk", [null, 7, "x"]],
    ["a widget of an unknown type", [{ id: "w1", type: "totally-unknown-type" }]],
    ["a widget missing its id", [{ type: "kpi", title: "T" }]],
  ])("%s never comes back as a trusted widget set", (_name, blob) => {
    const normalized = normalizeDashboardWidgets(blob);
    expect(Array.isArray(normalized.widgets)).toBe(true);
    // The raw persisted blob must not survive the chokepoint by reference.
    expect(normalized.widgets as unknown).not.toBe(blob);
    for (const w of normalized.widgets) {
      expect(typeof w).toBe("object");
      expect(w).not.toBeNull();
    }
  });

  it("reports layout problems as CODES + widget ids, never stored user content", () => {
    const normalized = normalizeDashboardWidgets([
      { id: "w1", type: "kpi", title: "Q3 revenue for ACME", config: { note: "token-abc" } },
      { id: "w1", type: "kpi", title: "duplicate id" },
    ]);
    const serialized = JSON.stringify(normalized.layoutProblems);
    expect(serialized).not.toContain("token-abc");
    expect(serialized).not.toContain("ACME");
  });
});

describe("the write guard refuses an unstorable board rather than repairing it later", () => {
  const placed = (widgetId: string, x: number, y: number): unknown => ({
    widgetId,
    x,
    y,
    w: 4,
    h: 2,
  });

  it("rejects two rectangles occupying the same cells", () => {
    const overlapping = [placed("w1", 0, 0), placed("w2", 0, 0)] as AnalyticsLayout;
    const result = validateLayout(overlapping, 12);
    expect(result.ok).toBe(false);
  });

  it("rejects a duplicate widget id", () => {
    const duplicate = [placed("w1", 0, 0), placed("w1", 0, 4)] as AnalyticsLayout;
    const result = validateLayout(duplicate, 12);
    expect(result.ok).toBe(false);
  });

  it("accepts a well-formed board, so the refusals above are not vacuous", () => {
    const fine = [placed("w1", 0, 0), placed("w2", 4, 0)] as AnalyticsLayout;
    expect(validateLayout(fine, 12).ok).toBe(true);
  });
});

describe("corrupt snapshot envelope → a cache MISS, never a trusted result", () => {
  const VALID = {
    shape: "series",
    dimensions: ["month"],
    measures: ["revenue"],
    rows: [{ month: "2026-05", revenue: 120 }],
    generatedAt: "2026-07-04T00:00:00Z",
    freshness: { cached: false, ageSeconds: null, ttlSeconds: null },
    warnings: [],
    truncated: false,
  };

  it("accepts a well-formed persisted result — the rejections below are not vacuous", () => {
    expect(NormalizedAnalyticsResultSchema.safeParse(VALID).success).toBe(true);
  });

  it.each([
    ["null", null],
    ["a bare string", "result"],
    ["a number", 7],
    ["an empty object", {}],
    ["an array instead of an envelope", [{ month: "2026-05" }]],
    ["a missing rows array", { ...VALID, rows: undefined }],
    ["rows of the wrong type", { ...VALID, rows: "nope" }],
    ["a missing shape discriminator", { ...VALID, shape: undefined }],
    ["an unknown shape", { ...VALID, shape: "hologram" }],
    ["a missing truncated flag", { ...VALID, truncated: undefined }],
    ["a non-string generatedAt", { ...VALID, generatedAt: 12345 }],
  ])("rejects %s rather than serving it as a snapshot", (_name, blob) => {
    expect(NormalizedAnalyticsResultSchema.safeParse(blob).success).toBe(false);
  });
});
