import {
  IntegrationActionRequiredError,
  InsufficientScopeError,
  Unauthorized401Error,
} from "@/services/oauth/refreshAndRetry";
import {
  OptionsResolverError,
  type OptionItem,
  type OptionsResolverContext,
} from "@/services/options/types";
import type { IntegrationRecord } from "@/repositories/integrations";
import {
  mcpResolverCall,
  mcpStructured,
  type McpCallToolResult,
  type McpResolverDeps,
} from "@/integrations/_shared/mcp";

/**
 * Shared helpers for the Linear option resolvers (CS-6B).
 *
 * Linear is `personal` + REFRESHABLE (24h tokens + rotating refresh), so the
 * resolvers call the official Linear MCP server's read-only list tools through
 * `refreshAndRetry` (a stale token → one refresh + retry) via the shared
 * resolver seam. Field mappings come from REAL captured evidence
 * (`mcp-evidence.json`): teams/labels `{id,name}`, users
 * `{id,name,displayName,…}`. Only id + a display label reach the browser —
 * user EMAIL is never surfaced.
 */

export const LINEAR_MCP_URL = "https://mcp.linear.app/mcp";
/** One bounded page per resolver call; authors refine via the search box. */
export const LINEAR_OPTIONS_PAGE = 50;

export function requireLinearIntegration(ctx: OptionsResolverContext): IntegrationRecord {
  if (!ctx.integration) {
    throw new OptionsResolverError("INTEGRATION_DISCONNECTED", "No active Linear connection. Connect Linear first.");
  }
  return ctx.integration;
}

/** Call a Linear read-only list tool through the shared seam; returns the raw result. */
async function linearCall(
  ctx: OptionsResolverContext,
  tool: string,
  args: Readonly<Record<string, unknown>>,
  deps?: McpResolverDeps,
): Promise<McpCallToolResult> {
  const integration = requireLinearIntegration(ctx);
  try {
    return await mcpResolverCall(
      {
        accountId: integration.accountId,
        provider: "linear",
        providerAccountId: integration.providerAccountId,
        serverUrl: LINEAR_MCP_URL,
        serverLabel: "Linear",
        tool,
        args,
      },
      deps ?? {},
    );
  } catch (err) {
    mapLinearOptionsError(err);
  }
}

/** Call a Linear list tool and return its structured payload object (`{ key: [...] }`). */
export async function linearListTool(
  ctx: OptionsResolverContext,
  tool: string,
  args: Readonly<Record<string, unknown>>,
  deps?: McpResolverDeps,
): Promise<Record<string, unknown>> {
  const structured = mcpStructured(await linearCall(ctx, tool, args, deps));
  if (!structured) {
    throw new OptionsResolverError("PROVIDER_ERROR", "Couldn't read Linear options. Try again.");
  }
  return structured;
}

/**
 * Call a Linear list tool whose result is a TOP-LEVEL array of rows (e.g.
 * `list_issue_statuses` → `[{ id, type, name }]`), which `mcpStructured`
 * intentionally rejects. Reads the array from `structuredContent` or a JSON text
 * block; never spreads a row.
 */
export async function linearListToolArray(
  ctx: OptionsResolverContext,
  tool: string,
  args: Readonly<Record<string, unknown>>,
  deps?: McpResolverDeps,
): Promise<Record<string, unknown>[]> {
  const result = await linearCall(ctx, tool, args, deps);
  let payload: unknown = Array.isArray(result.structuredContent) ? result.structuredContent : null;
  if (!payload) {
    const text = (result.content ?? []).find((b) => b.type === "text" && typeof b.text === "string")?.text;
    if (typeof text === "string") {
      try {
        const parsed = JSON.parse(text) as unknown;
        if (Array.isArray(parsed)) payload = parsed;
      } catch {
        /* not JSON */
      }
    }
  }
  if (!Array.isArray(payload)) {
    throw new OptionsResolverError("PROVIDER_ERROR", "Couldn't read Linear options. Try again.");
  }
  return payload.filter((x) => x && typeof x === "object") as Record<string, unknown>[];
}

/** Read a bounded array field off a Linear list result. */
export function linearArray(structured: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const arr = structured[key];
  return Array.isArray(arr) ? (arr.filter((x) => x && typeof x === "object") as Record<string, unknown>[]) : [];
}

export function linearHasMore(structured: Record<string, unknown>): boolean {
  return structured["hasNextPage"] === true;
}

/** `q` → a server-side search arg when non-empty (Linear list tools accept it). */
export function searchArg(ctx: OptionsResolverContext, key = "query"): Record<string, string> {
  return ctx.q.length > 0 ? { [key]: ctx.q } : {};
}

export function str(row: Record<string, unknown>, key: string): string | undefined {
  const v = row[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

export function mapLinearOptionsError(err: unknown): never {
  if (err instanceof IntegrationActionRequiredError || err instanceof Unauthorized401Error) {
    throw new OptionsResolverError("INTEGRATION_DISCONNECTED", "Reconnect Linear and try again.");
  }
  if (err instanceof InsufficientScopeError) {
    throw new OptionsResolverError("PROVIDER_REAUTH_REQUIRED", "Reconnect Linear with the required access and try again.");
  }
  if (err instanceof OptionsResolverError) throw err;
  throw new OptionsResolverError("PROVIDER_ERROR", "Couldn't load Linear options. Try again.");
}

export function sortByLabel(items: OptionItem[]): OptionItem[] {
  return [...items].sort((a, b) => a.label.localeCompare(b.label));
}
