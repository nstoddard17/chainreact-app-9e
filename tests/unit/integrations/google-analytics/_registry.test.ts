/**
 * @jest-environment node
 *
 * Slice 3.GOOGLE-ANALYTICS-2 — GA4 handler-registry wiring. The registry
 * exposes EXACTLY the 6 accepted GA actions; the deferred/excluded handlers
 * (create_measurement_secret, get_user_activity) and any triggers are NOT
 * registered.
 */
import { listRegisteredHandlers } from "@/services/execution/handlers/_registry";

describe("google-analytics handler registry wiring", () => {
  const ga = () =>
    listRegisteredHandlers().filter((h) => h.provider === "google-analytics");

  it("registers exactly 6 GA action handlers", () => {
    expect(ga()).toHaveLength(6);
  });

  it("exposes the 6 expected (provider,type) keys with no duplicates", () => {
    const keys = ga().map((h) => `${h.provider}:${h.type}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual([
      "google-analytics:create_conversion_event",
      "google-analytics:find_conversion",
      "google-analytics:get_realtime_data",
      "google-analytics:run_pivot_report",
      "google-analytics:run_report",
      "google-analytics:send_event",
    ]);
  });

  it("does NOT register the deferred/excluded handlers (create_measurement_secret, get_user_activity)", () => {
    const types = ga().map((h) => h.type);
    expect(types).not.toContain("create_measurement_secret");
    expect(types).not.toContain("get_user_activity");
  });
});
