import {
  MCP_SCOPE_ACCOUNTS_READ,
  MCP_SCOPE_WORKFLOWS_READ,
  MCP_SCOPE_RUNS_READ,
  MCP_SCOPE_INTEGRATIONS_READ,
  type McpScope,
} from "@/core/mcp/scopes";
import * as accountsRepo from "@/repositories/accounts";
import { getRoleServiceRole } from "@/repositories/accountMemberships";
import * as workflowsRepo from "@/repositories/workflows";
import * as runsRepo from "@/repositories/workflowRuns";
import * as integrationsRepo from "@/repositories/integrations";
import {
  toMcpAccountDto,
  toMcpWorkflowSummaryDto,
  toMcpWorkflowDetailDto,
  toMcpRunSummaryDto,
  toMcpRunDetailDto,
  toMcpIntegrationDto,
} from "./serialize";

/**
 * Public MCP tool registry (Slice 4.PUBLIC-MCP-6).
 *
 * The CUSTOMER-FACING tool set — deliberately SEPARATE from the internal developer
 * MCP registry (scripts/mcp). Six read-only tools, each:
 *   - declares a single required scope (the server gates scope BEFORE dispatch),
 *   - reads ONLY within the verified token's account (`ctx.accountId`),
 *   - CROSS-CHECKS that any requested workflow/run belongs to that account (rule d)
 *     — a foreign id resolves to the same `not_found` as a nonexistent one (no
 *     cross-account existence leak),
 *   - returns data exclusively through the allow-listed serializers (no leak).
 *
 * No tool mutates state, triggers a workflow, decrypts a token, or reaches another
 * account. There is no repo-tool, shell, git, deploy, DB-admin, or secret access of
 * any kind on this surface.
 */

export interface McpToolContext {
  accountId: string;
  userId: string;
  scopes: string[];
}

export type McpToolFailureReason = "invalid_args" | "not_found";

export type McpToolResult =
  | { ok: true; data: unknown }
  | { ok: false; reason: McpToolFailureReason };

export interface McpToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the tool's arguments (MCP `inputSchema`). */
  inputSchema: Record<string, unknown>;
  requiredScope: McpScope;
  handler: (ctx: McpToolContext, args: Record<string, unknown>) => Promise<McpToolResult>;
}

/** Read a required non-empty string arg, or null. */
function readStringArg(args: Record<string, unknown>, key: string): string | null {
  const v = args[key];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

/** Read an optional positive-int limit arg, clamped to [1, max]. */
function readLimitArg(args: Record<string, unknown>, fallback: number, max: number): number {
  const v = args["limit"];
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return fallback;
  return Math.min(Math.floor(v), max);
}

const NO_ARGS_SCHEMA = { type: "object", properties: {}, additionalProperties: false } as const;

export const MCP_TOOLS: readonly McpToolDefinition[] = [
  {
    name: "list_accounts",
    description:
      "List the ChainReact account this token can access, with your role on it. " +
      "MCP tokens are scoped to exactly one account; this returns that account.",
    inputSchema: NO_ARGS_SCHEMA,
    requiredScope: MCP_SCOPE_ACCOUNTS_READ,
    async handler(ctx) {
      const account = await accountsRepo.getByIdServiceRole(ctx.accountId);
      const role = await getRoleServiceRole(ctx.accountId, ctx.userId);
      // The verify path already confirmed membership; role should be present. If the
      // membership vanished between verify and here, return an empty list (no leak).
      if (!account || role === null) return { ok: true, data: { accounts: [] } };
      return { ok: true, data: { accounts: [toMcpAccountDto(account, role)] } };
    },
  },
  {
    name: "list_workflows",
    description:
      "List the workflows in your account (id, name, state, timestamps), newest " +
      "first. Does not include workflow configuration.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max workflows to return (1-200, default 100)." },
      },
      additionalProperties: false,
    },
    requiredScope: MCP_SCOPE_WORKFLOWS_READ,
    async handler(ctx, args) {
      const limit = readLimitArg(args, 100, 200);
      const rows = await workflowsRepo.listByAccountServiceRole(ctx.accountId, { limit });
      return { ok: true, data: { workflows: rows.map(toMcpWorkflowSummaryDto) } };
    },
  },
  {
    name: "get_workflow",
    description:
      "Get one workflow by id: its metadata plus the node/edge structure " +
      "(provider, action type, connections). Never includes node configuration " +
      "values, which may contain secrets.",
    inputSchema: {
      type: "object",
      properties: { workflow_id: { type: "string", description: "The workflow id." } },
      required: ["workflow_id"],
      additionalProperties: false,
    },
    requiredScope: MCP_SCOPE_WORKFLOWS_READ,
    async handler(ctx, args) {
      const workflowId = readStringArg(args, "workflow_id");
      if (!workflowId) return { ok: false, reason: "invalid_args" };
      const wf = await workflowsRepo.getByIdServiceRole(workflowId);
      // Account cross-check (rule d): foreign / missing / deleted → identical not_found.
      if (!wf || wf.accountId !== ctx.accountId || wf.state === "deleted") {
        return { ok: false, reason: "not_found" };
      }
      return { ok: true, data: { workflow: toMcpWorkflowDetailDto(wf) } };
    },
  },
  {
    name: "list_runs",
    description:
      "List recent workflow runs in your account (status, timing, trigger source, " +
      "humanized error). Optionally filter to one workflow with workflow_id. Does " +
      "not include step outputs or raw trigger payloads.",
    inputSchema: {
      type: "object",
      properties: {
        workflow_id: { type: "string", description: "Optional: only runs of this workflow." },
        limit: { type: "number", description: "Max runs to return (1-100, default 25)." },
      },
      additionalProperties: false,
    },
    requiredScope: MCP_SCOPE_RUNS_READ,
    async handler(ctx, args) {
      const limit = readLimitArg(args, 25, 100);
      const workflowId = readStringArg(args, "workflow_id");

      if (workflowId) {
        // Verify the workflow is in this account before listing its runs (rule d).
        const wf = await workflowsRepo.getByIdServiceRole(workflowId);
        if (!wf || wf.accountId !== ctx.accountId) return { ok: false, reason: "not_found" };
        const runs = await runsRepo.listByWorkflow(workflowId, { limit });
        return {
          ok: true,
          data: {
            runs: runs.map((r) =>
              toMcpRunSummaryDto({
                id: r.id,
                workflowId: r.workflowId,
                status: r.status,
                isTest: r.isTest,
                triggeredBy: r.triggeredBy,
                startedAt: r.startedAt,
                finishedAt: r.finishedAt,
                errorClassification: r.errorClassification,
              }),
            ),
          },
        };
      }

      // No workflow filter → the account-scoped display reader (already safe-narrowed).
      const rows = await runsRepo.listByAccountForDisplay(ctx.accountId, { limit });
      return {
        ok: true,
        data: {
          runs: rows.map((r) =>
            toMcpRunSummaryDto({
              id: r.id,
              workflowId: r.workflowId,
              status: r.status,
              isTest: r.isTest,
              triggeredBy: r.triggeredBy,
              startedAt: r.startedAt,
              finishedAt: r.finishedAt,
              errorClassification: r.errorClassification,
            }),
          ),
        },
      };
    },
  },
  {
    name: "get_run_details",
    description:
      "Get one run by id: status, timing, per-step status with machine error codes, " +
      "and a humanized error summary. Never includes step outputs, raw provider " +
      "payloads, or engine internals.",
    inputSchema: {
      type: "object",
      properties: { run_id: { type: "string", description: "The run id." } },
      required: ["run_id"],
      additionalProperties: false,
    },
    requiredScope: MCP_SCOPE_RUNS_READ,
    async handler(ctx, args) {
      const runId = readStringArg(args, "run_id");
      if (!runId) return { ok: false, reason: "invalid_args" };
      const run = await runsRepo.getById(runId);
      // Account cross-check (rule d): a run from another account → not_found.
      if (!run || run.accountId !== ctx.accountId) return { ok: false, reason: "not_found" };
      return { ok: true, data: { run: toMcpRunDetailDto(run) } };
    },
  },
  {
    name: "list_integrations",
    description:
      "List the connected apps (integrations) in your account: provider, the " +
      "account's own label, status, and connect time. Never includes OAuth tokens, " +
      "secrets, scopes, or raw provider data.",
    inputSchema: NO_ARGS_SCHEMA,
    requiredScope: MCP_SCOPE_INTEGRATIONS_READ,
    async handler(ctx) {
      const rows = await integrationsRepo.listActiveByAccount(ctx.accountId);
      return { ok: true, data: { integrations: rows.map(toMcpIntegrationDto) } };
    },
  },
];

const TOOLS_BY_NAME: ReadonlyMap<string, McpToolDefinition> = new Map(
  MCP_TOOLS.map((t) => [t.name, t]),
);

export function getMcpTool(name: string): McpToolDefinition | undefined {
  return TOOLS_BY_NAME.get(name);
}
