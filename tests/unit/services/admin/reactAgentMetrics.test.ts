/**
 * @jest-environment node
 *
 * Tests for services/admin/reactAgentMetrics.ts (INTERNAL-FEEDBACK-2).
 *
 * Business rule: validate + normalize the date range, invoke the aggregation
 * repository, and assemble the count-only DTO. Proves DTO mapping, range
 * validation (invalid / from>to → MetricsRangeError), empty → zeros, and that the
 * DTO carries only numbers (no content passed through even if the aggregate were
 * polluted).
 */

const aggregateMock = jest.fn();
jest.mock("@/repositories/reactAgent/metrics", () => ({
  aggregateReactAgentMetrics: (...a: unknown[]) => aggregateMock(...a),
}));

import {
  getReactAgentMetrics,
  MetricsRangeError,
} from "@/services/admin/reactAgentMetrics";

const fullAggregate = {
  totalAgentChanges: 100,
  preview: { created: 40, applied: 25, keptAsPreview: 5, discarded: 8, applyFailed: 3, undone: 2 },
  test: { tested: 10, testFailed: 4 },
  setupIssues: { changesWithIssues: 3, totalIssues: 6, workflowsNeedingSetup: 2 },
  governance: { total: 50, success: 45, denied: 3, failed: 2 },
};

const zeroAggregate = {
  totalAgentChanges: 0,
  preview: { created: 0, applied: 0, keptAsPreview: 0, discarded: 0, applyFailed: 0, undone: 0 },
  test: { tested: 0, testFailed: 0 },
  setupIssues: { changesWithIssues: 0, totalIssues: 0, workflowsNeedingSetup: 0 },
  governance: { total: 0, success: 0, denied: 0, failed: 0 },
};

beforeEach(() => {
  aggregateMock.mockReset();
});

describe("getReactAgentMetrics", () => {
  it("assembles the count-only DTO from the aggregate", async () => {
    aggregateMock.mockResolvedValue(fullAggregate);
    const m = await getReactAgentMetrics({});
    expect(m.totals).toEqual({ agentChanges: 100, governanceEvents: 50 });
    expect(m.previewFunnel).toEqual({ created: 40, applied: 25, keptAsPreview: 5, discarded: 8, applyFailed: 3, undone: 2 });
    expect(m.testOutcomes).toEqual({ tested: 10, testFailed: 4 });
    expect(m.setupIssues).toEqual({ changesWithIssues: 3, totalIssues: 6, workflowsNeedingSetup: 2 });
    expect(m.governance).toEqual({ byOutcome: { success: 45, denied: 3, failed: 2 } });
  });

  it("returns zeros (never placeholders) for empty telemetry", async () => {
    aggregateMock.mockResolvedValue(zeroAggregate);
    const m = await getReactAgentMetrics({});
    expect(m.totals.agentChanges).toBe(0);
    expect(m.governance.byOutcome).toEqual({ success: 0, denied: 0, failed: 0 });
    expect(m.range).toEqual({ from: null, to: null });
  });

  it("normalizes valid ISO bounds and forwards them to the repository", async () => {
    aggregateMock.mockResolvedValue(zeroAggregate);
    const m = await getReactAgentMetrics({ from: "2026-06-01", to: "2026-06-30T12:00:00Z" });
    expect(aggregateMock).toHaveBeenCalledWith({
      from: "2026-06-01T00:00:00.000Z",
      to: "2026-06-30T12:00:00.000Z",
    });
    expect(m.range.from).toBe("2026-06-01T00:00:00.000Z");
    expect(m.range.to).toBe("2026-06-30T12:00:00.000Z");
  });

  it("treats empty-string bounds as no bound", async () => {
    aggregateMock.mockResolvedValue(zeroAggregate);
    await getReactAgentMetrics({ from: "", to: "  " });
    expect(aggregateMock).toHaveBeenCalledWith({ from: null, to: null });
  });

  it("rejects an unparseable date with MetricsRangeError (repo not called)", async () => {
    aggregateMock.mockResolvedValue(zeroAggregate);
    await expect(getReactAgentMetrics({ from: "not-a-date" })).rejects.toBeInstanceOf(MetricsRangeError);
    expect(aggregateMock).not.toHaveBeenCalled();
  });

  it("rejects from > to with MetricsRangeError", async () => {
    await expect(
      getReactAgentMetrics({ from: "2026-07-01", to: "2026-06-01" }),
    ).rejects.toBeInstanceOf(MetricsRangeError);
    expect(aggregateMock).not.toHaveBeenCalled();
  });

  it("NO-LEAK: the DTO is numbers-only even if the aggregate carried stray content", async () => {
    aggregateMock.mockResolvedValue({ ...fullAggregate, prompt: "SECRET", summary: "SECRET" });
    const m = await getReactAgentMetrics({});
    expect(JSON.stringify(m)).not.toMatch(/SECRET/);
  });
});
