import type {
  OnboardingProviderEntry,
  OnboardingStepDTO,
  OnboardingStepKey,
} from "@/contracts/onboarding";

/**
 * PURE checklist-step derivation (5.ONBOARD-1). No I/O — the orchestration
 * layer (checklistState.ts) gathers facts from the authoritative sources and
 * this module composes them into step DTOs. Keeping it pure makes the honesty
 * rules unit-testable across the full state matrix.
 *
 * Completion sources (one existing source of truth per step — never a parallel
 * validator):
 *   create    → ≥1 non-deleted workflow in the account
 *   connect   → selected workflow has nodes AND diagnoseWorkflowConnections
 *               `allRequiredConnected` (vacuously true for native-only graphs)
 *   configure → checkWritePathReadiness(draft) === null
 *   test      → a real workflow_runs row with status='succeeded' (test or live)
 *   activate  → selected workflow state === 'active' exactly
 */

/** Minimal projection of the selected workflow the derivation needs. */
export interface SelectedWorkflowFacts {
  readonly id: string;
  readonly name: string;
  readonly state: string;
  readonly nodeCount: number;
  readonly hasManualTrigger: boolean;
  /** From diagnoseWorkflowConnections (undefined when the graph has no nodes). */
  readonly allRequiredConnected: boolean | undefined;
  readonly providers: readonly OnboardingProviderEntry[];
  /** True when checkWritePathReadiness returned null. */
  readonly writePathReady: boolean;
  readonly hasSucceededRun: boolean;
  /** True when the most recent terminal run failed (safe hint for the Test step). */
  readonly lastRunFailed: boolean;
}

export interface DerivedChecklist {
  readonly steps: readonly OnboardingStepDTO[];
  readonly completedStepCount: number;
  readonly totalStepCount: number;
}

/**
 * Derive the five steps. `hasAnyWorkflow` covers step 1 even when no workflow
 * is selectable (all deleted mid-session). `selected === null` leaves steps
 * 2–5 pending with step 1 (or nothing) current.
 */
export function deriveChecklistSteps(input: {
  hasAnyWorkflow: boolean;
  selected: SelectedWorkflowFacts | null;
}): DerivedChecklist {
  const { hasAnyWorkflow, selected } = input;

  const createDone = hasAnyWorkflow;
  const emptyGraph = selected !== null && selected.nodeCount === 0;

  // connect: never "complete" for an empty graph — zero required providers is
  // only meaningful once the workflow has steps.
  //
  // A provider flagged `needs_reconnect` also blocks completion even when the
  // connection-diagnosis `ready` ladder still reports OK: that persisted flag
  // is set at the execution seam when the credential actually failed, so
  // treating the step as complete would show a green "connected" tick for a
  // connection the next run will fail on — precisely the stale completion this
  // checklist must never display.
  const connectDone =
    selected !== null &&
    selected.nodeCount > 0 &&
    selected.allRequiredConnected === true &&
    selected.providers.every((p) => !p.reconnectNeeded);
  const configureDone = selected !== null && selected.writePathReady;
  const testDone = selected !== null && selected.hasSucceededRun;
  const activateDone = selected !== null && selected.state === "active";

  const doneByKey: Record<OnboardingStepKey, boolean> = {
    create: createDone,
    connect: connectDone,
    configure: configureDone,
    test: testDone,
    activate: activateDone,
  };

  // The "current" step is the first incomplete one the user can act on. With an
  // empty graph the actionable next move is building steps (configure), not
  // connecting apps for a workflow that doesn't require any yet. An automated
  // (non-testable) workflow whose only remaining gap is the run confirmation
  // points at activate instead — the honest path (locked decision #8).
  const order: OnboardingStepKey[] = [
    "create",
    "connect",
    "configure",
    "test",
    "activate",
  ];
  let currentKey: OnboardingStepKey | null = null;
  for (const key of order) {
    if (doneByKey[key]) continue;
    // Without a selected workflow, steps 2–5 cannot be evaluated or acted on —
    // only "create" may be current.
    if (selected === null && key !== "create") break;
    if (key === "connect" && emptyGraph) continue;
    if (key === "test" && selected !== null && !selected.hasManualTrigger && !activateDone) {
      // Automated trigger with no test path yet: activation is the actionable step.
      continue;
    }
    currentKey = key;
    break;
  }
  // Everything else done but an automated workflow still waiting on its first
  // run: keep "test" current so the card shows the waiting state.
  if (currentKey === null && !testDone && selected !== null) {
    currentKey = "test";
  }

  const statusFor = (key: OnboardingStepKey): OnboardingStepDTO["status"] => {
    if (doneByKey[key]) return "complete";
    if (key === currentKey) return "current";
    return "pending";
  };

  const connectStep: OnboardingStepDTO = {
    key: "connect",
    status: statusFor("connect"),
    ...(selected && selected.providers.length > 0
      ? { providers: selected.providers }
      : {}),
    ...(emptyGraph && !connectDone
      ? { blockedReason: "add_steps_first" as const }
      : {}),
  };
  // Escalate the blocked reasons the UI must explain: an unhealthy connection
  // the user can fix (reconnect) vs one an owner/admin must handle.
  if (!connectDone && selected && selected.providers.length > 0) {
    // "Not usable" = the readiness ladder says no OR the persisted
    // needs-reconnect flag is set (the latter can coexist with ready===true).
    const notReady = selected.providers.filter((p) => !p.ready || p.reconnectNeeded);
    if (notReady.some((p) => p.adminRequired)) {
      (connectStep as { blockedReason?: string }).blockedReason = "admin_required";
    } else if (notReady.some((p) => p.reconnectNeeded)) {
      (connectStep as { blockedReason?: string }).blockedReason =
        "reconnect_required";
    }
  }

  const waitingForFirstRun =
    selected !== null && !testDone && !selected.hasManualTrigger && activateDone;

  const steps: OnboardingStepDTO[] = [
    { key: "create", status: statusFor("create") },
    connectStep,
    { key: "configure", status: statusFor("configure") },
    {
      key: "test",
      status: statusFor("test"),
      testable: selected?.hasManualTrigger ?? false,
      ...(waitingForFirstRun ? { waitingForFirstRun: true } : {}),
      ...(selected?.lastRunFailed && !testDone ? { lastRunFailed: true } : {}),
    },
    { key: "activate", status: statusFor("activate") },
  ];

  // Blocked status renders distinctly (permission/reconnect) without losing
  // "current" targeting: a blocked step that is also the current step stays
  // "blocked" — the UI highlights it with the blocked treatment.
  const finalSteps = steps.map((s) =>
    s.blockedReason && s.status !== "complete" ? { ...s, status: "blocked" as const } : s,
  );

  return {
    steps: finalSteps,
    completedStepCount: finalSteps.filter((s) => s.status === "complete").length,
    totalStepCount: finalSteps.length,
  };
}

/**
 * Ever-activated evidence for an account's workflows (existing-user handling,
 * locked decision #6 + task "Existing accounts"). VERIFIED against the
 * lifecycle layer: `applyTransition` only writes `active_revision_id` when a
 * transition explicitly passes it (repositories/workflows.ts:572), and
 * pause/disable/eligible_to_resume transitions never do — so a non-null
 * `active_revision_id` survives those states. Activation CAN succeed with a
 * failed revision snapshot (orchestrator persists `active_revision_id = null`),
 * which the state-set arm covers. Either arm alone under-counts; the OR is the
 * evidence.
 */
export function workflowProvesPriorActivation(wf: {
  state: string;
  activeRevisionId: string | null;
}): boolean {
  return workflowActivationEvidenceRank(wf) > 0;
}

/**
 * Strength of a workflow's prior-activation evidence (0 = none).
 *
 * Used to pick ONE deterministic completion-provenance workflow when several
 * qualify (provenance correction, 2026-07-19). Ranked strongest-first:
 *   2 — `state === "active"`: live, currently-running proof.
 *   1 — was-active lifecycle states, or a draft carrying `active_revision_id`
 *       (a revision is only stamped by an activation transition).
 * Ties are broken by the caller taking the FIRST match over an
 * `updated_at DESC` list ⇒ strongest, then most recently updated.
 */
export function workflowActivationEvidenceRank(wf: {
  state: string;
  activeRevisionId: string | null;
}): number {
  if (wf.state === "active") return 2;
  if (
    wf.state === "paused" ||
    wf.state === "disabled" ||
    wf.state === "eligible_to_resume" ||
    wf.activeRevisionId !== null
  ) {
    return 1;
  }
  return 0;
}

/**
 * Pick the completion-provenance workflow from an `updated_at DESC` list:
 * highest evidence rank wins; the first (most recently updated) of that rank
 * breaks ties. Returns null when nothing proves prior activation.
 */
export function pickActivationEvidenceWorkflow<
  T extends { state: string; activeRevisionId: string | null },
>(workflowsNewestFirst: readonly T[]): T | null {
  let best: T | null = null;
  let bestRank = 0;
  for (const wf of workflowsNewestFirst) {
    const rank = workflowActivationEvidenceRank(wf);
    // Strict `>` keeps the FIRST (most recently updated) workflow of a rank.
    if (rank > bestRank) {
      best = wf;
      bestRank = rank;
    }
  }
  return best;
}
