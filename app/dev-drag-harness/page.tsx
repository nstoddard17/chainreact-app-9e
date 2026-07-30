import { notFound } from "next/navigation";
import { AnalyticsDragHarness } from "@/features/analytics/testing/AnalyticsDragHarness";

/**
 * BACKEND-FREE browser harness for the analytics widget drag
 * (ANALYTICS-DRAG-RIGHTWARD-CAPTURE-LOSS-1).
 *
 * The drag is pure client interaction, but the real Analytics page needs auth
 * and a database — so a Supabase outage means zero browser coverage of the one
 * thing that only a browser can prove: that the drag session survives React
 * reordering the dragged node. This route mounts the REAL AnalyticsDashboard
 * with in-memory widgets so Chromium can exercise the real hook, the real
 * pointer capture and the real reconciliation.
 *
 * NOT REACHABLE IN PRODUCTION, by two independent gates:
 *   1. `NODE_ENV === "production"` → 404, unconditionally. A production build
 *      cannot serve this page even if the flag below were somehow set.
 *   2. Outside production it still 404s unless `E2E_DRAG_HARNESS=1`, which is
 *      set only by playwright.config's webServer env. An ordinary `npm run dev`
 *      does not expose it.
 *
 * It renders no account data, reads no cookies, and calls no API on mount
 * (stat widgets render from the `initialOverview` prop), so it cannot leak
 * anything: there is nothing here but fixture text.
 */
export default async function E2eDragHarnessPage({
  searchParams,
}: {
  /**
   * `?board=charts` mounts the chart-footprint fixture board
   * (ANALYTICS-RESPONSIVE-CHART-SURFACES-1) instead of the drag board. Both are
   * in-memory fixtures behind the same two gates; the parameter selects which
   * fixture, it does not unlock anything.
   */
  searchParams?: Promise<{ board?: string }>;
}) {
  if (process.env.NODE_ENV === "production" || process.env.E2E_DRAG_HARNESS !== "1") {
    notFound();
  }
  const params = (await searchParams) ?? {};
  return <AnalyticsDragHarness board={params.board === "charts" ? "charts" : "drag"} />;
}
