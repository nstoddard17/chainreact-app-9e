/**
 * Trigger-smoke harness — REAL Microsoft OneNote polling deps (server-only helper).
 *
 * Wires the injected `OneNotePollingSmokeDeps` to the real V2 internals for the
 * OneNote note triggers (new_note / updated_note):
 *   - discoverSmokeSection → the existing `discoverOneNoteSmokeSection` guard (only
 *     a section whose name OR its notebook's name is smoke/test-named — NEVER a real
 *     notebook; null ⇒ SKIP). OneNote has no section DELETE, so the section is a
 *     borrowed operator-provisioned container; the smoke-owned resource is the PAGE.
 *   - createActiveSmokeWorkflow → service-role INSERT (state="active", null
 *     active_revision_id → live runs fall back to the draft).
 *   - createPage / updatePage / deletePage → the certified microsoft-onenote handlers.
 *   - confirmPageVisible → pagesGet bounded-retry (absorbs Graph create→read lag).
 *   - armPollingTrigger → the REAL registerWorkflowTriggers (runs the trigger's
 *     activation hook → seeds the timestamp-cursor snapshot).
 *   - poll → the REAL per-trigger OneNote poll handler (the fn runOne calls), scoped
 *     to this trigger. NOT the global runPollingTriggers().
 *   - listRuns/readRun → service-role reads (carrying trigger_event payload).
 *   - drainRun → the REAL durable-queue processQueuedRun.
 *   - cleanupWorkflow → unregisterWorkflowTriggers + soft-delete.
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
import { getByIdServiceRole } from "@/repositories/workflowRunsDiagnostics";
import {
  registerWorkflowTriggers,
  unregisterWorkflowTriggers,
} from "@/services/triggers/lifecycle";
import { processQueuedRun } from "@/services/execution/runQueueProcessor";
import { getActiveForExecution } from "@/repositories/integrations";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { NotFoundError } from "@/integrations/_shared/microsoft/api/errors";
import { pagesGet } from "@/integrations/microsoft-onenote/api/pagesGet";
import { createPage } from "@/integrations/microsoft-onenote/actions/createPage";
import { updatePage } from "@/integrations/microsoft-onenote/actions/updatePage";
import { deletePage } from "@/integrations/microsoft-onenote/actions/deletePage";
import { microsoftOneNoteNewNotePollingHandler } from "@/integrations/microsoft-onenote/triggers/newNote/poll";
import { microsoftOneNoteUpdatedNotePollingHandler } from "@/integrations/microsoft-onenote/triggers/updatedNote/poll";
import { discoverOneNoteSmokeSection } from "@/tests/smoke-actions/writeHarnessDeps/onenote";
import type {
  OneNotePollingSmokeDeps,
  OneNotePollingRun,
} from "./onenotePollingSmoke";

const PAGE_VISIBLE_ATTEMPTS = 6;
const PAGE_VISIBLE_SLEEP_MS = 1500;

export interface RealOneNotePollingSmokeDepsConfig {
  readonly supabase: SupabaseClient;
  readonly accountId: string;
  readonly userId: string;
}

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

function mapStatus(s: string | null | undefined): OneNotePollingRun["status"] {
  if (s === "succeeded" || s === "failed" || s === "running" || s === "queued") return s;
  return null;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function makeRealOneNotePollingSmokeDeps(
  config: RealOneNotePollingSmokeDepsConfig,
): OneNotePollingSmokeDeps {
  const { supabase, accountId, userId } = config;

  // provider "native" (NOT the action's provider) → each reused handler falls back
  // to null providerAccountId → resolves the account's ACTIVE OneNote integration.
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

  async function loadDefinition(workflowId: string): Promise<WorkflowDefinition> {
    const { data, error } = await supabase
      .from("workflows")
      .select("draft_definition")
      .eq("id", workflowId)
      .single<{ draft_definition: WorkflowDefinition }>();
    if (error || !data) {
      throw new Error(`onenote-polling-smoke loadDefinition failed: ${error?.message ?? "no row"}`);
    }
    return data.draft_definition;
  }

  return {
    async discoverSmokeSection() {
      const section = await discoverOneNoteSmokeSection(accountId, userId);
      if (!section) return null;
      return { sectionId: section.sectionId, notebookId: section.notebookId };
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
          `onenote-polling-smoke createActiveSmokeWorkflow failed: ${error?.message ?? "no row"}`,
        );
      }
      return { workflowId: data.id };
    },

    async createPage({ sectionId }) {
      const titleMarker = `crsmoke-${shortId()}-note`;
      const res = await createPage(
        actionInput({ sectionId, title: titleMarker, content: `${titleMarker} body` }),
      );
      const pageId = (res.output as { id?: string }).id;
      if (!pageId) throw new Error("onenote-polling-smoke createPage returned no id");
      return { pageId, titleMarker };
    },

    async confirmPageVisible({ pageId }) {
      const integration = await getActiveForExecution(accountId, "microsoft-onenote", null);
      if (!integration) throw new Error("onenote-polling-smoke: no active OneNote integration");
      for (let i = 0; i < PAGE_VISIBLE_ATTEMPTS; i += 1) {
        try {
          await refreshAndRetry({
            accountId,
            provider: "microsoft-onenote",
            providerAccountId: integration.providerAccountId,
            apiCall: (accessToken) => pagesGet({ accessToken, pageId }),
          });
          return;
        } catch (err) {
          if (!(err instanceof NotFoundError)) throw err;
          await sleep(PAGE_VISIBLE_SLEEP_MS);
        }
      }
      throw new Error("onenote-polling-smoke: seed page never became visible (propagation lag)");
    },

    async updatePage({ pageId }) {
      // Append a marker HTML fragment → bumps lastModifiedDateTime (the updated_note
      // cursor). Content is not surfaced in the trigger payload (no body / no bytes).
      await updatePage(
        actionInput({ pageId, updateMode: "append", content: `<p>crsmoke-${shortId()}-upd</p>` }),
      );
    },

    async armPollingTrigger({ workflowId, triggerNodeId }) {
      const definition = await loadDefinition(workflowId);
      const record = minimalWorkflowRecord(workflowId, accountId, userId, definition);
      await registerWorkflowTriggers(record, definition);
      const row = await triggerResourcesRepo.findByWorkflowAndNode(workflowId, triggerNodeId);
      if (!row) throw new Error("onenote-polling-smoke: trigger_resources row not found after arming");
      return { snapshotPresent: Boolean((row.config as { snapshot?: unknown }).snapshot) };
    },

    async poll({ workflowId, triggerNodeId }) {
      const row = await triggerResourcesRepo.findByWorkflowAndNode(workflowId, triggerNodeId);
      if (!row) throw new Error("onenote-polling-smoke: trigger_resources row not found for poll");
      const handler =
        row.eventType === "updated_note"
          ? microsoftOneNoteUpdatedNotePollingHandler
          : microsoftOneNoteNewNotePollingHandler;
      await handler.poll({
        trigger: row,
        accountId: row.workflowAccountId ?? accountId,
        userRole: "default",
        now: Date.now(),
      });
    },

    async listRuns(workflowId) {
      const { data, error } = await supabase
        .from("workflow_runs")
        .select("id,status,trigger_event")
        .eq("workflow_id", workflowId)
        .order("started_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(`onenote-polling-smoke listRuns failed: ${error.message}`);
      return (data ?? []).map((r) => {
        const row = r as { id: string; status: string; trigger_event: { payload?: Record<string, unknown> } | null };
        return {
          runId: row.id,
          status: mapStatus(row.status),
          triggerPayload: row.trigger_event?.payload ?? null,
        } satisfies OneNotePollingRun;
      });
    },

    async drainRun(runId) {
      await processQueuedRun(runId);
    },

    async readRun(runId) {
      const rec = await getByIdServiceRole(runId);
      if (!rec) return null;
      return { runId, status: mapStatus(rec.status), triggerPayload: null };
    },

    async deletePage(pageId) {
      await deletePage(actionInput({ pageId })).catch(() => {
        /* idempotent: a 404 / already-gone page is fine */
      });
    },

    async cleanupWorkflow(workflowId) {
      try {
        const definition = await loadDefinition(workflowId);
        const record = minimalWorkflowRecord(workflowId, accountId, userId, definition);
        await unregisterWorkflowTriggers(record);
      } catch {
        /* best-effort */
      }
      const { error } = await supabase
        .from("workflows")
        .update({ state: "deleted", deleted_at: new Date().toISOString() })
        .eq("id", workflowId);
      if (error) {
        console.warn(
          JSON.stringify({ event: "onenote-polling-smoke.cleanup_failed", workflowId, error: error.message }),
        );
      }
    },

    async sleep(ms) {
      await sleep(ms);
    },
  };
}
