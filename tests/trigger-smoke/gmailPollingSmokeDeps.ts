/**
 * Trigger-smoke harness — REAL Gmail polling deps (server-only test helper).
 *
 * Wires the injected `GmailPollingSmokeDeps` to the real V2 internals:
 *   - prepareLabel / sendMarkedEmail / applyLabel → the CERTIFIED gmail
 *     create_label / send_email / add_label action handlers (15/15
 *     action-certified account; same actionInput reuse pattern as the Excel
 *     polling deps).
 *   - sendMarkedAttachmentEmail → the PROVEN smoke multipart helper
 *     (stageGmailAttachmentMessage) from the action-smoke write harness —
 *     send_email has no attachments field, so the helper hand-builds the
 *     multipart/mixed RFC 5322 message with the marker-named attachment.
 *   - armPollingTrigger → the REAL registerWorkflowTriggers (runs the Gmail
 *     activation hook → usersGetProfile → seeds snapshot.historyId).
 *   - poll → the REAL per-trigger Gmail polling handler (the exact function
 *     the cron's runOne invokes), scoped to this trigger. The global
 *     runPollingTriggers() is intentionally NOT used (it would poll + fire
 *     every due polling workflow on the shared dev DB).
 *   - readSnapshotHistoryId / rewindSnapshot → trigger_resources config
 *     read/update (the rewind powers the dedup-vs-watermark isolation proof).
 *   - listRuns/readRun → service-role diagnostics readers; drainRun → the
 *     REAL durable-queue processQueuedRun.
 *   - trashMessage → usersMessagesTrash (recoverable; Gmail auto-purges
 *     trash after 30 days). deleteLabel → inline labels.delete call (no
 *     production wrapper exists — smoke-only cleanup, mirrors the wrapper
 *     shape, permanent label removal so 0 smoke labels leak).
 *   - cleanupWorkflow → unregisterWorkflowTriggers + soft-delete.
 *   - cleanupDedup → service-role delete of the (gmail, <prefixed-key>) row.
 *
 * Imported ONLY by the gated dev integration test. Never by app/server routes.
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { ActionHandlerInput } from "@/services/execution/handlers/types";
import type { WorkflowRecord } from "@/repositories/workflows";
import type { WorkflowDefinition } from "@/contracts/workflow";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { getActiveForExecution } from "@/repositories/integrations";
import {
  getByIdServiceRole,
  listByWorkflowServiceRole,
  type DiagnosticsRunRecord,
} from "@/repositories/workflowRunsDiagnostics";
import {
  registerWorkflowTriggers,
  unregisterWorkflowTriggers,
} from "@/services/triggers/lifecycle";
import { processQueuedRun } from "@/services/execution/runQueueProcessor";
import {
  refreshAndRetry,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import { sendEmail } from "@/integrations/gmail/actions/sendEmail";
import { createLabel } from "@/integrations/gmail/actions/createLabel";
import { addLabel } from "@/integrations/gmail/actions/addLabel";
import { usersMessagesTrash } from "@/integrations/gmail/api/usersMessagesTrash";
import { gmailNewEmailPollingHandler } from "@/integrations/gmail/triggers/newEmail/poll";
import { gmailNewLabeledEmailPollingHandler } from "@/integrations/gmail/triggers/newLabeledEmail/poll";
import { gmailNewAttachmentPollingHandler } from "@/integrations/gmail/triggers/newAttachment/poll";
import type { PollingHandler } from "@/services/triggers/pollingRegistry";
import {
  discoverGmailSelfAddress,
  stageGmailAttachmentMessage,
} from "@/tests/smoke-actions/writeHarnessDeps/gmail";
import type {
  GmailPollingRun,
  GmailPollingSmokeDeps,
} from "./gmailPollingSmoke";

export interface RealGmailPollingSmokeDepsConfig {
  readonly supabase: SupabaseClient;
  readonly accountId: string;
  readonly userId: string;
}

const POLLING_HANDLERS: Readonly<Record<string, PollingHandler>> = {
  new_email: gmailNewEmailPollingHandler,
  new_labeled_email: gmailNewLabeledEmailPollingHandler,
  new_attachment: gmailNewAttachmentPollingHandler,
};

function shortId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 8);
}

function minimalWorkflowRecord(
  workflowId: string,
  accountId: string,
  userId: string,
  definition: WorkflowDefinition,
): WorkflowRecord {
  return {
    id: workflowId,
    accountId,
    createdByUserId: userId,
    draftDefinition: definition,
  } as unknown as WorkflowRecord;
}

function mapStatus(s: string | null | undefined): GmailPollingRun["status"] {
  if (s === "succeeded" || s === "failed" || s === "running" || s === "queued") return s;
  return null;
}

function toSmokeRun(rec: DiagnosticsRunRecord): GmailPollingRun {
  const event = rec.triggerEvent ?? null;
  return {
    runId: rec.id,
    status: mapStatus(rec.status),
    triggerPayload: (event?.payload as Record<string, unknown> | undefined) ?? null,
    eventId: event?.eventId ?? null,
    eventType: event?.eventType ?? null,
  };
}

function gmailApiBase(): string {
  return process.env.GMAIL_API_BASE ?? "https://gmail.googleapis.com";
}

export function makeRealGmailPollingSmokeDeps(
  config: RealGmailPollingSmokeDepsConfig,
): GmailPollingSmokeDeps {
  const { supabase, accountId, userId } = config;

  // Setup event with provider "native" (NOT gmail) → each reused certified
  // handler falls back to null providerAccountId → resolves the ACTIVE Gmail
  // integration. Same pattern as the Excel polling deps.
  const setupEvent = (): TriggerEvent => ({
    provider: "native",
    eventType: "trigger-smoke.setup",
    eventId: randomUUID(),
    occurredAt: new Date().toISOString(),
    providerAccountId: "system",
    payload: {},
  });

  const actionInput = (cfg: Record<string, unknown>): ActionHandlerInput => ({
    workflowId: "trigger-smoke-setup",
    userId,
    accountId,
    runId: "trigger-smoke-setup",
    nodeId: "trigger-smoke-setup",
    config: cfg,
    triggerEvent: setupEvent(),
  });

  let cachedSelfAddress: string | null = null;
  async function selfAddress(): Promise<string> {
    if (cachedSelfAddress) return cachedSelfAddress;
    const self = await discoverGmailSelfAddress(accountId, userId);
    if (!self) {
      throw new Error("gmail-polling-smoke: Gmail is not connected / no self address.");
    }
    cachedSelfAddress = self.email;
    return cachedSelfAddress;
  }

  async function loadDefinition(workflowId: string): Promise<WorkflowDefinition> {
    const { data, error } = await supabase
      .from("workflows")
      .select("draft_definition")
      .eq("id", workflowId)
      .single<{ draft_definition: WorkflowDefinition }>();
    if (error || !data) {
      throw new Error(
        `gmail-polling-smoke loadDefinition failed: ${error?.message ?? "no row"}`,
      );
    }
    return data.draft_definition;
  }

  async function loadTriggerRow(workflowId: string, triggerNodeId: string) {
    const row = await triggerResourcesRepo.findByWorkflowAndNode(
      workflowId,
      triggerNodeId,
    );
    if (!row) {
      throw new Error("gmail-polling-smoke: trigger_resources row not found");
    }
    return row;
  }

  async function gmailCall<T>(fn: (accessToken: string) => Promise<T>): Promise<T> {
    const integration = await getActiveForExecution(accountId, "gmail", null);
    if (!integration) {
      throw new Error("gmail-polling-smoke: Gmail integration not active.");
    }
    return refreshAndRetry({
      accountId,
      provider: "gmail",
      providerAccountId: integration.providerAccountId,
      apiCall: fn,
    });
  }

  return {
    mintMarker(kind) {
      return `crsmoke-${kind}-${Date.now()}-${shortId()}`;
    },

    async prepareLabel(marker) {
      const labelName = `${marker}-label`;
      const res = await createLabel(actionInput({ name: labelName }));
      const labelId = (res.output as { labelId?: string }).labelId;
      if (!labelId) throw new Error("prepareLabel: create_label returned no labelId");
      return { labelId, labelName };
    },

    async createActiveSmokeWorkflow(workflow) {
      const { data, error } = await supabase
        .from("workflows")
        .insert({
          account_id: accountId,
          created_by_user_id: userId,
          name: workflow.name,
          state: "active",
          draft_definition: workflow.definition,
        })
        .select("id")
        .single<{ id: string }>();
      if (error || !data) {
        throw new Error(
          `gmail-polling-smoke createActiveSmokeWorkflow failed: ${error?.message ?? "no row"}`,
        );
      }
      return { workflowId: data.id };
    },

    async armPollingTrigger({ workflowId, triggerNodeId }) {
      const definition = await loadDefinition(workflowId);
      const record = minimalWorkflowRecord(workflowId, accountId, userId, definition);
      await registerWorkflowTriggers(record, definition);

      const row = await loadTriggerRow(workflowId, triggerNodeId);
      const snapshot = (row.config as { snapshot?: { historyId?: string } }).snapshot;
      return { snapshotHistoryId: snapshot?.historyId ?? null };
    },

    async poll({ workflowId, triggerNodeId }) {
      const row = await loadTriggerRow(workflowId, triggerNodeId);
      const handler = POLLING_HANDLERS[row.eventType];
      if (!handler || !handler.canHandle(row)) {
        throw new Error(
          `gmail-polling-smoke: no polling handler for event_type '${row.eventType}'`,
        );
      }
      await handler.poll({
        trigger: row,
        accountId: row.workflowAccountId ?? accountId,
        userRole: "default",
        now: Date.now(),
      });
    },

    async readSnapshotHistoryId({ workflowId, triggerNodeId }) {
      const row = await loadTriggerRow(workflowId, triggerNodeId);
      const snapshot = (row.config as { snapshot?: { historyId?: string } }).snapshot;
      return snapshot?.historyId ?? null;
    },

    async rewindSnapshot({ workflowId, triggerNodeId, historyId }) {
      const row = await loadTriggerRow(workflowId, triggerNodeId);
      const cfg = row.config as Record<string, unknown>;
      const snapshot = (cfg.snapshot ?? {}) as Record<string, unknown>;
      await triggerResourcesRepo.updateConfig(row.id, {
        ...cfg,
        snapshot: { ...snapshot, historyId },
      });
    },

    async sendMarkedEmail(marker) {
      const to = await selfAddress();
      const res = await sendEmail(
        actionInput({
          to,
          subject: marker,
          textBody: `${marker} ChainReact trigger-smoke self-send - safe to ignore`,
        }),
      );
      const messageId = (res.output as { id?: string }).id;
      if (!messageId) throw new Error("sendMarkedEmail: send_email returned no id");
      return { messageId };
    },

    async applyLabel({ messageId, labelId }) {
      await addLabel(actionInput({ messageId, labelIds: [labelId] }));
    },

    async sendMarkedAttachmentEmail(markerPrefix) {
      const staged = await stageGmailAttachmentMessage(accountId, userId, markerPrefix);
      if (!staged) {
        throw new Error(
          "sendMarkedAttachmentEmail: stageGmailAttachmentMessage returned null",
        );
      }
      return { messageId: staged.messageId, fileName: staged.fileName };
    },

    async listRuns(workflowId) {
      const runs = await listByWorkflowServiceRole(workflowId, {
        includeRunning: true,
        limit: 50,
      });
      return runs.map(toSmokeRun);
    },

    async drainRun(runId) {
      await processQueuedRun(runId);
    },

    async readRun(runId) {
      const rec = await getByIdServiceRole(runId);
      return rec ? toSmokeRun(rec) : null;
    },

    async cleanupWorkflow(workflowId) {
      const definition = await loadDefinition(workflowId).catch(() => null);
      if (definition) {
        const record = minimalWorkflowRecord(workflowId, accountId, userId, definition);
        await unregisterWorkflowTriggers(record).catch(() => {});
      }
      const { error } = await supabase
        .from("workflows")
        .update({ state: "deleted", deleted_at: new Date().toISOString() })
        .eq("id", workflowId);
      if (error) {
        console.warn(
          JSON.stringify({
            event: "trigger-smoke.gmail-polling.cleanup_failed",
            workflowId,
            error: error.message,
          }),
        );
      }
    },

    async trashMessage(messageId) {
      await gmailCall((accessToken) => usersMessagesTrash({ accessToken, messageId }));
    },

    async deleteLabel(labelId) {
      // Smoke-only cleanup: no production users.labels.delete wrapper exists
      // (no delete_label action is registered). Mirrors the wrapper shape —
      // 401 → Unauthorized401Error so refreshAndRetry can refresh + retry.
      await gmailCall(async (accessToken) => {
        const res = await fetch(
          `${gmailApiBase()}/gmail/v1/users/me/labels/${encodeURIComponent(labelId)}`,
          {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` },
          },
        );
        if (res.status === 401) {
          throw new Unauthorized401Error("Gmail users.labels.delete returned HTTP 401");
        }
        // 204 No Content on success; 404 means already gone — both fine for cleanup.
        if (!res.ok && res.status !== 404) {
          throw new Error(`Gmail labels.delete failed: HTTP ${res.status}`);
        }
      });
    },

    async cleanupDedup(eventKey) {
      const { error } = await supabase
        .from("webhook_event_dedup")
        .delete()
        .eq("provider", "gmail")
        .eq("event_id", eventKey);
      if (error) {
        console.warn(
          JSON.stringify({
            event: "trigger-smoke.gmail-polling.dedup_cleanup_failed",
            error: error.message,
          }),
        );
      }
    },

    async sleep(ms) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    },
  };
}
