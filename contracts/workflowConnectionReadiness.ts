/**
 * Wire shape for the workflow connection-readiness API
 * (`POST /api/workflows/[id]/connection-readiness`) — REACT-AGENT-READINESS-1.
 *
 * This MIRRORS the sanitized `WorkflowConnectionsDTO` the server brain
 * (`services/diagnostics/integrationConnection.ts`) returns. It is duplicated here
 * as a CLIENT-side contract because `lib/api/**` may not import from `@/services`
 * (server-only boundary). It carries ONLY the already-redacted facts the brain
 * emits — enums / counts / booleans / node ids / public scope-gap names — never
 * tokens, connectedByUserId, providerAccountId, displayName, accountMetadata, or
 * any node config value.
 *
 * If the server DTO grows a new SAFE field the readiness panel needs, add it here
 * too; the route serializes the DTO verbatim, so extra fields are simply ignored
 * by the cast until declared.
 */

export interface WorkflowProviderConnectionEntryDTO {
  readonly provider: string;
  readonly name: string | null;
  readonly credentialClass: "personal" | "account";
  readonly nodeIds: readonly string[];
  readonly nodeCount: number;
  /** Reason-code string, e.g. CONNECTED / DISCONNECTED / MISSING_SCOPES / NEEDS_RECONNECT / TOKEN_EXPIRED / PROVIDER_DISABLED / NO_ACTIVE_CONNECTION. */
  readonly status: string;
  readonly ready: boolean;
  readonly providerEnabled: boolean;
  readonly refreshable: boolean;
  readonly tokenExpired: boolean | null;
  readonly scopesSatisfied: boolean;
  readonly missingScopeCount: number;
  readonly missingScopes?: readonly string[];
  readonly reconnectNeeded: boolean;
  readonly canReconnect: boolean;
}

export interface WorkflowConnectionReadinessDTO {
  readonly workflowId: string;
  readonly access: "OK" | "NOT_FOUND" | "NO_ACCOUNT_ACCESS";
  /** Present only when access === "OK". */
  readonly allRequiredConnected?: boolean;
  readonly providers?: readonly WorkflowProviderConnectionEntryDTO[];
}
