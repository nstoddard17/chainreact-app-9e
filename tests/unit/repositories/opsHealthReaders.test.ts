/** @jest-environment node */
/**
 * Tests for repositories/opsHealthReaders — the cross-table ops signal readers.
 *
 * Focus on the real reducer logic: provider attribution via the workflow node
 * map, stuck-run aggregation, and OAuth-refresh-per-provider rollup. The Supabase
 * query plumbing is mocked at the service-role boundary (allowed per testing
 * strategy §7). Also asserts readers return SAFE shapes only — provider keys +
 * counts, never run payloads / tokens / account ids.
 */
import { jest } from "@jest/globals";

type QueryResult = { data?: unknown; error?: unknown; count?: number };

/** A chainable, awaitable Supabase query-builder mock resolving to `result`. */
function builder(result: QueryResult) {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "lt", "gte", "order", "limit", "in"]) {
    b[m] = () => b;
  }
  (b as { then: unknown }).then = (resolve: (v: QueryResult) => unknown) => resolve(result);
  return b;
}

/** from() returns the next queued result for the requested table. */
function makeClient(resultsByTable: Record<string, QueryResult[]>) {
  return {
    from: (table: string) => {
      const queue = resultsByTable[table] ?? [];
      const next = queue.shift() ?? { data: [] };
      return builder(next);
    },
  };
}

let client: ReturnType<typeof makeClient>;
jest.mock("@/repositories/supabase/serviceRoleClient", () => ({
  getServiceRoleClient: () => client,
}));

import {
  aggregateProviderActionFailures,
  readOAuthRefreshFailuresByProvider,
  readQueueBacklog,
  readStuckRuns,
} from "@/repositories/opsHealthReaders";

const NOW = "2026-06-26T12:00:00.000Z";

describe("readStuckRuns", () => {
  it("counts running rows older than the cutoff and reports the oldest age", async () => {
    client = makeClient({
      workflow_runs: [
        { data: [{ started_at: "2026-06-26T11:30:00.000Z" }, { started_at: "2026-06-26T11:45:00.000Z" }] },
      ],
    });
    const result = await readStuckRuns("2026-06-26T11:45:00.000Z", NOW);
    expect(result.count).toBe(2);
    expect(result.oldestAgeMinutes).toBe(30); // 12:00 - 11:30
  });

  it("returns zero/null when nothing is stuck", async () => {
    client = makeClient({ workflow_runs: [{ data: [] }] });
    expect(await readStuckRuns("2026-06-26T11:45:00.000Z", NOW)).toEqual({
      count: 0,
      oldestAgeMinutes: null,
    });
  });
});

describe("aggregateProviderActionFailures", () => {
  it("attributes attempts/failures to the step's provider via the workflow node map", async () => {
    const runs = [
      {
        workflow_id: "wf-1",
        steps: [
          { nodeId: "n-slack", status: "failed" },
          { nodeId: "n-gmail", status: "succeeded" },
          { nodeId: "n-skip", status: "skipped" }, // ignored
        ],
      },
      {
        workflow_id: "wf-1",
        steps: [
          { nodeId: "n-slack", status: "failed" },
          { nodeId: "n-unknown", status: "failed" }, // no provider in map → ignored
        ],
      },
    ];
    const defs = [
      {
        id: "wf-1",
        draft_definition: {
          nodes: [
            { id: "n-slack", provider: "slack" },
            { id: "n-gmail", provider: "gmail" },
          ],
        },
      },
    ];
    client = makeClient({ workflow_runs: [{ data: runs }], workflows: [{ data: defs }] });

    const result = await aggregateProviderActionFailures("2026-06-26T11:45:00.000Z");
    const slack = result.find((r) => r.provider === "slack")!;
    const gmail = result.find((r) => r.provider === "gmail")!;
    expect(slack).toEqual({ provider: "slack", attempts: 2, failures: 2 });
    expect(gmail).toEqual({ provider: "gmail", attempts: 1, failures: 0 });
    // Unknown / skipped steps never created a provider entry.
    expect(result.map((r) => r.provider).sort()).toEqual(["gmail", "slack"]);
  });

  it("returns nothing when there are no runs in the window", async () => {
    client = makeClient({ workflow_runs: [{ data: [] }] });
    expect(await aggregateProviderActionFailures("2026-06-26T11:45:00.000Z")).toEqual([]);
  });
});

describe("readOAuthRefreshFailuresByProvider", () => {
  it("counts needs-reconnect integrations per provider (safe: provider + count only)", async () => {
    client = makeClient({
      integrations: [
        { data: [{ provider: "google" }, { provider: "google" }, { provider: "slack" }] },
      ],
    });
    const result = await readOAuthRefreshFailuresByProvider("2026-06-26T11:00:00.000Z");
    expect(result.find((r) => r.provider === "google")!.affectedCount).toBe(2);
    expect(result.find((r) => r.provider === "slack")!.affectedCount).toBe(1);
    // No account ids / tokens leak — keys are provider + affectedCount only.
    expect(JSON.stringify(result)).not.toMatch(/account|token|@/i);
  });
});

describe("readQueueBacklog", () => {
  it("reads real queued depth + oldest age by default (no flag)", async () => {
    client = makeClient({
      workflow_runs: [
        { count: 7 }, // head count
        { data: [{ created_at: "2026-06-26T11:50:00.000Z" }] }, // oldest
      ],
    });
    const result = await readQueueBacklog(NOW);
    expect(result).toEqual({ monitored: true, depth: 7, oldestAgeMinutes: 10 });
  });

  it("reports an empty queue as monitored depth 0 (read succeeded, genuinely healthy)", async () => {
    client = makeClient({ workflow_runs: [{ count: 0 }, { data: [] }] });
    expect(await readQueueBacklog(NOW)).toEqual({
      monitored: true,
      depth: 0,
      oldestAgeMinutes: null,
    });
  });

  it("THROWS when the depth read fails (e.g. migration not applied) so the evaluator reports unmonitored, never green", async () => {
    client = makeClient({
      workflow_runs: [{ error: { message: "invalid input value for enum workflow_run_status: queued" } }],
    });
    await expect(readQueueBacklog(NOW)).rejects.toThrow(/readQueueBacklog/);
  });
});
