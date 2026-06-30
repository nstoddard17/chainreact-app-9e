/**
 * @jest-environment node
 *
 * Tests for services/ai/events/recordAiRouteEvents.ts (Slice 4.AI-10).
 *
 * AI-10 reuses the COST-6 ledger + recorder. This emission layer maps apply/repair
 * RESULTS onto the existing recorder helpers. The recorder is mocked so we assert
 * the mapping (event types + safe args), fail-open behavior (a recorder throw
 * never propagates), and no-leak (raw patch config is never forwarded).
 *
 * (The legacy plan-route recorder + its planner-attribution tests were retired with
 * the planner service in HERMES-AGENT-RETIRE-LEGACY-PLAN-CHAT Phase 3.)
 */
import { readFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";

const recordAiCostEvent = jest.fn();
const recordAiModelCallCompleted = jest.fn();
const recordAiModelCallFailed = jest.fn();
const recordAiPatchOutcome = jest.fn();
const recordAiSafetyBlock = jest.fn();

jest.mock("@/services/billing/aiCostEvents", () => ({
  recordAiCostEvent: (...a: unknown[]) => recordAiCostEvent(...a),
  recordAiModelCallCompleted: (...a: unknown[]) => recordAiModelCallCompleted(...a),
  recordAiModelCallFailed: (...a: unknown[]) => recordAiModelCallFailed(...a),
  recordAiPatchOutcome: (...a: unknown[]) => recordAiPatchOutcome(...a),
  recordAiSafetyBlock: (...a: unknown[]) => recordAiSafetyBlock(...a),
}));

import {
  recordAiApplyOutcome,
  recordAiRepairOutcome,
} from "@/services/ai/events/recordAiRouteEvents";

function allCallArgs(): string {
  const calls = [
    recordAiCostEvent,
    recordAiModelCallCompleted,
    recordAiModelCallFailed,
    recordAiPatchOutcome,
    recordAiSafetyBlock,
  ].flatMap((m) => m.mock.calls);
  return JSON.stringify(calls);
}

beforeEach(() => {
  for (const m of [
    recordAiCostEvent,
    recordAiModelCallCompleted,
    recordAiModelCallFailed,
    recordAiPatchOutcome,
    recordAiSafetyBlock,
  ]) {
    m.mockReset();
    m.mockResolvedValue(undefined);
  }
});

describe("recordAiApplyOutcome — mapping", () => {
  it("maps a successful apply to ai_patch_applied", async () => {
    await recordAiApplyOutcome(
      { accountId: "acct-u1", userId: "u1", workflowId: "wf1" },
      { ok: true, appliedPatchId: "p1", appliedOperationCount: 2, riskLevel: "low" } as never,
    );
    expect(recordAiPatchOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "workflow_editing", patchId: "p1" }),
      "applied",
      expect.objectContaining({ metadata: expect.objectContaining({ opCount: 2, riskLevel: "low" }) }),
    );
  });

  it("returns the applied cost-event id (eval linkage) on success, null otherwise", async () => {
    recordAiPatchOutcome.mockResolvedValueOnce("evt-applied");
    await expect(
      recordAiApplyOutcome(
        { accountId: "acct-u1", userId: "u1", workflowId: "wf1" },
        { ok: true, appliedPatchId: "p1", appliedOperationCount: 1, riskLevel: "low" } as never,
      ),
    ).resolves.toBe("evt-applied");
    // A non-applied outcome links no event.
    await expect(
      recordAiApplyOutcome(
        { accountId: "acct-u1", userId: "u1", workflowId: "wf1", patchId: "p1" },
        { ok: false, code: "STALE_PATCH", message: "x" } as never,
      ),
    ).resolves.toBeNull();
  });

  it("maps CONFIRMATION_REQUIRED to a safety block", async () => {
    await recordAiApplyOutcome(
      { accountId: "acct-u1", userId: "u1", workflowId: "wf1", patchId: "p1" },
      { ok: false, code: "CONFIRMATION_REQUIRED", message: "x" } as never,
    );
    expect(recordAiSafetyBlock).toHaveBeenCalledWith(expect.anything(), "confirmation_required");
  });

  it("maps other apply failures to validation_failed with the code", async () => {
    await recordAiApplyOutcome(
      { accountId: "acct-u1", userId: "u1", workflowId: "wf1", patchId: "p1" },
      { ok: false, code: "STALE_PATCH", message: "x" } as never,
    );
    expect(recordAiPatchOutcome).toHaveBeenCalledWith(
      expect.anything(),
      "validation_failed",
      expect.objectContaining({ validationErrorCode: "STALE_PATCH" }),
    );
  });
});

describe("fail-open", () => {
  it("recordAiApplyOutcome resolves to null (never throws) when the recorder throws", async () => {
    recordAiPatchOutcome.mockRejectedValueOnce(new Error("ledger down"));
    await expect(
      recordAiApplyOutcome(
        { accountId: "acct-u1", userId: "u1", workflowId: "wf1" },
        { ok: true, appliedPatchId: "p1", appliedOperationCount: 1, riskLevel: "low" } as never,
      ),
    ).resolves.toBeNull();
  });
});

describe("recordAiRepairOutcome (AI-13) — mapping", () => {
  const SCOPE = { accountId: "acct-u1", userId: "u1", workflowId: "wf1", workflowRunId: "run-1" };

  const failureSummary = {
    failed: true,
    status: "failed" as const,
    isTest: false,
    failedNodeId: "n-slack",
    errorCode: "MISSING_REQUIRED_FIELD",
    classification: null,
  };

  const baseRepairable = {
    ok: true as const,
    workflowId: "wf1",
    workflowRunId: "run-1",
    failureSummary,
    repairability: "repairable" as const,
    reasonCode: "MISSING_REQUIRED_FIELD" as const,
    proposedPatch: {
      patchId: "repair:run-1",
      workflowId: "wf1",
      baseRevision: "rev",
      operations: [{ op: "updateNodeConfig" as const, nodeId: "n-slack", config: {} }],
      summary: "Repair proposal",
      rationale: "Missing required field.",
    },
    preview: { ok: true, workflowId: "wf1" } as never,
    requiredUserInput: [],
    recommendations: ["Fill the required field"],
    confidence: "medium" as const,
    safetyNotes: [],
    noMutation: true as const,
  };

  it("emits interaction_started + proposed + previewed for a repairable result with a preview-validated patch", async () => {
    await recordAiRepairOutcome(SCOPE, baseRepairable);
    // 1. Interaction (workflow_repair feature, scope includes workflowRunId + patchId).
    expect(recordAiCostEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        workflowId: "wf1",
        workflowRunId: "run-1",
        patchId: "repair:run-1",
        feature: "workflow_repair",
        eventType: "ai_interaction_started",
      }),
    );
    // 2. Patch proposed + previewed.
    expect(recordAiPatchOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "workflow_repair", patchId: "repair:run-1" }),
      "proposed",
      expect.objectContaining({
        metadata: expect.objectContaining({ opCount: 1, reasonCode: "MISSING_REQUIRED_FIELD" }),
      }),
    );
    expect(recordAiPatchOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "workflow_repair" }),
      "previewed",
      expect.anything(),
    );
    expect(recordAiModelCallCompleted).not.toHaveBeenCalled();
    expect(recordAiModelCallFailed).not.toHaveBeenCalled();
  });

  it("emits validation_failed for FAILED_PREVIEW (strategy proposed but preview rejected)", async () => {
    await recordAiRepairOutcome(SCOPE, {
      ...baseRepairable,
      repairability: "noSafeRepair",
      reasonCode: "FAILED_PREVIEW",
      proposedPatch: undefined,
      preview: undefined,
    });
    expect(recordAiPatchOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "workflow_repair", workflowRunId: "run-1" }),
      "validation_failed",
      expect.objectContaining({ validationErrorCode: "FAILED_PREVIEW" }),
    );
  });

  it("emits ai_safety_block_triggered with needs_user_input when the service asks for input", async () => {
    await recordAiRepairOutcome(SCOPE, {
      ...baseRepairable,
      repairability: "needsUserInput",
      reasonCode: "MISSING_REQUIRED_FIELD",
      proposedPatch: undefined,
      preview: undefined,
    });
    expect(recordAiSafetyBlock).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "workflow_repair", workflowRunId: "run-1" }),
      "needs_user_input",
      expect.objectContaining({ reasonCode: "MISSING_REQUIRED_FIELD" }),
    );
  });

  it("emits ai_safety_block_triggered with no_safe_repair for a recommendation-only outcome (e.g. BILLING_LIMIT)", async () => {
    await recordAiRepairOutcome(SCOPE, {
      ...baseRepairable,
      repairability: "noSafeRepair",
      reasonCode: "BILLING_LIMIT",
      proposedPatch: undefined,
      preview: undefined,
      recommendations: ["Upgrade your plan."],
    });
    expect(recordAiSafetyBlock).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "workflow_repair" }),
      "no_safe_repair",
      expect.objectContaining({ reasonCode: "BILLING_LIMIT" }),
    );
  });

  it("emits a validation_failed event for service-level NOT_FOUND so the funnel can count it", async () => {
    await recordAiRepairOutcome(SCOPE, {
      ok: false,
      code: "NOT_FOUND",
      message: "No run.",
      noMutation: true,
    });
    expect(recordAiPatchOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ feature: "workflow_repair", workflowRunId: "run-1" }),
      "validation_failed",
      expect.objectContaining({ validationErrorCode: "NOT_FOUND" }),
    );
    expect(recordAiCostEvent).not.toHaveBeenCalled(); // interaction_started is skipped on hard failure
  });

  it("emits a validation_failed event for service-level READ_FAILED", async () => {
    await recordAiRepairOutcome(SCOPE, {
      ok: false,
      code: "READ_FAILED",
      message: "Couldn't read.",
      noMutation: true,
    });
    expect(recordAiPatchOutcome).toHaveBeenCalledWith(
      expect.anything(),
      "validation_failed",
      expect.objectContaining({ validationErrorCode: "READ_FAILED" }),
    );
  });

  it("never has a RUNTIME import of a model client / planner / apply / repair service — only TYPE imports are allowed", () => {
    // The emission module owns mapping → ledger only. A future regression that
    // pulled in a runtime service binding (vs. a `import type {...}`) would
    // break this assertion. `import type` is fine: TypeScript erases it.
    const src = readFileSync(
      pathResolve(process.cwd(), "services/ai/events/recordAiRouteEvents.ts"),
      "utf8",
    );
    // Hard ban: any reference to a model adapter.
    expect(src).not.toMatch(/from\s+["']@\/core\/ai\/modelClient/);
    expect(src).not.toMatch(/from\s+["']@\/services\/ai\/modelClients/);
    // Soft ban: runtime (non-`import type`) imports of the AI services.
    const runtimeImport = (mod: string) =>
      new RegExp(`^import \\{[^}]*\\} from ["']${mod}["']`, "m");
    expect(src).not.toMatch(runtimeImport("@/services/ai/planner"));
    expect(src).not.toMatch(runtimeImport("@/services/ai/apply"));
    expect(src).not.toMatch(runtimeImport("@/services/ai/repair"));
  });

  it("is fail-open — a recorder throw never propagates", async () => {
    recordAiCostEvent.mockRejectedValueOnce(new Error("ledger down"));
    await expect(recordAiRepairOutcome(SCOPE, baseRepairable)).resolves.toBeUndefined();
  });

  it("no-leak: never forwards raw classification text / config values / secret-shaped values", async () => {
    const withSensitive = {
      ...baseRepairable,
      failureSummary: {
        ...failureSummary,
        classification: {
          title: "boom",
          description: "user-facing",
          severity: "error" as const,
        },
      },
      proposedPatch: {
        ...baseRepairable.proposedPatch,
        operations: [
          {
            op: "updateNodeConfig" as const,
            nodeId: "n-slack",
            config: {
              accessToken: "ya29.LEAKED-IN-CONFIG",
              text: "secret message body",
            },
          },
        ],
      },
    };
    await recordAiRepairOutcome(SCOPE, withSensitive);
    // The emission layer forwards only ids/counts/codes. Patch operations are
    // NOT forwarded as raw payload — only the opCount + reasonCode.
    const dump = allCallArgs();
    expect(dump).not.toContain("ya29.LEAKED-IN-CONFIG");
    expect(dump).not.toContain("accessToken");
    expect(dump).not.toContain("secret message body");
  });
});
