/**
 * @jest-environment node
 *
 * ANALYTICS-EXPLICIT-LAYOUT-S2-CONTRACT-1 — the write-boundary board check.
 *
 * Zod validates one widget at a time and cannot see the SET: two individually
 * legal rectangles can still sit on top of each other. This is the server's last
 * line before an explicit board is stored, so the read path never has to repair
 * something a client could simply have been stopped from saving.
 */

jest.mock("@/utils/supabase/server", () => ({ createClient: jest.fn() }));
jest.mock("@/services/accounts/activeAccount", () => ({ resolveActiveAccount: jest.fn() }));
jest.mock("@/services/accounts/accountAuthz", () => ({ requireAccountRole: jest.fn() }));
jest.mock("@/services/analytics/dashboards", () => ({ getDashboardAccount: jest.fn() }));

import { rejectInvalidWidgetLayout } from "@/app/api/analytics/_shared";
import { AnalyticsWidgetSchema, type AnalyticsWidget } from "@/contracts/analytics";
import type { AnalyticsWidgetSize } from "@/contracts/analytics";

const widget = (
  id: string,
  size: AnalyticsWidgetSize = "s",
  layout?: { x: number; y: number; w: number; h: number },
): AnalyticsWidget =>
  AnalyticsWidgetSchema.parse({
    id,
    type: "stat",
    size,
    title: id,
    config: { source: "any", metric: "runs" },
    ...(layout ? { layout } : {}),
  });

async function errorOf(response: Response): Promise<{ error?: string; issues?: unknown }> {
  return (await response.json()) as { error?: string; issues?: unknown };
}

describe("a save with no explicit placement passes straight through", () => {
  it("accepts an absent widget list (a rename-only save)", () => {
    expect(rejectInvalidWidgetLayout(undefined)).toBeNull();
  });

  it("accepts an empty board", () => {
    expect(rejectInvalidWidgetLayout([])).toBeNull();
  });

  it("accepts a legacy board, and does not push it toward explicit layout", () => {
    expect(rejectInvalidWidgetLayout([widget("a"), widget("b", "m")])).toBeNull();
  });
});

describe("a save carrying explicit placement is checked as a whole board", () => {
  it("accepts a valid explicit board, gaps included", () => {
    const board = [
      widget("a", "s", { x: 3, y: 0, w: 1, h: 1 }),
      widget("b", "m", { x: 0, y: 2, w: 2, h: 1 }),
    ];
    expect(rejectInvalidWidgetLayout(board)).toBeNull();
  });

  it("rejects two widgets occupying the same cells", async () => {
    const board = [
      widget("a", "m", { x: 0, y: 0, w: 2, h: 1 }),
      widget("b", "m", { x: 1, y: 0, w: 2, h: 1 }),
    ];
    const response = rejectInvalidWidgetLayout(board);
    expect(response?.status).toBe(400);
    expect(await errorOf(response!)).toMatchObject({
      issues: [{ code: "overlap", widgetIds: ["a", "b"] }],
    });
  });

  it("rejects a repeated widget id", async () => {
    const board = [
      widget("dup", "s", { x: 0, y: 0, w: 1, h: 1 }),
      widget("dup", "s", { x: 1, y: 0, w: 1, h: 1 }),
    ];
    const response = rejectInvalidWidgetLayout(board);
    expect(response?.status).toBe(400);
    expect(JSON.stringify(await errorOf(response!))).toContain("duplicate-id");
  });

  it("rejects a half-placed board — that transitional state is never valid", async () => {
    const board = [widget("a", "s", { x: 0, y: 0, w: 1, h: 1 }), widget("b")];
    const response = rejectInvalidWidgetLayout(board);
    expect(response?.status).toBe(400);
    expect((await errorOf(response!)).error).toContain("Every widget must carry a placement");
  });

  it("names only widget ids and problem codes — never stored user content", async () => {
    const board = [
      { ...widget("a", "m", { x: 0, y: 0, w: 2, h: 1 }), title: "Q3 acquisition targets" },
      widget("b", "m", { x: 1, y: 0, w: 2, h: 1 }),
    ];
    const response = rejectInvalidWidgetLayout(board);
    expect(JSON.stringify(await errorOf(response!))).not.toContain("acquisition");
  });
});
