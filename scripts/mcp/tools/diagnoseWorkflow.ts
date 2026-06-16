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
import { CONNECTION_STATUS_NOTES } from "./connectionStatusNotes";
import type { ToolDefinition } from "../registry";

const WORKFLOW_READINESS_PATH = "/api/internal/diagnostics/workflow-readiness";
const WORKFLOW_CONNECTIONS_PATH = "/api/internal/diagnostics/workflow-connections";
const WORKFLOW_GRAPH_PATH = "/api/internal/diagnostics/workflow-graph";

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

// ─────────────────────── diagnose_workflow_connections ───────────────────────

/** The sanitized DTO shape the workflow-connections route returns (mirror — no app import). */
interface WorkflowConnectionsDTO {
  workflowId: string;
  access: string;
  // Present ONLY when access === "OK".
  allRequiredConnected?: boolean;
  providers?: Array<{
    provider: string;
    name: string | null;
    credentialClass: string;
    nodeIds: string[];
    nodeCount: number;
    status: string;
    ready: boolean;
    providerEnabled: boolean;
    refreshable: boolean;
    tokenExpired: boolean | null;
    scopesSatisfied: boolean;
    missingScopeCount: number;
    missingScopes?: string[];
  }>;
}

function renderWorkflowConnectionsDto(dto: WorkflowConnectionsDTO): string {
  const lines: string[] = [
    "diagnose_workflow_connections",
    `workflowId: ${dto.workflowId}`,
    `access: ${dto.access}`,
  ];
  const accessNote = ACCESS_NOTES[dto.access];
  if (accessNote) lines.push(`meaning: ${accessNote}`);

  if (dto.access !== "OK") return lines.join("\n");

  lines.push(`allRequiredConnected: ${dto.allRequiredConnected}`);

  if (!Array.isArray(dto.providers) || dto.providers.length === 0) {
    lines.push("providers: (none — the graph uses no provider connections)");
    return lines.join("\n");
  }

  lines.push("providers:");
  for (const p of dto.providers) {
    const label = p.name ? ` (${p.name})` : "";
    lines.push(`  - ${p.provider}${label} [${p.credentialClass}]: ${p.status} (ready=${p.ready})`);
    const note = CONNECTION_STATUS_NOTES[p.status];
    if (note) lines.push(`      meaning: ${note}`);
    lines.push(`      usedBy: ${p.nodeCount} node(s) — ${p.nodeIds.join(", ")}`);
    if (p.status === "MISSING_SCOPES" && Array.isArray(p.missingScopes)) {
      lines.push(`      missingScopes: ${p.missingScopes.join(", ")}`);
    }
  }
  return lines.join("\n");
}

async function diagnoseWorkflowConnections(args: Record<string, unknown>): Promise<string> {
  const workflowId = typeof args.workflowId === "string" ? args.workflowId.trim() : "";
  if (!workflowId) return "Error: 'workflowId' is required (the workflow to check).";
  const userId = typeof args.userId === "string" ? args.userId.trim() : "";
  if (!userId) {
    return "Error: 'userId' is required — the subject to check authorization under (must be a member of the workflow's account).";
  }

  const result = await postDiagnostic<WorkflowConnectionsDTO>(WORKFLOW_CONNECTIONS_PATH, {
    workflowId,
    userId,
  });
  return result.ok ? renderWorkflowConnectionsDto(result.dto) : result.message;
}

// ─────────────────────────── diagnose_workflow_graph ───────────────────────────

/** The sanitized DTO shape the workflow-graph route returns (mirror — no app import). */
interface GraphFindingDTO {
  kind: string;
  severity: string;
  nodeId?: string;
  displayName?: string;
  edgeId?: string;
  from?: string;
  to?: string;
  provider?: string;
  nodeType?: string;
  missingFields?: string[];
  token?: string;
  fieldLabel?: string;
  refPath?: string;
  reason?: string;
}
interface WorkflowGraphDTO {
  workflowId: string;
  access: string;
  // Present ONLY when access === "OK".
  structurallyValid?: boolean;
  nodeCount?: number;
  edgeCount?: number;
  findings?: GraphFindingDTO[];
}

/** Render one structural finding's safe location target (ids / endpoints / names only). */
function renderFindingTarget(f: GraphFindingDTO): string {
  if (f.edgeId) return `edge ${f.edgeId}${f.from && f.to ? ` (${f.from}→${f.to})` : ""}`;
  if (f.nodeId) {
    const label = f.displayName ? ` (${f.displayName})` : "";
    const t = f.provider && f.nodeType ? ` [${f.provider}:${f.nodeType}]` : f.provider ? ` [${f.provider}]` : "";
    return `node ${f.nodeId}${label}${t}`;
  }
  return "(workflow-level)";
}

function renderWorkflowGraphDto(dto: WorkflowGraphDTO): string {
  const lines: string[] = [
    "diagnose_workflow_graph",
    `workflowId: ${dto.workflowId}`,
    `access: ${dto.access}`,
  ];
  const accessNote = ACCESS_NOTES[dto.access];
  if (accessNote) lines.push(`meaning: ${accessNote}`);
  if (dto.access !== "OK") return lines.join("\n");

  lines.push(`structurallyValid: ${dto.structurallyValid}`);
  lines.push(`nodes: ${dto.nodeCount}  edges: ${dto.edgeCount}`);

  const findings = Array.isArray(dto.findings) ? dto.findings : [];
  if (findings.length === 0) {
    lines.push("findings: (none — no structural problems detected)");
    return lines.join("\n");
  }
  lines.push(`findings (${findings.length}):`);
  for (const f of findings) {
    lines.push(`  - [${f.severity.toUpperCase()}] ${f.kind}: ${renderFindingTarget(f)}`);
    if (f.missingFields && f.missingFields.length) {
      lines.push(`      missing fields: ${f.missingFields.join(", ")}`);
    }
    if (f.token) lines.push(`      broken reference: ${f.token}${f.fieldLabel ? ` (field: ${f.fieldLabel})` : ""}`);
    if (f.reason) lines.push(`      why: ${f.reason}`);
  }
  return lines.join("\n");
}

async function diagnoseWorkflowGraph(args: Record<string, unknown>): Promise<string> {
  const workflowId = typeof args.workflowId === "string" ? args.workflowId.trim() : "";
  if (!workflowId) return "Error: 'workflowId' is required (the workflow to check).";
  const userId = typeof args.userId === "string" ? args.userId.trim() : "";
  if (!userId) {
    return "Error: 'userId' is required — the subject to check authorization under (must be a member of the workflow's account).";
  }

  const result = await postDiagnostic<WorkflowGraphDTO>(WORKFLOW_GRAPH_PATH, { workflowId, userId });
  return result.ok ? renderWorkflowGraphDto(result.dto) : result.message;
}

export const diagnoseWorkflowTools: ToolDefinition[] = [
  {
    name: "diagnose_workflow_graph",
    description:
      "LIVE STRUCTURAL diagnosis of a workflow's graph for a specific user: reports structural findings — missing/extra trigger, stale edges (endpoint node gone), unreachable/disconnected nodes, unsupported provider:type (no builder metadata — warning), incomplete (type-less) nodes, missing required-field LABELS, and broken {{...}} reference LOCATIONS. Returns ONLY structure: node ids, edge ids/endpoints, provider + dispatch type ids, field NAMES, dotted reference PATHS, and the user-authored {{...}} token — NEVER config values, trigger payloads, provider bodies, or raw errors. A workflow in another account reads as NO_ACCOUNT_ACCESS with nothing else. Requires the diagnostics API to be enabled on the app (dev-only by default).",
    inputSchema: {
      type: "object",
      properties: {
        workflowId: { type: "string", description: "The workflow id to check." },
        userId: {
          type: "string",
          description: "The subject to check authorization under (must be a member of the workflow's account).",
        },
      },
      required: ["workflowId", "userId"],
      additionalProperties: false,
    },
    handler: diagnoseWorkflowGraph,
  },
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
  {
    name: "diagnose_workflow_connections",
    description:
      "LIVE provider-connection readiness for a whole workflow, for a specific user: for EACH provider the graph uses, reports whether its connection is available under the correct account + credential-provenance context. Returns per-provider { provider, public name, credentialClass (personal/account), the node ids that use it, a derived status code (CONNECTED / DISCONNECTED / RECONNECT_REQUIRED / TOKEN_EXPIRED / MISSING_SCOPES / PROVIDER_DISABLED / PROVIDER_UNKNOWN / NOT_WORKFLOW_OWNER), ready, and the missing-scope gap names } plus an overall allRequiredConnected. Reads STORED state only — makes NO provider call, decrypts NO token. A personal provider connected by another member surfaces as NOT_WORKFLOW_OWNER with NO row fetched; co-member credential details/counts are never revealed. A workflow in another account reads as NO_ACCOUNT_ACCESS with nothing else. NEVER returns tokens, identity, account labels, full granted scopes, or workflow config values. Requires the diagnostics API to be enabled on the app (dev-only by default).",
    inputSchema: {
      type: "object",
      properties: {
        workflowId: { type: "string", description: "The workflow id to check." },
        userId: {
          type: "string",
          description:
            "The subject to check authorization + provenance under (must be a member of the workflow's account).",
        },
      },
      required: ["workflowId", "userId"],
      additionalProperties: false,
    },
    handler: diagnoseWorkflowConnections,
  },
];
