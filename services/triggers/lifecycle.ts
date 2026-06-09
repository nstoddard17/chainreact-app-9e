import { getActiveForExecution } from "@/repositories/integrations";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import type { WorkflowRecord } from "@/repositories/workflows";
import type { WorkflowNode } from "@/contracts/workflow";
import { getTriggerMeta } from "@/services/discovery/_registry";
import {
  findActivation,
  findNativeActivation,
} from "@/services/triggers/activationRegistry";
import { findDeactivation } from "@/services/triggers/deactivationRegistry";
// Side-effect import: forces provider activation/polling-handler
// registrations at module load. Without this, an activate API request
// that loads the orchestrator → lifecycle module graph in isolation
// would see an empty activation registry and skip the snapshot init.
// (Slice 2f bug — surfaced first by the Gmail e2e walkthrough.)
import "@/integrations/_registry";

/**
 * Trigger lifecycle service.
 *
 * Per docs/rules/workflow-lifecycle.md §"V2 intended behavior":
 *   - registerTrigger runs BEFORE persisting state during activate / resume
 *     (from eligible_to_resume). A throw aborts the transition; the
 *     orchestrator wraps with TRIGGER_REGISTRATION_FAILED.
 *   - unregisterTrigger runs AFTER persisting state during disable / delete
 *     and is best-effort (the orchestrator swallows errors). Webhook
 *     dispatcher (1J.3) independently guards against disabled / deleted
 *     workflows.
 *
 * For Slack the registration is purely a DB record — Slack's Events API
 * uses one global webhook URL per app, so per-workflow registration lives
 * in trigger_resources alone. Providers that need per-workflow
 * subscriptions (Microsoft Graph, Stripe webhooks, etc.) extend this
 * service with provider-side API calls when their slice ships.
 *
 * Slice 2e — activation hook seam: a (provider, eventType) may register an
 * activation function via `activationRegistry`. When present, lifecycle
 * calls it BEFORE the upsert and merges its returned partial config into
 * the node's config. Polling triggers (Gmail new_email) use this to fetch
 * the initial historyId snapshot — without it, the first poll establishes
 * a baseline and silently drops events that arrived between activation
 * and the first poll (V1 CLAUDE.md "first poll miss" bug).
 *
 * Manual-only workflows register nothing — whether action-only (zero trigger
 * nodes) OR using the native `manual.run` trigger (which is not activatable, see
 * `isActivatableTrigger`). The precondition checks in services/triggers/
 * preconditions.ts still run.
 */

/**
 * Does this trigger node register a runtime dispatch resource? The native
 * `manual.run` trigger (meta `activation: "manual"`) does NOT: it fires only via
 * `POST /api/workflows/[id]/run-now`, which bypasses dispatch + trigger_resources
 * entirely (see integrations/native/triggers/manualTrigger.ts). Writing a
 * trigger_resources row for it produced an inert row no dispatch / polling /
 * receive / renewal reader ever consumes, so we skip it. UNKNOWN meta is treated
 * as activatable (fail-safe — assume it registers something).
 *
 * Mirrors `isActivatableTrigger` in services/workflows/saveDraftDefinition.ts
 * (the active-edit-stale-trigger guard) — same `activation: "manual"` classifier.
 */
function isActivatableTrigger(node: WorkflowNode): boolean {
  return getTriggerMeta(`${node.provider}:${node.type}`)?.activation !== "manual";
}

export async function registerWorkflowTriggers(
  workflow: WorkflowRecord,
): Promise<void> {
  const triggers = workflow.draftDefinition.nodes.filter(
    (n) => n.kind === "trigger" && isActivatableTrigger(n),
  );
  if (triggers.length === 0) return; // manual-only / action-only workflow

  for (const node of triggers) {
    let mergedConfig: Record<string, unknown> = { ...node.config };

    // Native (non-OAuth) activation path runs first — no integration
    // lookup. Used by scheduled_trigger (computes first nextFireAt) and
    // any future native triggers that need activation-time work.
    const nativeActivation = findNativeActivation(node.provider, node.type);
    if (nativeActivation) {
      const patch = await nativeActivation({
        node,
        workflowId: workflow.id,
      });
      mergedConfig = { ...mergedConfig, ...patch };
    } else {
      // Provider-tier activation path — requires an active integration.
      // Slice 4.ACCOUNT-MODEL-6: integration lookup is account-keyed; uses
      // the workflow's owner account (workflow.accountId from foundation
      // slice -5). Cross-account integration use rejects naturally — if
      // the account has no integration for the provider, this throws and
      // the activation precondition surfaces the same error to the user.
      const activation = findActivation(node.provider, node.type);
      if (activation) {
        const integration = await getActiveForExecution(
          workflow.accountId,
          node.provider,
          null,
        );
        if (!integration) {
          throw new Error(
            `registerWorkflowTriggers: no active ${node.provider} integration for account ${workflow.accountId}.`,
          );
        }
        const patch = await activation({
          node,
          integration,
          workflowId: workflow.id,
        });
        mergedConfig = { ...mergedConfig, ...patch };
      }
    }

    await triggerResourcesRepo.upsert({
      workflowId: workflow.id,
      userId: workflow.createdByUserId,
      provider: node.provider,
      eventType: node.type,
      nodeId: node.id,
      config: mergedConfig,
      // accountId is resolved later via the user's integrations row when the
      // dispatcher needs it; storing null here keeps registration cheap and
      // avoids a stale account_id when the user reconnects with a new account.
    });
  }
}

export async function unregisterWorkflowTriggers(
  workflow: WorkflowRecord,
): Promise<void> {
  // Run any provider-specific deactivation hooks BEFORE deleting rows so
  // the provider stops sending events / cancels the subscription. Failures
  // are best-effort logged — the trigger_resources row deletion still
  // happens (the user's "disable" action is what they care about; cleaning
  // up the provider-side subscription is housekeeping).
  //
  // Slack and polling-only providers (Gmail) don't register here, so this
  // loop is a no-op for them and the existing behavior is preserved.
  const triggers = await triggerResourcesRepo.listByWorkflow(workflow.id);
  for (const trigger of triggers) {
    const deactivation = findDeactivation(trigger.provider, trigger.eventType);
    if (!deactivation) continue;

    try {
      // Slice 4.ACCOUNT-MODEL-6: account-keyed lookup. Uses the
      // workflow's owner account (passed in), not trigger.userId
      // (provenance only). `trigger.accountId` here is the PROVIDER
      // account scope (Slack team_id), distinct from workflow.accountId
      // (V2 owner account).
      const integration = await getActiveForExecution(
        workflow.accountId,
        trigger.provider,
        trigger.providerAccountId ?? null,
      );
      if (!integration) continue;
      await deactivation({ trigger, integration });
    } catch (err) {
      console.warn(
        JSON.stringify({
          event: "trigger.deactivation.error",
          workflowId: workflow.id,
          provider: trigger.provider,
          eventType: trigger.eventType,
          nodeId: trigger.nodeId,
          error: (err as Error).message,
        }),
      );
    }
  }

  await triggerResourcesRepo.deleteByWorkflow(workflow.id);
}
