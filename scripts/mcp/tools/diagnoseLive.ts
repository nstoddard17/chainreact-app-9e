/**
 * Internal MCP server — LIVE diagnostics (Stage 2B Plane-B tools).
 *
 *   diagnose_option_source_live      → run the ACTUAL option-source resolution for
 *                                      a source + subject; report the REAL
 *                                      OptionsSourceErrorCode (or success-count).
 *   diagnose_integration_connection  → report the DERIVED connection status for a
 *                                      provider + account/subject (stored-state
 *                                      only; no provider call).
 *
 * IMPORT FENCE — this file imports ONLY LOCAL MCP modules (`./diagnose`,
 * `../registry`) and uses `node`-runtime globals (`fetch`, `AbortController`,
 * `setTimeout`). It NEVER imports app code, services, repositories, or Supabase.
 * All live data access happens INSIDE the app routes; these tools are `fetch`
 * clients that POST JSON and render already-sanitized DTOs (counts / enums /
 * booleans only — never tokens, scopes, item labels, or provider bodies).
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
const REQUEST_TIMEOUT_MS = 20_000;

const OPTION_SOURCE_PATH = "/api/internal/diagnostics/option-source";
const INTEGRATION_CONNECTION_PATH = "/api/internal/diagnostics/integration-connection";

function baseUrl(): string {
  const raw = (process.env.MCP_DIAGNOSTICS_URL ?? "").trim();
  return raw.length > 0 ? raw.replace(/\/+$/, "") : DEFAULT_URL;
}

/** Result of the shared POST: either a parsed DTO or a ready-to-return message. */
type PostResult<T> = { ok: true; dto: T } | { ok: false; message: string };

/**
 * Shared transport for every Plane-B tool: check the token, POST JSON with the
 * bearer, and map transport / gate statuses to a helpful message. Returns the
 * parsed DTO on 200. Never throws.
 */
async function postDiagnostic<T>(
  path: string,
  payload: Record<string, unknown>,
): Promise<PostResult<T>> {
  const token = (process.env.MCP_DIAGNOSTICS_TOKEN ?? "").trim();
  if (!token) {
    return {
      ok: false,
      message:
        "Error: MCP_DIAGNOSTICS_TOKEN is not set. Set it (matching the app's " +
        "DIAGNOSTICS_API_TOKEN) to use live diagnostics. This is a developer tool; " +
        "the live diagnostics route is OFF by default.",
    };
  }

  const url = `${baseUrl()}${path}`;
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
    return {
      ok: false,
      message:
        `Could not reach the diagnostic API at ${url}. Is the app running and is ` +
        `MCP_DIAGNOSTICS_URL correct? (${reason})`,
    };
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401) {
    return {
      ok: false,
      message:
        "The diagnostic API rejected the request (401). Check that " +
        "MCP_DIAGNOSTICS_TOKEN matches the app's DIAGNOSTICS_API_TOKEN.",
    };
  }
  if (res.status === 404) {
    return {
      ok: false,
      message:
        "Live diagnostics are disabled or not found (404). On the app, set " +
        "DIAGNOSTICS_API_ENABLED=1 (and DIAGNOSTICS_API_ALLOW_PROD=1 in production) " +
        "to enable this read-only route.",
    };
  }
  if (res.status === 400) {
    return {
      ok: false,
      message:
        "The diagnostic API rejected the input (400). Check the required fields " +
        "for this tool (see its description).",
    };
  }
  if (res.status !== 200) {
    return { ok: false, message: `The diagnostic API returned an unexpected status ${res.status}.` };
  }

  try {
    return { ok: true, dto: (await res.json()) as T };
  } catch {
    return { ok: false, message: "The diagnostic API returned a non-JSON body." };
  }
}

// ───────────────────────── diagnose_option_source_live ─────────────────────────

/** The sanitized DTO shape the option-source route returns (mirror — no app import). */
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

function renderOptionSourceDto(dto: OptionSourceDiagnosticDTO): string {
  const lines: string[] = ["diagnose_option_source_live", `source: ${dto.source}`];
  if (dto.ok) {
    lines.push("result: OK (resolver returned successfully)");
    lines.push(`itemCount: ${dto.itemCount}`);
    lines.push(`hasMore: ${dto.hasMore}`);
  } else {
    lines.push(`result: ERROR (code: ${dto.code ?? "UNKNOWN"})`);
    if (dto.missingDependency) lines.push(`missingDependency: ${dto.missingDependency}`);
  }
  lines.push(`requiresIntegration: ${dto.requiresIntegration}`);
  lines.push(`integrationConnected: ${dto.integrationConnected}`);
  lines.push(`credentialDecision: ${dto.credentialDecision ?? "(none)"}`);

  // Enrich an error code with the static cause + next-checks (local data; the
  // explanation is added here, never carried over the wire in the DTO).
  if (!dto.ok && dto.code && OPTION_SOURCE_DIAGNOSES[dto.code]) {
    const d = OPTION_SOURCE_DIAGNOSES[dto.code]!;
    lines.push("");
    lines.push(`cause: ${d.cause}`);
    for (const c of d.nextChecks) lines.push(`next: ${c}`);
  }
  return lines.join("\n");
}

async function diagnoseOptionSourceLive(args: Record<string, unknown>): Promise<string> {
  const source = typeof args.source === "string" ? args.source.trim() : "";
  if (!source) return "Error: 'source' is required (e.g. 'slack:channels').";
  const userId = typeof args.userId === "string" ? args.userId.trim() : "";
  if (!userId) {
    return "Error: 'userId' is required — the subject to diagnose under (the affected user's id).";
  }

  const payload: Record<string, unknown> = { source, userId };
  if (typeof args.q === "string") payload.q = args.q;
  if (typeof args.workflowId === "string") payload.workflowId = args.workflowId;
  if (typeof args.nodeId === "string") payload.nodeId = args.nodeId;
  if (typeof args.deps === "object" && args.deps !== null && !Array.isArray(args.deps)) {
    payload.deps = args.deps;
  }

  const result = await postDiagnostic<OptionSourceDiagnosticDTO>(OPTION_SOURCE_PATH, payload);
  return result.ok ? renderOptionSourceDto(result.dto) : result.message;
}

// ─────────────────────── diagnose_integration_connection ───────────────────────

/** The sanitized DTO shape the integration-connection route returns (mirror — no app import). */
interface IntegrationConnectionDTO {
  ok: boolean;
  provider: string;
  accountId: string | null;
  status: string;
  activeConnectionCount: number;
  hasActiveRow: boolean;
  providerEnabled: boolean;
  refreshable: boolean;
  credentialClass: string;
  tokenExpired: boolean | null;
  scopesSatisfied: boolean;
  missingScopeCount: number;
  missingScopes?: string[];
}

/** Plain-English interpretation per status (local; never sent over the wire). */
const CONNECTION_STATUS_NOTES: Record<string, string> = {
  CONNECTED: "Connection appears usable from stored state (active, not expired, scopes satisfied).",
  DISCONNECTED: "No active connection row — the provider is not connected (or was disconnected).",
  RECONNECT_REQUIRED:
    "The access token is expired and the provider is NOT refreshable — a reconnect is likely needed.",
  TOKEN_EXPIRED:
    "The access token is expired but the provider IS refreshable — the runtime may refresh it on the next run.",
  MISSING_SCOPES:
    "Connected, but required scopes are missing — reconnect to re-consent with the missing scopes.",
  PROVIDER_DISABLED:
    "The provider is disabled in the manifest — new connects are refused (existing tokens may still work).",
  PROVIDER_UNKNOWN: "Not a registered provider id — check the spelling against the provider registry.",
  NO_ACCOUNT_ACCESS:
    "Authorization wall: the subject is not a member of this account, so no connection was inspected.",
  NOT_WORKFLOW_OWNER:
    "Provenance wall: this personal-provider connection belongs to the workflow owner; only they can diagnose it.",
};

function renderConnectionDto(dto: IntegrationConnectionDTO): string {
  const lines: string[] = [
    "diagnose_integration_connection",
    `provider: ${dto.provider}`,
    `account: ${dto.accountId ?? "(unresolved)"}`,
    `status: ${dto.status}`,
  ];
  const note = CONNECTION_STATUS_NOTES[dto.status];
  if (note) lines.push(`meaning: ${note}`);
  lines.push(`activeConnectionCount: ${dto.activeConnectionCount}`);
  lines.push(`hasActiveRow: ${dto.hasActiveRow}`);
  lines.push(`providerEnabled: ${dto.providerEnabled}`);
  lines.push(`refreshable: ${dto.refreshable}`);
  lines.push(`credentialClass: ${dto.credentialClass}`);
  lines.push(
    `tokenExpired: ${dto.tokenExpired === null ? "unknown (no expiry tracked)" : dto.tokenExpired}`,
  );
  lines.push(`scopesSatisfied: ${dto.scopesSatisfied}`);
  lines.push(`missingScopeCount: ${dto.missingScopeCount}`);
  if (dto.status === "MISSING_SCOPES" && Array.isArray(dto.missingScopes)) {
    lines.push(`missingScopes: ${dto.missingScopes.join(", ")}`);
  }
  return lines.join("\n");
}

async function diagnoseIntegrationConnection(args: Record<string, unknown>): Promise<string> {
  const provider = typeof args.provider === "string" ? args.provider.trim() : "";
  if (!provider) return "Error: 'provider' is required (e.g. 'slack').";
  const userId = typeof args.userId === "string" ? args.userId.trim() : "";
  if (!userId) {
    return "Error: 'userId' is required — the subject to diagnose under (the affected user's id).";
  }
  const accountId = typeof args.accountId === "string" ? args.accountId.trim() : "";
  const workflowId = typeof args.workflowId === "string" ? args.workflowId.trim() : "";
  if (!accountId && !workflowId) {
    return "Error: one of 'accountId' or 'workflowId' is required.";
  }

  const payload: Record<string, unknown> = { provider, userId };
  if (accountId) payload.accountId = accountId;
  if (workflowId) payload.workflowId = workflowId;
  if (typeof args.integrationId === "string" && args.integrationId.trim()) {
    payload.integrationId = args.integrationId.trim();
  }

  const result = await postDiagnostic<IntegrationConnectionDTO>(
    INTEGRATION_CONNECTION_PATH,
    payload,
  );
  return result.ok ? renderConnectionDto(result.dto) : result.message;
}

// ─────────────────────────────── registry ───────────────────────────────

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
  {
    name: "diagnose_integration_connection",
    description:
      "LIVE diagnosis of a provider's connection state for a specific account + user (e.g. 'is slack connected & usable'). Reads STORED integration state + the manifest and reports a derived status (CONNECTED / DISCONNECTED / RECONNECT_REQUIRED / TOKEN_EXPIRED / MISSING_SCOPES / PROVIDER_DISABLED / NO_ACCOUNT_ACCESS / NOT_WORKFLOW_OWNER / PROVIDER_UNKNOWN). Makes NO provider call, decrypts NO token. Returns enums/counts/booleans + the missing-scope gap names only — never tokens, the full grant, account labels, or provider bodies. Requires the diagnostics API to be enabled on the app (dev-only by default).",
    inputSchema: {
      type: "object",
      properties: {
        provider: { type: "string", description: "Provider id, e.g. 'slack', 'gmail'." },
        userId: {
          type: "string",
          description: "The subject to diagnose under — drives account-access + provenance.",
        },
        accountId: {
          type: "string",
          description: "The account whose connection to inspect. Provide this OR workflowId.",
        },
        workflowId: {
          type: "string",
          description:
            "Resolves the account + creator provenance from a workflow. Provide this OR accountId.",
        },
        integrationId: {
          type: "string",
          description:
            "Optional: pin a specific integration row (account-scoped; a row from another account reads as disconnected).",
        },
      },
      required: ["provider", "userId"],
      additionalProperties: false,
    },
    handler: diagnoseIntegrationConnection,
  },
];
