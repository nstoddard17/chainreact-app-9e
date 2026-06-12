/**
 * Internal MCP server — LIVE workflow diagnostics (Stage 2B Plane-B tools).
 *
 *   diagnose_workflow_readiness → report whether a workflow can run (graph +
 *                                 required-field verdict) + a static provider
 *                                 inventory, for a specific user.
 *
 * IMPORT FENCE — LOCAL modules (`./diagnoseTransport`, `../registry`) + `node`
 * runtime globals only. NEVER imports app code, services, repositories, or
 * Supabase. The app route does all data access + sanitization; this tool POSTs
 * JSON and renders the already-sanitized DTO (codes / ids / names / labels only —
 * never config values, tokens, or provider bodies).
 *
 * Lives apart from `diagnoseLive.ts` to keep that file under the file-size limit
 * as the live-tool set grows; future workflow tools (2B-5 graph) land here too.
 */
import { postDiagnostic } from "./diagnoseTransport";
import type { ToolDefinition } from "../registry";

const WORKFLOW_READINESS_PATH = "/api/internal/diagnostics/workflow-readiness";

/** The sanitized DTO shape the workflow-readiness route returns (mirror — no app import). */
interface WorkflowReadinessDTO {
  workflowId: string;
  access: string;
  // Present ONLY when access === "OK".
  runnable?: boolean;
  readinessError?: string | null;
  graphIssues?: Array<{
    code: string;
    nodeId?: string;
    displayName?: string;
    edgeId?: string;
    from?: string;
    to?: string;
  }>;
  fieldGaps?: Array<{ nodeId: string; nodeName: string; missingFields: string[] }>;
  providers?: Array<{ provider: string; name: string | null; enabled: boolean }>;
}

/** Plain-English interpretation per access state (local; never sent over the wire). */
const ACCESS_NOTES: Record<string, string> = {
  OK: "You are an authorized member of this workflow's account — readiness shown below.",
  NOT_FOUND: "No workflow resolved for this id — it does not exist (or you can't see it).",
  NO_ACCOUNT_ACCESS:
    "Authorization wall: the subject is not a member of this workflow's account, so nothing about it is revealed.",
};

function renderReadinessDto(dto: WorkflowReadinessDTO): string {
  const lines: string[] = [
    "diagnose_workflow_readiness",
    `workflowId: ${dto.workflowId}`,
    `access: ${dto.access}`,
  ];
  const note = ACCESS_NOTES[dto.access];
  if (note) lines.push(`meaning: ${note}`);

  if (dto.access !== "OK") return lines.join("\n");

  lines.push(`runnable: ${dto.runnable}`);
  lines.push(`readinessError: ${dto.readinessError ?? "(none)"}`);

  if (Array.isArray(dto.graphIssues) && dto.graphIssues.length > 0) {
    lines.push("graphIssues:");
    for (const g of dto.graphIssues) {
      const target = g.nodeId ?? g.edgeId ?? (g.from && g.to ? `${g.from}→${g.to}` : "");
      const label = g.displayName ? ` (${g.displayName})` : "";
      lines.push(`  - ${g.code}${target ? `: ${target}` : ""}${label}`);
    }
  }

  if (Array.isArray(dto.fieldGaps) && dto.fieldGaps.length > 0) {
    lines.push("fieldGaps (missing required fields):");
    for (const f of dto.fieldGaps) {
      lines.push(`  - ${f.nodeName} [${f.nodeId}]: ${f.missingFields.join(", ")}`);
    }
  }

  if (Array.isArray(dto.providers) && dto.providers.length > 0) {
    lines.push("providers:");
    for (const p of dto.providers) {
      lines.push(`  - ${p.provider}${p.name ? ` (${p.name})` : ""}: enabled=${p.enabled}`);
    }
  }
  return lines.join("\n");
}

async function diagnoseWorkflowReadiness(args: Record<string, unknown>): Promise<string> {
  const workflowId = typeof args.workflowId === "string" ? args.workflowId.trim() : "";
  if (!workflowId) return "Error: 'workflowId' is required (the workflow to check).";
  const userId = typeof args.userId === "string" ? args.userId.trim() : "";
  if (!userId) {
    return "Error: 'userId' is required — the subject to check authorization under (must be a member of the workflow's account).";
  }

  const result = await postDiagnostic<WorkflowReadinessDTO>(WORKFLOW_READINESS_PATH, {
    workflowId,
    userId,
  });
  return result.ok ? renderReadinessDto(result.dto) : result.message;
}

export const diagnoseWorkflowTools: ToolDefinition[] = [
  {
    name: "diagnose_workflow_readiness",
    description:
      "LIVE readiness diagnosis of a workflow for a specific user: reports whether it can run (the SAME graph-integrity + required-field verdict the engine uses) plus a STATIC provider inventory (id / name / manifest-enabled). Returns graph issue codes + node ids + node display names, missing-field LABELS, and the provider list — NEVER config values, tokens, or provider bodies. A workflow in another account reads as NO_ACCOUNT_ACCESS with nothing else. Does NOT check live connection state (that's a separate tool). Requires the diagnostics API to be enabled on the app (dev-only by default).",
    inputSchema: {
      type: "object",
      properties: {
        workflowId: { type: "string", description: "The workflow id to check." },
        userId: {
          type: "string",
          description:
            "The subject to check authorization under (must be a member of the workflow's account).",
        },
      },
      required: ["workflowId", "userId"],
      additionalProperties: false,
    },
    handler: diagnoseWorkflowReadiness,
  },
];
