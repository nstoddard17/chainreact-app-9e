import type { AccountRecord } from "@/contracts/accounts";
import type { MembershipRole } from "@/contracts/accounts";
import type { WorkflowRecord } from "@/repositories/workflows";
import type { WorkflowRunRecord } from "@/repositories/workflowRuns";
import type { IntegrationRecord } from "@/repositories/integrations";

/**
 * Safe MCP output serializers (Slice 4.PUBLIC-MCP-6).
 *
 * THE NO-LEAK BOUNDARY. Every value the public MCP server returns to a customer's
 * LLM client passes through one of these allow-listed projections. They take a full
 * internal record and return a NARROW DTO that contains ONLY explicitly-listed safe
 * fields. Anything not enumerated here cannot leave the server.
 *
 * Explicitly EXCLUDED everywhere (the security contract):
 *   - OAuth access/refresh tokens, `access_token_encrypted`, `refresh_token_encrypted`
 *   - any API key / secret / `token_hash`
 *   - raw provider payloads (`account_metadata`, run `trigger_event`)
 *   - per-step outputs (`steps[].output`), engine internals (`fatal_error`), error
 *     `details`
 *   - integration `scopes` / `provider_account_id` (capability/identity surface)
 *   - workflow node `config` (can hold user-entered secrets — never serialized)
 *   - service-role reasons / internal debug
 *   - provenance user ids (`created_by_user_id` / `connected_by_user_id` /
 *     `triggered_by_user_id`)
 *
 * These functions are pure and do no I/O.
 */

// ── Accounts ──────────────────────────────────────────────────────────────────

export interface McpAccountDto {
  id: string;
  name: string;
  type: AccountRecord["type"];
  /** The caller's membership role on this account. */
  role: MembershipRole;
}

export function toMcpAccountDto(account: AccountRecord, role: MembershipRole): McpAccountDto {
  return { id: account.id, name: account.name, type: account.type, role };
}

// ── Workflows ─────────────────────────────────────────────────────────────────

export interface McpWorkflowSummaryDto {
  id: string;
  name: string;
  state: WorkflowRecord["state"];
  createdAt: string;
  updatedAt: string;
}

export function toMcpWorkflowSummaryDto(wf: WorkflowRecord): McpWorkflowSummaryDto {
  return {
    id: wf.id,
    name: wf.name,
    state: wf.state,
    createdAt: wf.createdAt,
    updatedAt: wf.updatedAt,
  };
}

export interface McpWorkflowNodeDto {
  id: string;
  kind: "trigger" | "action";
  provider: string;
  type: string;
  /** Optional user-facing node label. NEVER node `config` (can hold secrets). */
  name?: string;
}

export interface McpWorkflowEdgeDto {
  from: string;
  to: string;
  label?: string;
}

export interface McpWorkflowDetailDto extends McpWorkflowSummaryDto {
  nodeCount: number;
  edgeCount: number;
  /** Structure only — provider/type/kind/id + optional label. No `config`. */
  nodes: McpWorkflowNodeDto[];
  edges: McpWorkflowEdgeDto[];
}

/**
 * Full-workflow detail with the node/edge STRUCTURE but NOT any node `config`. The
 * config payload is an opaque `Record<string, unknown>` that can contain
 * user-entered secrets (API keys typed into a field), so it is never serialized —
 * only the graph shape (id / kind / provider / type + optional display name).
 */
export function toMcpWorkflowDetailDto(wf: WorkflowRecord): McpWorkflowDetailDto {
  const nodes = (wf.draftDefinition.nodes ?? []).map((n): McpWorkflowNodeDto => {
    const dto: McpWorkflowNodeDto = {
      id: n.id,
      kind: n.kind,
      provider: n.provider,
      type: n.type,
    };
    if (n.displayName && n.displayName.length > 0) dto.name = n.displayName;
    return dto;
  });
  const edges = (wf.draftDefinition.edges ?? []).map((e): McpWorkflowEdgeDto => {
    const dto: McpWorkflowEdgeDto = { from: e.from, to: e.to };
    if (e.label) dto.label = e.label;
    return dto;
  });
  return {
    ...toMcpWorkflowSummaryDto(wf),
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodes,
    edges,
  };
}

// ── Runs ──────────────────────────────────────────────────────────────────────

export interface McpRunErrorDto {
  title: string;
  description: string;
  severity: "warning" | "error";
}

export interface McpRunSummaryDto {
  id: string;
  workflowId: string;
  status: WorkflowRunRecord["status"];
  isTest: boolean;
  triggeredBy: WorkflowRunRecord["triggeredBy"];
  startedAt: string;
  finishedAt: string | null;
  /** Humanized, user-safe error summary (never the raw engine error). */
  error: McpRunErrorDto | null;
}

function toRunErrorDto(
  classification: WorkflowRunRecord["errorClassification"],
): McpRunErrorDto | null {
  if (!classification) return null;
  return {
    title: classification.title,
    description: classification.description,
    severity: classification.severity,
  };
}

export function toMcpRunSummaryDto(run: {
  id: string;
  workflowId: string;
  status: WorkflowRunRecord["status"];
  isTest: boolean;
  triggeredBy: WorkflowRunRecord["triggeredBy"];
  startedAt: string;
  finishedAt: string | null;
  errorClassification: WorkflowRunRecord["errorClassification"];
}): McpRunSummaryDto {
  return {
    id: run.id,
    workflowId: run.workflowId,
    status: run.status,
    isTest: run.isTest,
    triggeredBy: run.triggeredBy,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    error: toRunErrorDto(run.errorClassification),
  };
}

export interface McpRunStepDto {
  nodeId: string;
  status: "succeeded" | "failed" | "skipped";
  /** Machine error code only (e.g. 'MISSING_VARIABLE'). NEVER the raw message/details. */
  errorCode: string | null;
}

export interface McpRunDetailDto extends McpRunSummaryDto {
  /** Per-step status + machine error code. NO step output, NO raw error text. */
  steps: McpRunStepDto[];
}

/**
 * Run detail with per-step status only. `steps[].output` (provider responses, can
 * hold secrets/PII), `trigger_event` (raw upstream payload), `fatal_error` (engine
 * internals), and error `message`/`details` are NEVER serialized. The humanized
 * `errorClassification` is the user-facing error surface.
 */
export function toMcpRunDetailDto(run: WorkflowRunRecord): McpRunDetailDto {
  const steps = (run.steps ?? []).map((s): McpRunStepDto => ({
    nodeId: s.nodeId,
    status: s.status,
    errorCode: s.error?.code ?? null,
  }));
  return {
    ...toMcpRunSummaryDto({
      id: run.id,
      workflowId: run.workflowId,
      status: run.status,
      isTest: run.isTest,
      triggeredBy: run.triggeredBy,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      errorClassification: run.errorClassification,
    }),
    steps,
  };
}

// ── Integrations ──────────────────────────────────────────────────────────────

export type McpIntegrationStatus = "connected" | "needs_reconnect" | "disconnected";

export interface McpIntegrationDto {
  id: string;
  provider: string;
  /** The account's own label for the connection (e.g. a workspace/shop name). */
  displayName: string | null;
  status: McpIntegrationStatus;
  connectedAt: string;
}

function integrationStatus(integration: IntegrationRecord): McpIntegrationStatus {
  if (integration.disconnectedAt) return "disconnected";
  if (integration.needsReconnectAt) return "needs_reconnect";
  return "connected";
}

/**
 * Integration DTO with provider + label + status ONLY. Token columns
 * (`access_token_encrypted` / `refresh_token_encrypted`), `account_metadata` (raw
 * provider payload), `scopes`, `provider_account_id`, and `connected_by_user_id`
 * are NEVER serialized.
 */
export function toMcpIntegrationDto(integration: IntegrationRecord): McpIntegrationDto {
  return {
    id: integration.id,
    provider: integration.provider,
    displayName: integration.displayName,
    status: integrationStatus(integration),
    connectedAt: integration.createdAt,
  };
}
