import type { WorkflowConnectionReadinessDTO } from "@/contracts/workflowConnectionReadiness";
import type { WorkflowDefinition } from "@/contracts/workflowDefinition";
import { WorkflowApiError, type WorkflowApiErrorCode } from "./workflows";

/**
 * Typed client for the workflow connection-readiness API (REACT-AGENT-READINESS-1).
 *
 * Per project-structure-and-module-boundaries.md §5: feature hooks call this
 * module, never `fetch()` directly. Errors surface as `WorkflowApiError` (reused
 * from lib/api/workflows.ts) so callers branch on the same code/status shape.
 *
 * The response is the server's sanitized DTO — no tokens / credential owner ids /
 * config values ever cross the wire.
 */

function pickCode(status: number): WorkflowApiErrorCode {
  if (status === 400) return "BAD_REQUEST";
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 404) return "WORKFLOW_NOT_FOUND";
  if (status >= 500) return "SERVER_ERROR";
  return "UNKNOWN";
}

async function parseError(res: Response): Promise<WorkflowApiError> {
  let message = `Connection-readiness request failed (HTTP ${res.status}).`;
  try {
    const body = (await res.json()) as { error?: string };
    if (typeof body.error === "string" && body.error.length > 0) message = body.error;
  } catch {
    /* not json */
  }
  return new WorkflowApiError(message, pickCode(res.status), res.status);
}

/**
 * Fetch the per-provider connection readiness for a workflow. When
 * `draftOverride` is supplied (the React Agent's proposed end-state or the live
 * pending draft), readiness reflects that graph instead of the saved definition.
 */
export async function getWorkflowConnectionReadiness(
  workflowId: string,
  draftOverride?: WorkflowDefinition,
): Promise<WorkflowConnectionReadinessDTO> {
  const res = await fetch(
    `/api/workflows/${encodeURIComponent(workflowId)}/connection-readiness`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draftOverride ? { draftOverride } : {}),
    },
  );
  if (!res.ok) throw await parseError(res);
  return (await res.json()) as WorkflowConnectionReadinessDTO;
}
