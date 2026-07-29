import type {
  AppendAgentMessageRequest,
  GetAgentThreadResponse,
  PersistedAgentMessage,
} from "@/contracts/builderAgentMessage";
import { WorkflowApiError, type WorkflowApiErrorCode } from "./workflows";

/**
 * Typed client for the workflow-scoped React Agent conversation thread
 * (REACT-AGENT-CONVERSATION-PERSISTENCE-1).
 *
 * Per project-structure-and-module-boundaries.md §5: components and feature
 * hooks call this module, never `fetch()` directly. Errors surface as
 * `WorkflowApiError` so callers branch on the same code/status shape they
 * already use for workflow operations.
 *
 * None of these calls reach a model or the AI gateway — restoring, appending,
 * and clearing a transcript are deterministic database operations and cost no
 * AI credits.
 */

function pickCode(status: number): WorkflowApiErrorCode {
  if (status === 400) return "BAD_REQUEST";
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 404) return "WORKFLOW_NOT_FOUND";
  if (status >= 500) return "SERVER_ERROR";
  return "UNKNOWN";
}

async function parseError(res: Response): Promise<WorkflowApiError> {
  let message = `Conversation request failed (HTTP ${res.status}).`;
  try {
    const body = (await res.json()) as { error?: string };
    if (typeof body.error === "string" && body.error.length > 0) message = body.error;
  } catch {
    /* not json */
  }
  return new WorkflowApiError(message, pickCode(res.status), res.status);
}

function base(workflowId: string): string {
  return `/api/workflows/${encodeURIComponent(workflowId)}/agent-thread`;
}

export async function getBuilderAgentThread(
  workflowId: string,
): Promise<GetAgentThreadResponse> {
  const res = await fetch(base(workflowId));
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as GetAgentThreadResponse;
}

export async function appendBuilderAgentMessage(
  workflowId: string,
  input: AppendAgentMessageRequest,
): Promise<PersistedAgentMessage> {
  const res = await fetch(base(workflowId), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as PersistedAgentMessage;
}

export async function clearBuilderAgentThread(
  workflowId: string,
): Promise<{ deletedCount: number }> {
  const res = await fetch(base(workflowId), { method: "DELETE" });
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as { deletedCount: number };
}
