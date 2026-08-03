/** @jest-environment node */
/**
 * CR-FAILREASON-2 — the AI run-repair failure-summary classification action must
 * stay aligned with the shared 5-value taxonomy. This file compiles only if
 * `AiRepairFailureSummary.classification.action` accepts `retry_later` and
 * `contact_support` (it was a stale 3-value union before this slice).
 */
import type { AiRepairFailureSummary } from "@/lib/api/ai/runRepair";

describe("AiRepairFailureSummary action — shared taxonomy alignment", () => {
  it("accepts every value of the shared action taxonomy", () => {
    const actions = [
      "reconnect",
      "open_node",
      "retry_later",
      "upgrade_plan",
      "contact_support",
    ] as const;

    const summaries: AiRepairFailureSummary[] = actions.map((action) => ({
      failed: true,
      status: "failed",
      isTest: false,
      failedNodeId: null,
      errorCode: null,
      classification: { title: "t", description: "d", action, severity: "error" },
    }));

    expect(summaries).toHaveLength(5);
    expect(summaries.map((s) => s.classification?.action)).toEqual([
      "reconnect",
      "open_node",
      "retry_later",
      "upgrade_plan",
      "contact_support",
    ]);
  });
});
