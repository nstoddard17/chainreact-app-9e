/**
 * Shared MCP tool-execution SEAM (CS-2).
 *
 * Generated MCP-catalog handlers call `executeMcpTool` with their strict-
 * parsed config, the certification-pinned tool schema hash, and a bounded
 * output spec. The REAL implementation — credential lookup via
 * `refreshAndRetry`, `McpClient.callTool` with pre-send drift refusal
 * (`detectSchemaDrift`), structured/text result normalization into the
 * declared output keys — is the executor slice (plan CS-3).
 *
 * Until then this seam only pins the contract and FAILS CLOSED: generated
 * handlers typecheck and are testable, and any premature invocation throws a
 * typed, no-leak error instead of pretending to run. Nothing registers these
 * handlers yet (CLAUDE.md rule 14 — orphan files are not shipped surface).
 */

/** Bounded output declaration — mirrors the generated meta's outputs. */
export type McpOutputSpec =
  | { readonly kind: "text" }
  | {
      readonly kind: "structured";
      readonly fields: ReadonlyArray<{
        readonly name: string;
        readonly type: "string" | "number" | "boolean" | "object" | "array" | "fileRef" | "unknown";
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
  /** sha256 of the certified inputSchema — drift refusal pin (CS-3). */
  readonly pinnedSchemaHash: string;
  readonly output: McpOutputSpec;
}

export interface ExecuteMcpToolResult {
  readonly output: Readonly<Record<string, unknown>>;
}

/** Thrown until the CS-3 executor lands. Carries no config/token material. */
export class McpExecutorNotAvailableError extends Error {
  constructor(provider: string, tool: string) {
    super(
      `MCP execution for '${provider}:${tool}' is not available yet — the shared executor ships in the next slice (CS-3). This action is not registered; reaching this error indicates a wiring bug.`,
    );
    this.name = "McpExecutorNotAvailableError";
  }
}

export async function executeMcpTool(
  input: ExecuteMcpToolInput,
): Promise<ExecuteMcpToolResult> {
  throw new McpExecutorNotAvailableError(input.provider, input.tool);
}
