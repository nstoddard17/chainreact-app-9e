/**
 * Internal MCP server — LIVE option-source diagnostics (Stage 2B-1).
 *
 *   diagnose_option_source_live → run the ACTUAL option-source resolution for a
 *                                 given source + subject and report the REAL
 *                                 OptionsSourceErrorCode (or success-with-count).
 *
 * This is the only Plane-B tool: unlike the static `diagnose_option_source`
 * (which maps an OBSERVED code from the closed taxonomy), this one asks the app
 * what the code actually is right now for a specific user/workflow.
 *
 * IMPORT FENCE — this file imports ONLY `node:*`-style globals and LOCAL MCP
 * modules. It NEVER imports app code, services, repositories, or Supabase. All
 * live data access happens INSIDE the app route; this tool is a `fetch` client
 * that POSTs JSON and renders the already-sanitized DTO. The app route returns
 * counts/enums/booleans only — never items, tokens, scopes, or provider bodies.
 *
 * Config (env, never hardcoded):
 *   MCP_DIAGNOSTICS_URL    base origin of the app (default http://127.0.0.1:3000
 *                          — local/dev, NEVER production by default).
 *   MCP_DIAGNOSTICS_TOKEN  bearer matching the app's DIAGNOSTICS_API_TOKEN.
 *                          Distinct from MCP_HTTP_TOKEN.
 */
import { OPTION_SOURCE_DIAGNOSES } from "./diagnose";
import type { ToolDefinition } from "../registry";

const DEFAULT_URL = "http://127.0.0.1:3000";
const ROUTE_PATH = "/api/internal/diagnostics/option-source";
const REQUEST_TIMEOUT_MS = 20_000;

/** The sanitized DTO shape the app route returns (mirror — no app import). */
interface OptionSourceDiagnosticDTO {
  ok: boolean;
  source: string;
  code: string | null;
  itemCount: number;
  hasMore: boolean;
  credentialDecision: string | null;
  requiresIntegration: boolean;
  integrationConnected: boolean;
  missingDependency?: string;
}

function baseUrl(): string {
  const raw = (process.env.MCP_DIAGNOSTICS_URL ?? "").trim();
  return raw.length > 0 ? raw.replace(/\/+$/, "") : DEFAULT_URL;
}

function renderDto(dto: OptionSourceDiagnosticDTO): string {
  const lines: string[] = [
    "diagnose_option_source_live",
    `source: ${dto.source}`,
  ];
  if (dto.ok) {
    lines.push("result: OK (resolver returned successfully)");
    lines.push(`itemCount: ${dto.itemCount}`);
    lines.push(`hasMore: ${dto.hasMore}`);
  } else {
    lines.push(`result: ERROR (code: ${dto.code ?? "UNKNOWN"})`);
    if (dto.missingDependency) {
      lines.push(`missingDependency: ${dto.missingDependency}`);
    }
  }
  lines.push(`requiresIntegration: ${dto.requiresIntegration}`);
  lines.push(`integrationConnected: ${dto.integrationConnected}`);
  lines.push(`credentialDecision: ${dto.credentialDecision ?? "(none)"}`);

  // Enrich an error code with the static cause + next-checks from the closed
  // taxonomy (local data — same table the static tool uses). Code-only over the
  // wire; the explanation is added here, never carried in the DTO.
  if (!dto.ok && dto.code && OPTION_SOURCE_DIAGNOSES[dto.code]) {
    const d = OPTION_SOURCE_DIAGNOSES[dto.code]!;
    lines.push("");
    lines.push(`cause: ${d.cause}`);
    for (const c of d.nextChecks) lines.push(`next: ${c}`);
  }
  return lines.join("\n");
}

async function diagnoseOptionSourceLive(
  args: Record<string, unknown>,
): Promise<string> {
  const source = typeof args.source === "string" ? args.source.trim() : "";
  if (!source) return "Error: 'source' is required (e.g. 'slack:channels').";
  const userId = typeof args.userId === "string" ? args.userId.trim() : "";
  if (!userId) {
    return "Error: 'userId' is required — the subject to diagnose under (the affected user's id).";
  }

  const token = (process.env.MCP_DIAGNOSTICS_TOKEN ?? "").trim();
  if (!token) {
    return (
      "Error: MCP_DIAGNOSTICS_TOKEN is not set. Set it (matching the app's " +
      "DIAGNOSTICS_API_TOKEN) to use live diagnostics. This is a developer tool; " +
      "the live diagnostics route is OFF by default."
    );
  }

  const payload: Record<string, unknown> = { source, userId };
  if (typeof args.q === "string") payload.q = args.q;
  if (typeof args.workflowId === "string") payload.workflowId = args.workflowId;
  if (typeof args.nodeId === "string") payload.nodeId = args.nodeId;
  if (
    typeof args.deps === "object" &&
    args.deps !== null &&
    !Array.isArray(args.deps)
  ) {
    payload.deps = args.deps;
  }

  const url = `${baseUrl()}${ROUTE_PATH}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    return (
      `Could not reach the diagnostic API at ${url}. Is the app running and is ` +
      `MCP_DIAGNOSTICS_URL correct? (${reason})`
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401) {
    return (
      "The diagnostic API rejected the request (401). Check that " +
      "MCP_DIAGNOSTICS_TOKEN matches the app's DIAGNOSTICS_API_TOKEN."
    );
  }
  if (res.status === 404) {
    return (
      "Live diagnostics are disabled or not found (404). On the app, set " +
      "DIAGNOSTICS_API_ENABLED=1 (and DIAGNOSTICS_API_ALLOW_PROD=1 in production) " +
      "to enable this read-only route."
    );
  }
  if (res.status === 400) {
    return (
      "The diagnostic API rejected the input (400). 'source' must be " +
      "'<provider>:<resource>' (e.g. 'slack:channels') and 'userId' is required."
    );
  }
  if (res.status !== 200) {
    return `The diagnostic API returned an unexpected status ${res.status}.`;
  }

  let dto: OptionSourceDiagnosticDTO;
  try {
    dto = (await res.json()) as OptionSourceDiagnosticDTO;
  } catch {
    return "The diagnostic API returned a non-JSON body.";
  }
  return renderDto(dto);
}

export const diagnoseLiveTools: ToolDefinition[] = [
  {
    name: "diagnose_option_source_live",
    description:
      "LIVE diagnosis of a builder options-source (e.g. 'slack:channels') for a specific user: runs the actual app resolver and reports the REAL OptionsSourceErrorCode (or success + item COUNT). Read-only; returns counts/enums only — never item labels, tokens, scopes, or provider bodies. Requires the diagnostics API to be enabled on the app (dev-only by default).",
    inputSchema: {
      type: "object",
      properties: {
        source: {
          type: "string",
          description: "Options-source key, '<provider>:<resource>', e.g. 'slack:channels'.",
        },
        userId: {
          type: "string",
          description:
            "The subject to diagnose under — the affected user's id. Resolution applies that user's credential-sharing context.",
        },
        workflowId: {
          type: "string",
          description:
            "Optional workflow id. Drives the creator/account credential-sharing decision (omit for the user's personal-account behavior).",
        },
        nodeId: {
          type: "string",
          description: "Optional node id being configured (accepted per-node owner resolution).",
        },
        q: { type: "string", description: "Optional search query the picker would send." },
        deps: {
          type: "object",
          description: "Optional dependsOn parent values, as a flat string→string map.",
          additionalProperties: { type: "string" },
        },
      },
      required: ["source", "userId"],
      additionalProperties: false,
    },
    handler: diagnoseOptionSourceLive,
  },
];
