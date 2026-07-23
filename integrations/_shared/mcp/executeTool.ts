/**
 * Shared MCP tool-execution SEAM (CS-3 LINEAR-1).
 *
 * Every generated MCP-catalog handler is a thin adapter that strict-parses its
 * pre-resolved config and calls `executeMcpTool`. This module is the ONE place
 * MCP-catalog actions actually reach a remote server, so every cross-cutting
 * guarantee lives here exactly once:
 *
 *   1. Credential resolution + 401 refresh — the call runs inside
 *      `refreshAndRetry`, so token decrypt, the personal-provider creator pin,
 *      and one refresh+retry cycle all behave identically to native providers.
 *   2. Pinned-schema drift refusal BEFORE any write — the live `tools/list`
 *      inputSchema is re-hashed (`schemaHash`) and compared to the schema hash
 *      certified at generate time. ANY change (or a vanished tool) fails closed
 *      with `McpSchemaDriftError` / `McpToolNotFoundError`; uncertified args are
 *      never sent (CLAUDE.md drift rules; plan §4.5/§4.8).
 *   3. Bounded outputs — the result is projected onto the declared output key
 *      set only. The raw MCP response is never spread into workflow variables
 *      (rule 5); provider hosts / URLs never leak (rule 7).
 *   4. Bounded transport — a per-call timeout + response-size ceiling, and the
 *      shipped secret redaction on every error path.
 *   5. Errors propagate — auth/permission map to the canonical reconnect UX;
 *      everything else throws for the engine to classify as HANDLER_FAILED
 *      (rule 8). No `{success:false}` envelope.
 *
 * There is NO provider-specific logic here beyond the per-action arg mapping the
 * generated handler already performed (its `.strict()` schema shapes `args`).
 */

import { schemaHash } from "@/core/mcpCompile";
import {
  Unauthorized401Error,
  InsufficientScopeError,
} from "@/services/oauth/refreshAndRetry";
import { refreshAndRetry } from "@/services/oauth/refreshAndRetry";
import {
  createMcpClient,
  McpAuthError,
  McpPermissionError,
  McpProtocolError,
  McpSchemaDriftError,
  McpToolNotFoundError,
  type McpCallToolResult,
  type McpClientOptions,
  type McpClient,
} from "@/integrations/_shared/mcp";

/** Per-call transport bounds. Uniform from day one (plan §4.5). */
const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_MAX_RESPONSE_BYTES = 1_000_000;

/** Output field value type — mirrors the generated meta's `OutputMeta.type`. */
export type McpOutputFieldType =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "array"
  | "fileRef"
  | "unknown";

/** Bounded output declaration — mirrors the generated meta's outputs. */
export type McpOutputSpec =
  | { readonly kind: "text" }
  | {
      readonly kind: "structured";
      readonly fields: ReadonlyArray<{
        readonly name: string;
        readonly type: McpOutputFieldType;
      }>;
    };

export interface ExecuteMcpToolInput {
  readonly provider: string;
  /** Canonical MCP server URL from the provider's committed catalog. */
  readonly serverUrl: string;
  readonly tool: string;
  /** V2 account that owns the integration row (engine-supplied). */
  readonly accountId: string;
  /** Strict-parsed action config; keys mirror the tool's argument names. */
  readonly args: Readonly<Record<string, unknown>>;
  /** sha256 of the certified inputSchema — drift refusal pin. */
  readonly pinnedSchemaHash: string;
  readonly output: McpOutputSpec;
  /**
   * Retry-safety. Reads pass `true` (safe to auto-retry on a transient error);
   * writes pass `false` (default) so a transient failure is surfaced, never a
   * silently duplicated write. Set by the generator from the catalog risk class.
   */
  readonly idempotent?: boolean;
}

export interface ExecuteMcpToolResult {
  readonly output: Readonly<Record<string, unknown>>;
}

/**
 * Test seam — real engine calls omit this and get the shipped client +
 * `refreshAndRetry`. Tests inject a fake client factory / token wrapper so the
 * only mocked boundary is the external provider (e2e philosophy).
 */
export interface ExecuteMcpToolDeps {
  readonly createClient?: (opts: McpClientOptions) => McpClient;
  readonly refreshAndRetry?: typeof refreshAndRetry;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
}

/** "linear" → "Linear". Human-safe error label; never carries the token. */
function serverLabelFor(provider: string): string {
  return provider.length === 0
    ? provider
    : provider[0]!.toUpperCase() + provider.slice(1);
}

export async function executeMcpTool(
  input: ExecuteMcpToolInput,
  deps: ExecuteMcpToolDeps = {},
): Promise<ExecuteMcpToolResult> {
  const runRefresh = deps.refreshAndRetry ?? refreshAndRetry;
  const makeClient = deps.createClient ?? createMcpClient;
  const serverLabel = serverLabelFor(input.provider);
  const idempotent = input.idempotent ?? false;

  const result = await runRefresh<McpCallToolResult>({
    accountId: input.accountId,
    provider: input.provider,
    // Personal-credential providers (Linear) resolve via the engine's creator
    // pin; account providers ignore it. Either way the handler never knows a
    // provider-account id, exactly like the Eden precedent.
    providerAccountId: null,
    apiCall: async (accessToken) => {
      const client = makeClient({
        endpoint: input.serverUrl,
        accessToken,
        serverLabel,
        timeoutMs: deps.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxResponseBytes: deps.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
      });
      try {
        await assertNoDrift(client, input, serverLabel);
        return await client.callTool(input.tool, { ...input.args }, { idempotent });
      } catch (err) {
        // Map transport auth failures into the refreshAndRetry contract so a
        // 401 drives exactly one refresh + retry; a scope failure drives the
        // reconnect-with-permission UX. Everything else (drift, not-found,
        // rate-limit, transport, protocol) propagates for engine classification.
        if (err instanceof McpAuthError) {
          throw new Unauthorized401Error(`${serverLabel} returned HTTP 401 (Unauthorized).`);
        }
        if (err instanceof McpPermissionError) {
          throw new InsufficientScopeError(
            `Your ${serverLabel} connection lacks permission for this action. Reconnect ${serverLabel} with the required access.`,
            input.provider,
          );
        }
        throw err;
      }
    },
  });

  return { output: normalizeOutput(result, input.output, serverLabel) };
}

/**
 * Refuse to call an uncertified schema. Reads the live `tools/list`, finds the
 * pinned tool, re-hashes its inputSchema, and compares to the certified hash.
 * A removed tool or ANY schema change fails closed — the certified allowlist is
 * the guard, and the reviewed catalog must never execute against a schema no
 * human approved (plan §4.8; CLAUDE.md drift rules). `tools/list` is idempotent,
 * so a 401 during discovery still routes through refresh.
 */
async function assertNoDrift(
  client: McpClient,
  input: ExecuteMcpToolInput,
  serverLabel: string,
): Promise<void> {
  const listed = await client.listTools();
  const live = listed.tools.find((t) => t.name === input.tool);
  if (!live) {
    // Allowlisted tool vanished from the server → treat as drift (fail closed).
    throw new McpToolNotFoundError(serverLabel, input.tool);
  }
  const liveHash = schemaHash(live.inputSchema ?? {});
  if (liveHash !== input.pinnedSchemaHash) {
    throw new McpSchemaDriftError(
      serverLabel,
      input.tool,
      "input schema no longer matches the version certified for this action",
    );
  }
}

// ─── Output normalization (bounded) ──────────────────────────────────────────

/** All text content blocks joined; falls back to stringified structured content. */
function extractText(result: McpCallToolResult): string {
  const texts = (result.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string);
  if (texts.length > 0) return texts.join("\n");
  if (result.structuredContent !== undefined && result.structuredContent !== null) {
    return JSON.stringify(result.structuredContent);
  }
  return "";
}

/** The tool's structured payload as a plain object, or null if none is available. */
function structuredObject(result: McpCallToolResult): Record<string, unknown> | null {
  if (result.structuredContent && typeof result.structuredContent === "object" && !Array.isArray(result.structuredContent)) {
    return result.structuredContent as Record<string, unknown>;
  }
  // Some servers return the structured payload as JSON in the first text block.
  const firstText = (result.content ?? []).find((b) => b.type === "text" && typeof b.text === "string")?.text;
  if (typeof firstText === "string") {
    try {
      const parsed = JSON.parse(firstText) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // not JSON — no structured object available
    }
  }
  return null;
}

/** True when `value` matches the declared field type. `null`/absent are always allowed. */
function matchesType(type: McpOutputFieldType, value: unknown): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value);
    case "unknown":
      return true;
    case "fileRef":
      // FileRef staging is not implemented for MCP outputs yet; a tool that
      // declares one must not ship until the file-output contract is wired.
      return false;
  }
}

/**
 * Project a tool result onto EXACTLY the declared output keys. Never spreads the
 * raw response; never adds undeclared keys. A declared field that is present but
 * the wrong type fails honestly (the certified output shape is a contract).
 */
export function normalizeOutput(
  result: McpCallToolResult,
  spec: McpOutputSpec,
  serverLabel: string,
): Record<string, unknown> {
  if (spec.kind === "text") {
    return { text: extractText(result) };
  }

  const structured = structuredObject(result);
  if (!structured) {
    throw new McpProtocolError(
      serverLabel,
      "expected a structured tool result but none was returned",
    );
  }

  const out: Record<string, unknown> = {};
  for (const field of spec.fields) {
    const raw = structured[field.name];
    if (raw === undefined || raw === null) {
      out[field.name] = null;
      continue;
    }
    if (field.type === "fileRef") {
      throw new McpProtocolError(
        serverLabel,
        `output field "${field.name}" declares fileRef, which MCP catalog outputs do not support yet`,
      );
    }
    if (!matchesType(field.type, raw)) {
      throw new McpProtocolError(
        serverLabel,
        `output field "${field.name}" had an unexpected type (expected ${field.type})`,
      );
    }
    out[field.name] = raw;
  }
  return out;
}
