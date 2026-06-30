/**
 * Trigger-smoke harness — REAL Microsoft Excel polling deps (server-only helper).
 *
 * Wires the injected `ExcelPollingSmokeDeps` to the real V2 internals for the
 * Excel CREATE-polling family (new_worksheet / new_row / new_table_row):
 *   - createSmokeWorkbook → the certified microsoft-onedrive:upload_file handler
 *     with a frozen asset (plain = empty Sheet1; withTable = SmokeTable + seed row).
 *   - createActiveSmokeWorkflow → service-role INSERT (state="active",
 *     draft_definition, null active_revision_id → live runs fall back to draft).
 *   - armPollingTrigger → the REAL registerWorkflowTriggers (runs the trigger's
 *     activation hook → seeds its snapshot), then counts the seeded snapshot keys.
 *   - poll → the REAL microsoftExcelPollingHandler.poll(...) scoped to this trigger
 *     (the exact per-trigger dispatch runOne calls). Global runPollingTriggers() is
 *     intentionally NOT used (it would poll + fire other accounts on the shared DB).
 *   - addWorksheet / seedRow / addMarkedRow / addMarkedTableRow → the certified
 *     create_worksheet / add_row / add_table_row handlers.
 *   - listRuns/readRun → service-role reads (carrying trigger_event payload).
 *   - drainRun → the REAL durable-queue processQueuedRun.
 *   - cleanup → unregisterWorkflowTriggers + onedrive:delete_item + soft-delete.
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
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import { uploadFile } from "@/integrations/microsoft-onedrive/actions/uploadFile";
import { deleteItem } from "@/integrations/microsoft-onedrive/actions/deleteItem";
import { createWorksheet } from "@/integrations/microsoft-excel/actions/createWorksheet";
import { addRow } from "@/integrations/microsoft-excel/actions/addRow";
import { addTableRow } from "@/integrations/microsoft-excel/actions/addTableRow";
import { microsoftExcelPollingHandler } from "@/integrations/microsoft-excel/triggers/_shared/pollingHandler";
import { worksheetUsedRange } from "@/integrations/microsoft-excel/api/worksheetUsedRange";
import {
  MINIMAL_XLSX_BASE64,
  MINIMAL_XLSX_WITH_TABLE_BASE64,
} from "@/tests/smoke-actions/minimalXlsx";
import type {
  ExcelPollingSmokeDeps,
  ExcelPollingRun,
  ExcelWorkbookVariant,
} from "./excelPollingSmoke";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const ROW_VISIBLE_ATTEMPTS = 6;
const ROW_VISIBLE_SLEEP_MS = 1500;

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
  definition: WorkflowDefinition,
): WorkflowRecord {
  return {
    id: workflowId,
    accountId,
    createdByUserId: userId,
    draftDefinition: definition,
  } as unknown as WorkflowRecord;
}

function mapStatus(s: string | null | undefined): ExcelPollingRun["status"] {
  if (s === "succeeded" || s === "failed" || s === "running" || s === "queued") return s;
  return null;
}

function snapshotKeyCount(snapshot: unknown): number {
  if (!snapshot || typeof snapshot !== "object") return 0;
  const s = snapshot as { names?: unknown; rowHashes?: unknown };
  if (Array.isArray(s.names)) return s.names.length;
  if (s.rowHashes && typeof s.rowHashes === "object") return Object.keys(s.rowHashes).length;
  return 0;
}

function isBlankCell(v: unknown): boolean {
  return v === null || v === undefined || v === "";
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function makeRealExcelPollingSmokeDeps(
  config: RealExcelPollingSmokeDepsConfig,
): ExcelPollingSmokeDeps {
  const { supabase, accountId, userId } = config;

  // Setup event with provider "native" (NOT the action's provider) → each reused
  // handler falls back to null providerAccountId → resolves the ACTIVE integration.
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
      throw new Error(`excel-polling-smoke loadDefinition failed: ${error?.message ?? "no row"}`);
    }
    return data.draft_definition;
  }

  async function nonEmptyRowCount(workbookId: string, worksheetName: string): Promise<number> {
    const range = await refreshAndRetry({
      accountId,
      provider: "microsoft-excel",
      providerAccountId: null,
      apiCall: (accessToken) =>
        worksheetUsedRange({ accessToken, workbookId, worksheetName, valuesOnly: true }),
    });
    const rows = range.values ?? [];
    return rows.filter((row) => row.some((c) => !isBlankCell(c))).length;
  }

  return {
    async createSmokeWorkbook(variant: ExcelWorkbookVariant) {
      const content =
        variant === "withTable" ? MINIMAL_XLSX_WITH_TABLE_BASE64 : MINIMAL_XLSX_BASE64;
      const res = await uploadFile(
        actionInput({
          filename: `crsmoke-trigger-${shortId()}.xlsx`,
          mimeType: XLSX_MIME,
          content,
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
      const definition = await loadDefinition(workflowId);
      const record = minimalWorkflowRecord(workflowId, accountId, userId, definition);
      await registerWorkflowTriggers(record, definition);

      const row = await triggerResourcesRepo.findByWorkflowAndNode(workflowId, triggerNodeId);
      if (!row) throw new Error("excel-polling-smoke: trigger_resources row not found after arming");
      return { snapshotKeyCount: snapshotKeyCount((row.config as { snapshot?: unknown }).snapshot) };
    },

    async poll({ workflowId, triggerNodeId }) {
      const row = await triggerResourcesRepo.findByWorkflowAndNode(workflowId, triggerNodeId);
      if (!row) throw new Error("excel-polling-smoke: trigger_resources row not found for poll");
      await microsoftExcelPollingHandler.poll({
        trigger: row,
        accountId: row.workflowAccountId ?? accountId,
        userRole: "default",
        now: Date.now(),
      });
    },

    async addWorksheet(workbookId) {
      const name = `crsmoke${shortId()}ws`;
      await createWorksheet(actionInput({ workbookId, name }));
      return { worksheetName: name };
    },

    async seedRow({ workbookId, worksheetName }) {
      await addRow(actionInput({ workbookId, worksheetName, values: ["crsmoke-seed"] }));
      // Confirm the seed row is read-back visible BEFORE activation, so the change
      // row appends at a NEW position key (not colliding with the empty-sheet baseline).
      for (let i = 0; i < ROW_VISIBLE_ATTEMPTS; i += 1) {
        if ((await nonEmptyRowCount(workbookId, worksheetName)) >= 1) return;
        await sleep(ROW_VISIBLE_SLEEP_MS);
      }
      throw new Error("excel-polling-smoke: seed row never became visible (propagation lag)");
    },

    async addMarkedRow({ workbookId, worksheetName }) {
      const marker = `crsmoke-${shortId()}-row`;
      await addRow(actionInput({ workbookId, worksheetName, values: [marker] }));
      return { marker };
    },

    async addMarkedTableRow({ workbookId, tableName }) {
      const marker = `crsmoke-${shortId()}-trow`;
      await addTableRow(actionInput({ workbookId, tableName, values: [marker] }));
      return { marker };
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
        const row = r as { id: string; status: string; trigger_event: { payload?: Record<string, unknown> } | null };
        return {
          runId: row.id,
          status: mapStatus(row.status),
          triggerPayload: row.trigger_event?.payload ?? null,
        } satisfies ExcelPollingRun;
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

    async cleanup({ workflowId, workbookId }) {
      if (workflowId) {
        try {
          const definition = await loadDefinition(workflowId);
          const record = minimalWorkflowRecord(workflowId, accountId, userId, definition);
          await unregisterWorkflowTriggers(record);
        } catch {
          /* best-effort */
        }
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

    async sleep(ms) {
      await sleep(ms);
    },
  };
}
