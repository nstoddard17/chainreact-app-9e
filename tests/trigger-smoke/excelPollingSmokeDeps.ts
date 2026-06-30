/**
 * Trigger-smoke harness — REAL Microsoft Excel polling deps (server-only helper).
 *
 * Wires the injected `ExcelPollingSmokeDeps` to the real V2 internals:
 *   - createSmokeWorkbook → the certified microsoft-onedrive:upload_file handler
 *     with the frozen MINIMAL_XLSX_BASE64 asset (smoke-owned, one "Sheet1").
 *   - createActiveSmokeWorkflow → service-role INSERT (state="active",
 *     draft_definition, null active_revision_id → live runs fall back to draft).
 *   - armPollingTrigger → the REAL registerWorkflowTriggers (runs the
 *     new_worksheet activation hook → fetches worksheets → seeds the snapshot),
 *     then reads the seeded snapshot names back from trigger_resources.
 *   - poll → the REAL microsoftExcelPollingHandler.poll(...) scoped to this smoke
 *     trigger — the exact per-trigger dispatch the cron orchestrator's runOne
 *     calls (read worksheets → diff vs snapshot → enqueueRun). The global
 *     runPollingTriggers() shell is intentionally NOT used (it would poll + fire
 *     other accounts' due workflows on the shared dev DB).
 *   - addWorksheet → the certified microsoft-excel:create_worksheet handler.
 *   - listRuns/readRun → service-role reads (incl. trigger_event payload).
 *   - drainRun → the REAL durable-queue processQueuedRun.
 *   - cleanup → unregisterWorkflowTriggers + microsoft-onedrive:delete_item
 *     (whole workbook → recycle bin) + service-role soft-delete of the workflow.
 *
 * Imported ONLY by the gated dev integration test. Never by app/server routes.
 */
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TriggerEvent } from "@/contracts/triggerEvent";
import type { ActionHandlerInput } from "@/services/execution/handlers/types";
import type { WorkflowRecord } from "@/repositories/workflows";
import * as triggerResourcesRepo from "@/repositories/triggerResources";
import { getByIdServiceRole } from "@/repositories/workflowRunsDiagnostics";
import {
  registerWorkflowTriggers,
  unregisterWorkflowTriggers,
} from "@/services/triggers/lifecycle";
import { processQueuedRun } from "@/services/execution/runQueueProcessor";
import { uploadFile } from "@/integrations/microsoft-onedrive/actions/uploadFile";
import { deleteItem } from "@/integrations/microsoft-onedrive/actions/deleteItem";
import { createWorksheet } from "@/integrations/microsoft-excel/actions/createWorksheet";
import { microsoftExcelPollingHandler } from "@/integrations/microsoft-excel/triggers/_shared/pollingHandler";
import { ExcelNewWorksheetConfigSchema } from "@/integrations/microsoft-excel/triggers/newWorksheet/schema";
import { MINIMAL_XLSX_BASE64 } from "@/tests/smoke-actions/minimalXlsx";
import {
  buildExcelNewWorksheetSmokeWorkflow,
  type ExcelPollingSmokeDeps,
  type ExcelPollingRun,
  type ExcelPollingSmokeWorkflow,
} from "./excelPollingSmoke";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface RealExcelPollingSmokeDepsConfig {
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
  workflow: ExcelPollingSmokeWorkflow,
): WorkflowRecord {
  return {
    id: workflowId,
    accountId,
    createdByUserId: userId,
    draftDefinition: workflow.definition,
  } as unknown as WorkflowRecord;
}

function mapStatus(s: string | null | undefined): ExcelPollingRun["status"] {
  if (s === "succeeded" || s === "failed" || s === "running" || s === "queued") return s;
  return null;
}

export function makeRealExcelPollingSmokeDeps(
  config: RealExcelPollingSmokeDepsConfig,
): ExcelPollingSmokeDeps {
  const { supabase, accountId, userId } = config;

  // A setup event whose provider is "native" (NOT the action's provider) so each
  // reused action handler falls back to null providerAccountId → resolves the
  // account's ACTIVE integration (rather than a bogus literal account scope).
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

  return {
    async createSmokeWorkbook() {
      const res = await uploadFile(
        actionInput({
          filename: `crsmoke-trigger-${shortId()}.xlsx`,
          mimeType: XLSX_MIME,
          content: MINIMAL_XLSX_BASE64,
          contentEncoding: "base64",
        }),
      );
      const itemId = (res.output as { itemId?: string }).itemId;
      if (!itemId) throw new Error("createSmokeWorkbook: upload returned no itemId");
      return { workbookId: itemId };
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
          `excel-polling-smoke createActiveSmokeWorkflow failed: ${error?.message ?? "no row"}`,
        );
      }
      return { workflowId: data.id };
    },

    async armPollingTrigger({ workflowId, triggerNodeId }) {
      const workbookId = await readTriggerWorkbookId(workflowId, triggerNodeId);
      const workflow = buildExcelNewWorksheetSmokeWorkflow(workbookId);
      const record = minimalWorkflowRecord(workflowId, accountId, userId, workflow);
      // REAL lifecycle: provider-tier activation looks up the account's
      // microsoft-excel integration and runs the new_worksheet activation hook
      // (fetch worksheets → seed snapshot).
      await registerWorkflowTriggers(record, workflow.definition);

      const row = await triggerResourcesRepo.findByWorkflowAndNode(workflowId, triggerNodeId);
      if (!row) throw new Error("excel-polling-smoke: trigger_resources row not found after arming");
      const parsed = ExcelNewWorksheetConfigSchema.safeParse(row.config);
      if (!parsed.success || !parsed.data.snapshot) {
        throw new Error("excel-polling-smoke: activation did not seed a worksheet snapshot");
      }
      return { snapshotNames: parsed.data.snapshot.names };
    },

    async poll({ workflowId, triggerNodeId }) {
      const row = await triggerResourcesRepo.findByWorkflowAndNode(workflowId, triggerNodeId);
      if (!row) throw new Error("excel-polling-smoke: trigger_resources row not found for poll");
      // The REAL per-trigger poll handler (the same fn runPollingTriggers.runOne
      // calls). workflowAccountId is populated by findByWorkflowAndNode's join.
      await microsoftExcelPollingHandler.poll({
        trigger: row,
        accountId: row.workflowAccountId ?? accountId,
        userRole: "default",
        now: Date.now(),
      });
    },

    async addWorksheet(workbookId) {
      const name = `crsmoke${shortId()}ws`; // ≤31 chars, no reserved sheet chars
      await createWorksheet(actionInput({ workbookId, name }));
      return { worksheetName: name };
    },

    async listRuns(workflowId) {
      const { data, error } = await supabase
        .from("workflow_runs")
        .select("id,status,trigger_event")
        .eq("workflow_id", workflowId)
        .order("started_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(`excel-polling-smoke listRuns failed: ${error.message}`);
      return (data ?? []).map((r) => {
        const row = r as { id: string; status: string; trigger_event: { payload?: { worksheetName?: unknown } } | null };
        const ws = row.trigger_event?.payload?.worksheetName;
        return {
          runId: row.id,
          status: mapStatus(row.status),
          triggerWorksheetName: typeof ws === "string" ? ws : null,
        } satisfies ExcelPollingRun;
      });
    },

    async drainRun(runId) {
      await processQueuedRun(runId);
    },

    async sleep(ms) {
      await new Promise<void>((r) => setTimeout(r, ms));
    },

    async readRun(runId) {
      const rec = await getByIdServiceRole(runId);
      if (!rec) return null;
      return { runId, status: mapStatus(rec.status), triggerWorksheetName: null };
    },

    async cleanup({ workflowId, workbookId }) {
      if (workflowId) {
        const workflow = buildExcelNewWorksheetSmokeWorkflow(workbookId || "x");
        const record = minimalWorkflowRecord(workflowId, accountId, userId, workflow);
        await unregisterWorkflowTriggers(record).catch(() => {});
      }
      if (workbookId) {
        await deleteItem(actionInput({ itemId: workbookId })).catch(() => {});
      }
      if (workflowId) {
        const { error } = await supabase
          .from("workflows")
          .update({ state: "deleted", deleted_at: new Date().toISOString() })
          .eq("id", workflowId);
        if (error) {
          console.warn(
            JSON.stringify({ event: "excel-polling-smoke.cleanup_failed", workflowId, error: error.message }),
          );
        }
      }
    },
  };

  // Read the workbookId off the persisted draft trigger node (the workflow row
  // was inserted with the trigger config carrying it).
  async function readTriggerWorkbookId(workflowId: string, triggerNodeId: string): Promise<string> {
    const { data, error } = await supabase
      .from("workflows")
      .select("draft_definition")
      .eq("id", workflowId)
      .single<{ draft_definition: { nodes?: Array<{ id: string; config?: { workbookId?: string } }> } }>();
    if (error || !data) {
      throw new Error(`excel-polling-smoke readTriggerWorkbookId failed: ${error?.message ?? "no row"}`);
    }
    const node = (data.draft_definition.nodes ?? []).find((n) => n.id === triggerNodeId);
    const workbookId = node?.config?.workbookId;
    if (!workbookId) throw new Error("excel-polling-smoke: trigger node has no workbookId");
    return workbookId;
  }
}
