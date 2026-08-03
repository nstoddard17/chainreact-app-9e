/** @jest-environment node */
/**
 * REACT-AGENT-APPLY-MODES-1 — apply-mode availability rules.
 *
 * Business rules under test (the agent must feel smart AND safe — availability is
 * decided by REAL checks, never model confidence):
 *   - preview_only ("keep as preview") is ALWAYS available.
 *   - apply_to_draft is ALWAYS available (local-only mutation) but carries a setup
 *     warning when incomplete, an activation warning on an active-trigger change,
 *     and requires confirmation for recipient/secret/connection changes.
 *   - apply_and_test requires a READY candidate, a TESTABLE workflow, and NOT
 *     changing an activatable trigger on an active workflow — otherwise it is
 *     disabled with the specific reason. It still confirms for risky changes.
 *
 * These map to the product's worked examples (incomplete → test disabled with the
 * field reason; recipient change → confirm; active-trigger change → review/lifecycle;
 * harmless label/layout → both apply modes free; ready manual draft → test enabled).
 */

import {
  computeAgentApplyModes,
  type AgentApplyMode,
  type AgentApplyModeAvailability,
  type ComputeAgentApplyModesInput,
} from "@/core/workflows/agentApplyModes";

function modesByName(
  result: readonly AgentApplyModeAvailability[],
): Record<AgentApplyMode, AgentApplyModeAvailability> {
  const out = {} as Record<AgentApplyMode, AgentApplyModeAvailability>;
  for (const m of result) out[m.mode] = m;
  return out;
}

/** A low-risk, complete, testable EDIT preview on a non-active workflow. */
const BASE: ComputeAgentApplyModesInput = {
  isEditPreview: true,
  candidateReady: true,
  workflowActive: false,
  triggerChanged: false,
  canTest: true,
  riskCategories: [],
};

describe("computeAgentApplyModes", () => {
  it("always returns the three modes in display order", () => {
    const result = computeAgentApplyModes(BASE);
    expect(result.map((m) => m.mode)).toEqual([
      "apply_to_draft",
      "apply_and_test",
      "preview_only",
    ]);
  });

  it("low-risk complete change: apply_to_draft and apply_and_test both enabled, no confirm/warning", () => {
    const m = modesByName(computeAgentApplyModes(BASE));
    expect(m.apply_to_draft.enabled).toBe(true);
    expect(m.apply_to_draft.confirmationRequired).toBeUndefined();
    expect(m.apply_to_draft.warning).toBeUndefined();
    expect(m.apply_and_test.enabled).toBe(true);
    expect(m.apply_and_test.disabledReason).toBeUndefined();
    expect(m.preview_only.enabled).toBe(true);
  });

  it("incomplete change: apply_to_draft stays enabled with a setup warning; apply_and_test disabled with the field reason", () => {
    const m = modesByName(
      computeAgentApplyModes({
        ...BASE,
        candidateReady: false,
        firstBlockingReason: "Gmail needs a To.",
      }),
    );
    expect(m.apply_to_draft.enabled).toBe(true);
    expect(m.apply_to_draft.warning).toBeTruthy();
    expect(m.apply_and_test.enabled).toBe(false);
    expect(m.apply_and_test.disabledReason).toBe("Gmail needs a To.");
  });

  it("incomplete change without a specific reason falls back to a generic setup message", () => {
    const m = modesByName(computeAgentApplyModes({ ...BASE, candidateReady: false }));
    expect(m.apply_and_test.enabled).toBe(false);
    expect(m.apply_and_test.disabledReason).toMatch(/setup|required/i);
  });

  it("recipient change: both apply modes require explicit confirmation", () => {
    const m = modesByName(computeAgentApplyModes({ ...BASE, riskCategories: ["recipient"] }));
    expect(m.apply_to_draft.confirmationRequired).toBe(true);
    expect(m.apply_and_test.enabled).toBe(true);
    expect(m.apply_and_test.confirmationRequired).toBe(true);
  });

  it("secret / connection changes also require confirmation", () => {
    const secret = modesByName(computeAgentApplyModes({ ...BASE, riskCategories: ["secret"] }));
    expect(secret.apply_to_draft.confirmationRequired).toBe(true);
    const conn = modesByName(computeAgentApplyModes({ ...BASE, riskCategories: ["connection"] }));
    expect(conn.apply_to_draft.confirmationRequired).toBe(true);
  });

  it("non-confirm risk categories (action_effect / trigger_config) do not force confirmation by themselves", () => {
    const m = modesByName(
      computeAgentApplyModes({ ...BASE, riskCategories: ["action_effect", "trigger_config"] }),
    );
    expect(m.apply_to_draft.confirmationRequired).toBeUndefined();
  });

  it("active-trigger change: apply_to_draft enabled with an activation warning; apply_and_test disabled (lifecycle path)", () => {
    const m = modesByName(
      computeAgentApplyModes({ ...BASE, workflowActive: true, triggerChanged: true }),
    );
    expect(m.apply_to_draft.enabled).toBe(true);
    expect(m.apply_to_draft.warning).toMatch(/deactivate|reactivate/i);
    expect(m.apply_and_test.enabled).toBe(false);
    expect(m.apply_and_test.disabledReason).toMatch(/Reactivate|Resume/i);
  });

  it("trigger change on a NON-active workflow does not block apply_and_test", () => {
    const m = modesByName(
      computeAgentApplyModes({ ...BASE, workflowActive: false, triggerChanged: true }),
    );
    expect(m.apply_and_test.enabled).toBe(true);
  });

  it("active-trigger change takes precedence over an incomplete reason on apply_and_test", () => {
    const m = modesByName(
      computeAgentApplyModes({
        ...BASE,
        workflowActive: true,
        triggerChanged: true,
        candidateReady: false,
        firstBlockingReason: "Gmail needs a To.",
      }),
    );
    expect(m.apply_and_test.disabledReason).toMatch(/Reactivate|Resume/i);
  });

  it("non-testable workflow (automated trigger): apply_and_test disabled with the capability reason", () => {
    const m = modesByName(
      computeAgentApplyModes({
        ...BASE,
        canTest: false,
        testDisabledReason: "Test runs are available only for manual-trigger workflows right now.",
      }),
    );
    expect(m.apply_and_test.enabled).toBe(false);
    expect(m.apply_and_test.disabledReason).toMatch(/manual-trigger/i);
    // apply_to_draft is unaffected by testability.
    expect(m.apply_to_draft.enabled).toBe(true);
  });

  it("additive skeleton (not an edit) with an unready candidate: apply_to_draft free, apply_and_test disabled", () => {
    const m = modesByName(
      computeAgentApplyModes({
        ...BASE,
        isEditPreview: false,
        candidateReady: false,
        firstBlockingReason: "Finish setting up the new steps before testing.",
      }),
    );
    expect(m.apply_to_draft.enabled).toBe(true);
    expect(m.apply_and_test.enabled).toBe(false);
  });

  it("harmless label/layout change (ready, low-risk): apply_to_draft has no warning and no confirm", () => {
    const m = modesByName(computeAgentApplyModes(BASE));
    expect(m.apply_to_draft.warning).toBeUndefined();
    expect(m.apply_to_draft.confirmationRequired).toBeUndefined();
  });
});
