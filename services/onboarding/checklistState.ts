import type {
  OnboardingChecklistDTO,
  OnboardingProviderEntry,
  OnboardingSelectedWorkflowDTO,
} from "@/contracts/onboarding";
import {
  MANUAL_TRIGGER_EVENT_TYPE,
  MANUAL_TRIGGER_PROVIDER,
} from "@/integrations/native/triggers/manualTrigger.schema";
import * as workflowsRepo from "@/repositories/workflows";
import * as runsRepo from "@/repositories/workflowRuns";
import * as onboardingRepo from "@/repositories/onboarding/userOnboardingStates";
import { diagnoseWorkflowConnections } from "@/services/diagnostics/integrationConnection";
import { checkWritePathReadiness } from "@/services/workflows/executionReadiness";
import {
  deriveChecklistSteps,
  workflowProvesPriorActivation,
  type SelectedWorkflowFacts,
} from "./checklistDerivation";
import { isOnboardingChecklistEnabled } from "./onboardingFlags";

/**
 * Onboarding checklist orchestration (5.ONBOARD-1 Batch 1).
 *
 * Gathers the authoritative facts (workflows list, connection diagnosis,
 * write-path readiness, run history, persisted presentation row), performs the
 * two server-side latches (first_shown_at; completion-by-evidence for accounts
 * that already activated), and returns the safe DTO. Callers MUST have
 * membership-resolved (userId, accountId) via `requireUserWithAccount` — this
 * service scopes strictly to that pair and never widens it.
 */

const WORKFLOW_OPTION_LIMIT = 50;

function hasManualTrigger(
  nodes: ReadonlyArray<{ provider: string; type: string }>,
): boolean {
  return nodes.some(
    (n) =>
      n.provider === MANUAL_TRIGGER_PROVIDER &&
      n.type === MANUAL_TRIGGER_EVENT_TYPE,
  );
}

function toProviderEntry(p: {
  provider: string;
  name: string | null;
  credentialClass: "personal" | "account";
  ready: boolean;
  reconnectNeeded: boolean;
  canReconnect: boolean;
}): OnboardingProviderEntry {
  // Personal-identity providers: any member may connect their OWN identity
  // (APPS-PERM-1), so canConnect is unconditionally true. Account/service
  // providers: the diagnosis' role-aware canReconnect is the authority.
  const canConnect = p.credentialClass === "personal" ? true : p.canReconnect;
  return {
    provider: p.provider,
    name: p.name,
    ready: p.ready,
    reconnectNeeded: p.reconnectNeeded,
    canConnect,
    adminRequired: p.credentialClass === "account" && !canConnect && !p.ready,
  };
}

async function buildSelectedFacts(
  userId: string,
  wf: workflowsRepo.WorkflowRecord,
): Promise<SelectedWorkflowFacts> {
  const nodes = wf.draftDefinition?.nodes ?? [];
  const edges = wf.draftDefinition?.edges ?? [];

  let providers: OnboardingProviderEntry[] = [];
  let allRequiredConnected: boolean | undefined;
  if (nodes.length > 0) {
    const connections = await diagnoseWorkflowConnections({
      subjectUserId: userId,
      workflowId: wf.id,
    });
    if (connections.access === "OK") {
      providers = (connections.providers ?? []).map(toProviderEntry);
      allRequiredConnected = connections.allRequiredConnected;
    }
  }

  const writePathReady =
    nodes.length > 0 && checkWritePathReadiness({ nodes, edges }) === null;

  const hasSucceededRun = await runsRepo.hasSucceededRunServiceRole(wf.id);
  let lastRunFailed = false;
  if (!hasSucceededRun) {
    const recent = await runsRepo.listByWorkflow(wf.id, { limit: 1 });
    lastRunFailed = recent[0]?.status === "failed";
  }

  return {
    id: wf.id,
    name: wf.name,
    state: wf.state,
    nodeCount: nodes.length,
    hasManualTrigger: hasManualTrigger(nodes),
    allRequiredConnected,
    providers,
    writePathReady,
    hasSucceededRun,
    lastRunFailed,
  };
}

export async function getOnboardingChecklist(input: {
  userId: string;
  accountId: string;
}): Promise<OnboardingChecklistDTO> {
  if (!isOnboardingChecklistEnabled()) {
    return { enabled: false };
  }
  const { userId, accountId } = input;

  const [row, workflows] = await Promise.all([
    onboardingRepo.getServiceRole(userId, accountId),
    workflowsRepo.listByAccountServiceRole(accountId, {
      limit: WORKFLOW_OPTION_LIMIT,
    }),
  ]);

  // ── Completion (already latched, or provable from lifecycle evidence) ──
  const evidence = workflows.find(workflowProvesPriorActivation) ?? null;
  let effectiveRow = row;
  if (!row?.completedAt && evidence) {
    // Existing-user / cross-member silent latch: no first-time celebration when
    // this user never saw the checklist (first_shown_at null). A user who HAS
    // seen it gets the normal celebration on their next load (e.g. the
    // activation-route latch failed fail-open, or a co-member activated).
    const silent = !row?.firstShownAt;
    await onboardingRepo.latchCompletionServiceRole({
      userId,
      accountId,
      workflowId: evidence.id,
      silent,
    });
    effectiveRow = await onboardingRepo.getServiceRole(userId, accountId);
  }

  if (effectiveRow?.completedAt) {
    const completionWf = effectiveRow.completionWorkflowId
      ? (workflows.find((w) => w.id === effectiveRow.completionWorkflowId) ??
        (await workflowsRepo.getByIdServiceRole(effectiveRow.completionWorkflowId)))
      : null;
    return {
      enabled: true,
      completed: true,
      completedAt: effectiveRow.completedAt,
      completionWorkflow:
        completionWf && completionWf.state !== "deleted"
          ? { id: completionWf.id, name: completionWf.name }
          : null,
      presentation: {
        dismissed: effectiveRow.dismissedAt !== null,
        minimized: effectiveRow.minimized,
        videoWatched: effectiveRow.videoWatchedAt !== null,
        celebrationPending: effectiveRow.celebratedAt === null,
      },
    };
  }

  // ── Selection: persisted pointer when still valid, else newest-updated. ──
  const persisted = effectiveRow?.selectedWorkflowId
    ? (workflows.find((w) => w.id === effectiveRow.selectedWorkflowId) ?? null)
    : null;
  const selected = persisted ?? workflows[0] ?? null;
  if (selected && selected.id !== effectiveRow?.selectedWorkflowId) {
    // Auto-repoint (deleted / cross-account-stale pointer). Best-effort — the
    // DTO already reflects the corrected selection.
    try {
      await onboardingRepo.updatePresentationServiceRole(userId, accountId, {
        selectedWorkflowId: selected.id,
      });
    } catch {
      /* presentation persistence must never break derivation */
    }
  }

  const facts = selected ? await buildSelectedFacts(userId, selected) : null;
  const derived = deriveChecklistSteps({
    hasAnyWorkflow: workflows.length > 0,
    selected: facts,
  });

  const dismissed = effectiveRow?.dismissedAt != null;
  if (!dismissed && !effectiveRow?.firstShownAt) {
    try {
      await onboardingRepo.latchFirstShownServiceRole(userId, accountId);
    } catch {
      /* fail-open */
    }
  }

  const selectedDto: OnboardingSelectedWorkflowDTO | null = facts
    ? {
        id: facts.id,
        name: facts.name,
        state: facts.state,
        testable: facts.hasManualTrigger,
      }
    : null;

  return {
    enabled: true,
    completed: false,
    completedAt: null,
    presentation: {
      dismissed,
      minimized: effectiveRow?.minimized ?? false,
      videoWatched: effectiveRow?.videoWatchedAt != null,
      celebrationPending: false,
    },
    selectedWorkflow: selectedDto,
    workflowOptions: workflows.map((w) => ({ id: w.id, name: w.name })),
    steps: derived.steps,
    completedStepCount: derived.completedStepCount,
    totalStepCount: derived.totalStepCount,
  };
}
