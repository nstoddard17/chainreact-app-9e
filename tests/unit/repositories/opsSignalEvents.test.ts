/**
 * Tests for repositories/opsSignalEvents — cron-status derivation.
 *
 * Focus on the real reducer logic: deriving lastOutcome, consecutiveFailures, and
 * last-success age from the recent heartbeat rows, and the "no rows → null last
 * success" rule (a never-observed cron is treated as missing, never green).
 */
import { jest } from "@jest/globals";

type QueryResult = { data?: unknown; error?: unknown; count?: number };

function builder(result: QueryResult) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "order", "limit"]) {
    b[m] = () => b;
  }
  (b as { then: unknown }).then = (resolve: (v: QueryResult) => unknown) => resolve(result);
  return b;
}

let resultsByCall: QueryResult[] = [];
jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: () => ({
    from: () => builder(resultsByCall.shift() ?? { data: [] }),
  }),
}));

import { getCronRunStatuses } from "@/repositories/opsSignalEvents";

const NOW = "2026-06-26T12:00:00.000Z";

describe("getCronRunStatuses", () => {
  it("derives last outcome, consecutive failures, and last-success age (newest first)", async () => {
    resultsByCall = [
      {
        data: [
          { source: "poll-triggers", outcome: "failed", created_at: "2026-06-26T11:58:00.000Z" },
          { source: "poll-triggers", outcome: "failed", created_at: "2026-06-26T11:57:00.000Z" },
          { source: "poll-triggers", outcome: "ok", created_at: "2026-06-26T11:40:00.000Z" },
        ],
      },
    ];
    const [status] = await getCronRunStatuses(["poll-triggers"], NOW);
    expect(status).toEqual({
      source: "poll-triggers",
      lastOutcome: "failed",
      consecutiveFailures: 2,
      lastSuccessAgeMinutes: 20, // 12:00 - 11:40
    });
  });

  it("treats a cron with no heartbeats as missing (null last success, never green)", async () => {
    resultsByCall = [{ data: [] }];
    const [status] = await getCronRunStatuses(["evaluate-ops-alerts"], NOW);
    expect(status).toEqual({
      source: "evaluate-ops-alerts",
      lastOutcome: null,
      consecutiveFailures: 0,
      lastSuccessAgeMinutes: null,
    });
  });

  it("reports zero consecutive failures when the latest run succeeded", async () => {
    resultsByCall = [
      {
        data: [
          { source: "sweep-stale-runs", outcome: "ok", created_at: "2026-06-26T11:55:00.000Z" },
          { source: "sweep-stale-runs", outcome: "failed", created_at: "2026-06-26T11:45:00.000Z" },
        ],
      },
    ];
    const [status] = await getCronRunStatuses(["sweep-stale-runs"], NOW);
    expect(status!.consecutiveFailures).toBe(0);
    expect(status!.lastOutcome).toBe("ok");
    expect(status!.lastSuccessAgeMinutes).toBe(5);
  });
});
