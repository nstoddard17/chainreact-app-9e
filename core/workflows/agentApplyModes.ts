import type { AgentApplyMode } from "@/contracts/agentApplyModes";
import type { FieldRiskCategory } from "@/core/workflows/fieldRiskClassifier";

/**
 * Deterministic availability of React Agent apply modes for an active edit preview
 * (REACT-AGENT-APPLY-MODES-1).
 *
 * The product wants the agent to feel smart AND safe: different changes should
 * offer different apply modes based on REAL checks — never model confidence. This
 * pure helper answers, for one active preview, which of `preview_only` /
 * `apply_to_draft` / `apply_and_test` are enabled, why a mode is disabled, and
 * whether a mode needs explicit confirmation or a warning.
 *
 * Inputs are all derived from existing deterministic signals (config diff
 * readiness, the field-risk classifier, the workflow lifecycle state, trigger
 * testability) — this module invents nothing. It is the single decision point so
 * the rail UI and any future surface can't drift on what's safe.
 *
 * Rules:
 *   - `preview_only` ("keep as preview") is ALWAYS available — the safe path when
 *     a change is dangerous or incomplete and the user wants to resolve blockers.
 *   - `apply_to_draft` is ALWAYS available because it only mutates the LOCAL draft
 *     (it never saves / runs / activates). It carries a setup warning when the
 *     end-state still has missing required fields, an activation warning when it
 *     changes the trigger of an active workflow, and requires confirmation for
 *     recipient / secret / connection changes.
 *   - `apply_and_test` requires (a) a READY candidate (no missing required fields /
 *     graph issues), (b) a TESTABLE workflow (manual trigger, viewer may run), and
 *     (c) NOT changing an activatable trigger on an active workflow (that needs the
 *     Reactivate → Resume lifecycle path, never an automatic test). It also
 *     requires confirmation for recipient / secret / connection changes.
 *
 * `core/` rule: imports only `contracts/` + client-safe `core/` helpers. Pure — no
 * React, no fetch, no services, no I/O.
 */

export type { AgentApplyMode };

export interface AgentApplyModeAvailability {
  readonly mode: AgentApplyMode;
  readonly enabled: boolean;
  readonly label: string;
  readonly description: string;
  /** Present only when `enabled` is false — a plain-English reason. */
  readonly disabledReason?: string;
  /** True when an enabled mode still needs an explicit user confirmation first. */
  readonly confirmationRequired?: boolean;
  /** A non-blocking caution shown alongside an enabled mode. */
  readonly warning?: string;
}

export interface ComputeAgentApplyModesInput {
  /** True for a general EDIT proposal (proposedDefinition present); false for an additive skeleton. */
  readonly isEditPreview: boolean;
  /** True when the proposed END-STATE has no error-severity readiness issues (missing-required / graph). */
  readonly candidateReady: boolean;
  /** The first blocking readiness reason (e.g. "Gmail needs a To."), when not ready. */
  readonly firstBlockingReason?: string;
  /** The live workflow is currently `active`. */
  readonly workflowActive: boolean;
  /** The change adds / removes / replaces a trigger or edits trigger config. */
  readonly triggerChanged: boolean;
  /** A safe test run is possible for this workflow (manual trigger AND viewer may run AND not local-only). */
  readonly canTest: boolean;
  /** When `canTest` is false, the plain-English reason (capability, not readiness). */
  readonly testDisabledReason?: string;
  /** Distinct high-risk categories among the changed fields (from the field-risk classifier). */
  readonly riskCategories: readonly FieldRiskCategory[];
}

/** Recipient / secret / connection changes are the ones that need an explicit confirm before applying. */
const CONFIRM_RISK_CATEGORIES: ReadonlySet<FieldRiskCategory> = new Set([
  "recipient",
  "secret",
  "connection",
]);

function needsConfirmation(categories: readonly FieldRiskCategory[]): boolean {
  return categories.some((c) => CONFIRM_RISK_CATEGORIES.has(c));
}

const ACTIVE_TRIGGER_CHANGE_REASON =
  "Changing the trigger on an active workflow needs Reactivate then Resume before you can test it.";
const SETUP_FALLBACK_REASON = "Finish the required setup before testing.";
const TEST_FALLBACK_REASON = "Test runs aren't available for this workflow yet.";

/**
 * Compute the availability of every apply mode for one active preview. Returns the
 * three modes in display order: apply_to_draft, apply_and_test, preview_only.
 * Discard remains a separate, always-available action owned by the caller.
 */
export function computeAgentApplyModes(
  input: ComputeAgentApplyModesInput,
): readonly AgentApplyModeAvailability[] {
  const confirm = needsConfirmation(input.riskCategories);
  const activeTriggerChange = input.workflowActive && input.triggerChanged;

  // apply_to_draft — always available (local-only mutation). Warning priority:
  // missing setup first (it blocks running), else the active-trigger caution.
  const draftWarning = !input.candidateReady
    ? "Some required fields still need setup before this can run."
    : activeTriggerChange
      ? "This changes the trigger. Saving will deactivate the live workflow until you reactivate it."
      : undefined;

  const applyToDraft: AgentApplyModeAvailability = {
    mode: "apply_to_draft",
    enabled: true,
    label: "Apply to draft",
    description: "Add this change to your draft. You still review fields and save.",
    ...(confirm ? { confirmationRequired: true } : {}),
    ...(draftWarning ? { warning: draftWarning } : {}),
  };

  // apply_and_test — gated on readiness, testability, and no active-trigger change.
  const testEnabled = input.candidateReady && input.canTest && !activeTriggerChange;
  const testDisabledReason = activeTriggerChange
    ? ACTIVE_TRIGGER_CHANGE_REASON
    : !input.candidateReady
      ? input.firstBlockingReason ?? SETUP_FALLBACK_REASON
      : !input.canTest
        ? input.testDisabledReason ?? TEST_FALLBACK_REASON
        : undefined;

  const applyAndTest: AgentApplyModeAvailability = {
    mode: "apply_and_test",
    enabled: testEnabled,
    label: "Apply and test",
    description: "Apply to your draft, save it, then run a safe test.",
    ...(testEnabled && confirm ? { confirmationRequired: true } : {}),
    ...(!testEnabled && testDisabledReason ? { disabledReason: testDisabledReason } : {}),
  };

  const previewOnly: AgentApplyModeAvailability = {
    mode: "preview_only",
    enabled: true,
    label: "Keep as preview",
    description: "Keep reviewing — nothing is applied to your workflow yet.",
  };

  return [applyToDraft, applyAndTest, previewOnly];
}
