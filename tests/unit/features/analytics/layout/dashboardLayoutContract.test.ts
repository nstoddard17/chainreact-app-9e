import {
  ANALYTICS_CANONICAL_COLUMNS,
  ANALYTICS_SIZE_FOOTPRINT,
  AnalyticsWidgetLayoutSchema,
  AnalyticsWidgetSchema,
  AnalyticsWidgetsSchema,
  footprintForSize,
} from "@/contracts/analytics";
import { SIZE_GRID_CLASS } from "@/features/analytics/Widget";

/**
 * ANALYTICS-EXPLICIT-LAYOUT-S2-CONTRACT-1 — the persisted contract.
 *
 * The field is OPTIONAL and the schema stays STRICT: a board written before
 * explicit placement must keep parsing untouched, a board written after it must
 * round-trip exactly, and anything else must still be rejected.
 */

const legacyWidget = {
  id: "w-1",
  type: "stat" as const,
  size: "s" as const,
  title: "Runs",
  config: { source: "any", metric: "runs" as const },
};

describe("the widget contract accepts both storage generations", () => {
  it("accepts a widget stored before explicit placement, and adds no layout to it", () => {
    const parsed = AnalyticsWidgetSchema.parse(legacyWidget);
    expect(parsed.layout).toBeUndefined();
    expect("layout" in parsed).toBe(false);
  });

  it("accepts a widget carrying explicit placement, preserving the exact rectangle", () => {
    const parsed = AnalyticsWidgetSchema.parse({
      ...legacyWidget,
      layout: { x: 2, y: 3, w: 1, h: 1 },
    });
    expect(parsed.layout).toEqual({ x: 2, y: 3, w: 1, h: 1 });
  });

  it("still rejects an unknown field on the widget", () => {
    const result = AnalyticsWidgetSchema.safeParse({ ...legacyWidget, rogue: true });
    expect(result.success).toBe(false);
  });

  it("still rejects an unknown field inside layout", () => {
    const result = AnalyticsWidgetSchema.safeParse({
      ...legacyWidget,
      layout: { x: 0, y: 0, w: 1, h: 1, z: 9 },
    });
    expect(result.success).toBe(false);
  });

  it("keeps every pre-existing widget rule intact", () => {
    expect(AnalyticsWidgetSchema.safeParse({ ...legacyWidget, id: "" }).success).toBe(false);
    expect(AnalyticsWidgetSchema.safeParse({ ...legacyWidget, title: "" }).success).toBe(false);
    expect(AnalyticsWidgetSchema.safeParse({ ...legacyWidget, size: "huge" }).success).toBe(false);
    expect(AnalyticsWidgetSchema.safeParse({ ...legacyWidget, type: "pie" }).success).toBe(false);
  });

  it("keeps the 48-widget board cap", () => {
    const many = Array.from({ length: 49 }, (_, i) => ({ ...legacyWidget, id: `w-${i}` }));
    expect(AnalyticsWidgetsSchema.safeParse(many).success).toBe(false);
  });
});

describe("a stored rectangle must be a whole block of cells on the canonical grid", () => {
  it.each([
    ["a fractional column", { x: 0.5, y: 0, w: 1, h: 1 }],
    ["a negative column", { x: -1, y: 0, w: 1, h: 1 }],
    ["a negative row", { x: 0, y: -1, w: 1, h: 1 }],
    ["a zero width", { x: 0, y: 0, w: 0, h: 1 }],
    ["a zero height", { x: 0, y: 0, w: 1, h: 0 }],
    ["a width past the canonical grid", { x: 0, y: 0, w: 5, h: 1 }],
    ["a rectangle hanging past the right edge", { x: 3, y: 0, w: 2, h: 1 }],
  ])("rejects %s", (_name, layout) => {
    expect(AnalyticsWidgetLayoutSchema.safeParse(layout).success).toBe(false);
  });

  it("accepts a rectangle ending exactly on the last column", () => {
    expect(AnalyticsWidgetLayoutSchema.safeParse({ x: 2, y: 7, w: 2, h: 1 }).success).toBe(true);
  });

  it("pins the canonical width at four columns", () => {
    expect(ANALYTICS_CANONICAL_COLUMNS).toBe(4);
  });
});

describe("dimensions have exactly one source of truth while `size` still exists", () => {
  it("rejects a rectangle whose dimensions contradict the size preset", () => {
    const result = AnalyticsWidgetSchema.safeParse({
      ...legacyWidget,
      size: "s", // 1×1
      layout: { x: 0, y: 0, w: 2, h: 1 },
    });
    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues[0]?.message).toContain(
      "does not match",
    );
  });

  it.each(["s", "m", "l", "xl", "w", "tall"] as const)(
    "accepts the '%s' preset only with its own footprint",
    (size) => {
      const footprint = footprintForSize(size);
      expect(
        AnalyticsWidgetSchema.safeParse({
          ...legacyWidget,
          size,
          layout: { x: 0, y: 0, ...footprint },
        }).success,
      ).toBe(true);
      expect(
        AnalyticsWidgetSchema.safeParse({
          ...legacyWidget,
          size,
          layout: { x: 0, y: 0, w: footprint.w, h: footprint.h + 1 },
        }).success,
      ).toBe(false);
    },
  );

  it("still matches the footprints the app renders today", () => {
    const fromClasses = Object.fromEntries(
      Object.entries(SIZE_GRID_CLASS).map(([size, cls]) => [
        size,
        {
          w: Number(/col-span-(\d+)/.exec(cls)?.[1] ?? 1),
          h: Number(/row-span-(\d+)/.exec(cls)?.[1] ?? 1),
        },
      ]),
    );
    expect(ANALYTICS_SIZE_FOOTPRINT).toEqual(fromClasses);
  });
});
