import type {
  AgentChangeHistoryItem,
  ListAgentChangeHistoryResponse,
  RecordAgentChangeRequest,
} from "@/contracts/agentChangeHistory";
import { WorkflowApiError, type WorkflowApiErrorCode } from "./workflows";

/**
 * Typed client for the agent-change-history API (AGENT-CHANGE-HISTORY-1).
 *
 * Per project-structure-and-module-boundaries.md §5: components and feature
 * hooks call this module, never `fetch()` directly. Errors surface as
 * `WorkflowApiError` (reused from lib/api/workflows.ts) so callers branch on the
 * same code/status shape they already use for workflow operations.
 */

function pickCode(status: number): WorkflowApiErrorCode {
  if (status === 400) return "BAD_REQUEST";
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 404) return "WORKFLOW_NOT_FOUND";
  if (status >= 500) return "SERVER_ERROR";
  return "UNKNOWN";
}

async function parseError(res: Response): Promise<WorkflowApiError> {
  let message = `Agent change request failed (HTTP ${res.status}).`;
  try {
    const body = (await res.json()) as { error?: string };
    if (typeof body.error === "string" && body.error.length > 0) message = body.error;
  } catch {
    /* not json */
  }
  return new WorkflowApiError(message, pickCode(res.status), res.status);
}

function base(workflowId: string): string {
  return `/api/workflows/${encodeURIComponent(workflowId)}/agent-changes`;
}

export async function listAgentChangeHistory(
  workflowId: string,
): Promise<readonly AgentChangeHistoryItem[]> {
  const res = await fetch(base(workflowId));
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as ListAgentChangeHistoryResponse;
  return body.items;
}

export async function recordAgentChange(
  workflowId: string,
  input: RecordAgentChangeRequest,
): Promise<AgentChangeHistoryItem> {
  const res = await fetch(base(workflowId), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as AgentChangeHistoryItem;
}
