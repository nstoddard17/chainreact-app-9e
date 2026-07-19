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
 * ACCOUNT-LEVEL (5.ONBOARD-2). The checklist teaches five core actions for the
 * ACCOUNT, not for one chosen workflow. A step is complete when ANY non-deleted
 * workflow in the account satisfies it, and different workflows may satisfy
 * different steps — a user who connected apps on workflow A and ran workflow B
 * has genuinely learned both actions, so demanding one workflow do all five
 * would under-report real progress.
 *
 * Completion sources (one existing source of truth per step — never a parallel
 * validator, and never a stored "step done" boolean):
 *   create    → ≥1 non-deleted workflow in the account
 *   connect   → SOME workflow has nodes AND diagnoseWorkflowConnections
 *               `allRequiredConnected`, with no provider needing reconnect
 *   configure → SOME workflow has checkWritePathReadiness(draft) === null
 *   test      → SOME workflow has a real workflow_runs row status='succeeded'
 *   activate  → SOME workflow has state === 'active' exactly
 */

/** Minimal projection of ONE account workflow the derivation needs. */
export interface WorkflowChecklistFacts {
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

/** Does THIS workflow satisfy the connect step? (see deriveChecklistSteps) */
function workflowConnectDone(w: WorkflowChecklistFacts): boolean {
  // Never "complete" for an empty graph — zero required providers is only
  // meaningful once the workflow has steps.
  //
  // A provider flagged `needs_reconnect` also blocks completion even when the
  // connection-diagnosis `ready` ladder still reports OK: that persisted flag
  // is set at the execution seam when the credential actually failed, so
  // treating the step as complete would show a green "connected" tick for a
  // connection the next run will fail on — precisely the stale completion this
  // checklist must never display.
  return (
    w.nodeCount > 0 &&
    w.allRequiredConnected === true &&
    w.providers.every((p) => !p.reconnectNeeded)
  );
}

/**
 * Per-step "closeness" score for CTA targeting (0 = not a candidate at all).
 *
 * The CTA must land the user on the workflow where the step is easiest to
 * finish, so each score ranks how near a workflow is to satisfying the step.
 * Already-satisfying workflows score highest, so a completed step's CTA points
 * at the workflow that actually proves it.
 *
 * Ties are resolved by the CALLER taking the first match over an
 * `updated_at DESC` list ⇒ most recently updated wins. That makes targeting
 * fully deterministic for a given account state — no randomness, no hidden
 * persisted pointer.
 */
function stepCloseness(key: OnboardingStepKey, w: WorkflowChecklistFacts): number {
  switch (key) {
    case "create":
      // Never targets an existing workflow — the CTA opens the create chooser.
      return 0;
    case "connect": {
      if (w.nodeCount === 0) return 0; // nothing to connect yet
      if (workflowConnectDone(w)) return 4;
      const total = w.providers.length;
      if (total === 0) return 1;
      const usable = w.providers.filter((p) => p.ready && !p.reconnectNeeded).length;
      // 1..3 by how much of the provider set is already healthy, and prefer a
      // gap this user can actually fix over one needing an owner/admin.
      const fixableByUser = w.providers.some((p) => !p.ready && p.canConnect);
      return 1 + (usable / total) + (fixableByUser ? 1 : 0);
    }
    case "configure": {
      if (w.writePathReady) return 3;
      if (w.nodeCount === 0) return 1; // an empty draft is still the place to build
      return 2; // has steps but not yet write-path ready — closest to done
    }
    case "test": {
      if (w.hasSucceededRun) return 4;
      if (!w.writePathReady) return w.nodeCount > 0 ? 1 : 0;
      // Write-path ready: a manual trigger means the user can test right now.
      return w.hasManualTrigger ? 3 : 2;
    }
    case "activate": {
      if (w.state === "active") return 4;
      if (!w.writePathReady) return w.nodeCount > 0 ? 1 : 0;
      return workflowConnectDone(w) ? 3 : 2;
    }
  }
}

/**
 * Pick the CTA target for a step: highest closeness wins; the first workflow of
 * that score in an `updated_at DESC` list breaks ties. Returns null when no
 * workflow is a candidate — the UI then routes the user to create one.
 */
export function pickStepTarget(
  key: OnboardingStepKey,
  workflowsNewestFirst: readonly WorkflowChecklistFacts[],
): WorkflowChecklistFacts | null {
  let best: WorkflowChecklistFacts | null = null;
  let bestScore = 0;
  for (const w of workflowsNewestFirst) {
    const score = stepCloseness(key, w);
    // Strict `>` keeps the FIRST (most recently updated) workflow of a score.
    if (score > bestScore) {
      best = w;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Derive the five steps from EVERY workflow in the account.
 *
 * A step is complete when any workflow satisfies it; the steps are independent,
 * so different workflows may satisfy different steps. An empty list leaves all
 * five pending with `create` current.
 */
export function deriveChecklistSteps(input: {
  /** Account workflows, `updated_at DESC` (the repo's natural order). */
  workflows: readonly WorkflowChecklistFacts[];
}): DerivedChecklist {
  const workflows = input.workflows;

  const createDone = workflows.length > 0;
  // "Empty graph" is an account-level notion now: nothing anywhere has steps,
  // so connecting apps is not yet the actionable move.
  const emptyGraph = createDone && workflows.every((w) => w.nodeCount === 0);

  const connectDone = workflows.some(workflowConnectDone);
  const configureDone = workflows.some((w) => w.writePathReady);
  const testDone = workflows.some((w) => w.hasSucceededRun);
  const activateDone = workflows.some((w) => w.state === "active");

  // The workflow each step's CTA should open. Computed once so the step DTO and
  // the UI agree, and so targeting stays a pure function of account state.
  const targetFor: Record<OnboardingStepKey, WorkflowChecklistFacts | null> = {
    create: null,
    connect: pickStepTarget("connect", workflows),
    configure: pickStepTarget("configure", workflows),
    test: pickStepTarget("test", workflows),
    activate: pickStepTarget("activate", workflows),
  };

  // Step-scoped views used by the per-step detail below. The connect step shows
  // the provider set of the workflow its CTA will open — not a union across the
  // account, which would list apps the user is not being sent to fix.
  const connectTarget = targetFor.connect;
  const testTarget = targetFor.test;
  const selected = connectTarget; // provider detail source (may be null)

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
    // With no workflows at all, steps 2–5 cannot be evaluated or acted on —
    // only "create" may be current.
    if (!createDone && key !== "create") break;
    if (key === "connect" && emptyGraph) continue;
    if (key === "test" && testTarget !== null && !testTarget.hasManualTrigger && !activateDone) {
      // The best testable candidate has no manual-trigger test path yet:
      // activation is the actionable step.
      continue;
    }
    currentKey = key;
    break;
  }
  // Everything else done but an automated workflow still waiting on its first
  // run: keep "test" current so the card shows the waiting state.
  if (currentKey === null && !testDone && createDone) {
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
    testTarget !== null && !testDone && !testTarget.hasManualTrigger && activateDone;

  const ctaId = (key: OnboardingStepKey) => {
    const t = targetFor[key];
    return t ? { ctaWorkflowId: t.id, ctaWorkflowName: t.name } : {};
  };

  const steps: OnboardingStepDTO[] = [
    { key: "create", status: statusFor("create") },
    { ...connectStep, ...ctaId("connect") },
    { key: "configure", status: statusFor("configure"), ...ctaId("configure") },
    {
      key: "test",
      status: statusFor("test"),
      testable: testTarget?.hasManualTrigger ?? false,
      ...ctaId("test"),
      ...(waitingForFirstRun ? { waitingForFirstRun: true } : {}),
      ...(testTarget?.lastRunFailed && !testDone ? { lastRunFailed: true } : {}),
    },
    { key: "activate", status: statusFor("activate"), ...ctaId("activate") },
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
