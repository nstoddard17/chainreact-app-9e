/**
 * Internal MCP server — plain-English notes for connection `status` codes.
 *
 * Shared by the connection render functions in `diagnoseLive.ts`
 * (`diagnose_integration_connection`) and `diagnoseWorkflow.ts`
 * (`diagnose_workflow_connections`). The app DTO carries ONLY the status code
 * (the safe reason code) — never explanatory prose; the human-readable note is
 * mapped HERE, MCP-side, so one map serves every connection tool.
 *
 * LOCAL MCP module — no app import. Pure static data.
 */
export const CONNECTION_STATUS_NOTES: Record<string, string> = {
  CONNECTED:
    "Connection appears usable from stored state (active, not expired, scopes satisfied).",
  DISCONNECTED:
    "No active connection row — the provider is not connected (or was disconnected).",
  RECONNECT_REQUIRED:
    "The access token is expired and the provider is NOT refreshable — a reconnect is likely needed.",
  TOKEN_EXPIRED:
    "The access token is expired but the provider IS refreshable — the runtime may refresh it on the next run.",
  MISSING_SCOPES:
    "Connected, but required scopes are missing — reconnect to re-consent with the missing scopes.",
  PROVIDER_DISABLED:
    "The provider is disabled in the manifest — new connects are refused (existing tokens may still work).",
  PROVIDER_UNKNOWN:
    "Not a registered provider id — check the spelling against the provider registry.",
  NO_ACCOUNT_ACCESS:
    "Authorization wall: the subject is not a member of this account, so no connection was inspected.",
  NOT_WORKFLOW_OWNER:
    "Provenance wall: this personal-provider connection belongs to the workflow owner; only they can diagnose it.",
};
