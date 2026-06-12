/**
 * Integration disconnect rollout flag (Slice 4.APPS-DISCONNECT / CD-1).
 *
 * Read at call time (not module load) so tests + rollout can toggle without
 * re-importing — mirrors services/teamCredentials/flags.ts and
 * services/workflowFolders/trashFlags.ts.
 *
 * DEFAULT OFF. While off, `disconnectIntegration` refuses at the service entry
 * (`feature_disabled`) and performs NO read, authz check, write, revoke, or
 * cascade — so the whole CD-1 path is inert in production until deliberately
 * enabled and verified. CD-3 (the DELETE route) gates on the same flag.
 */

/** Env var gating the connected-app disconnect path. */
export const INTEGRATION_DISCONNECT_FLAG = "ENABLE_INTEGRATION_DISCONNECT";

/**
 * DEFAULT OFF. When false, the disconnect service entry returns
 * `{ ok: false, reason: "feature_disabled" }` before touching anything.
 */
export function isIntegrationDisconnectEnabled(): boolean {
  return process.env[INTEGRATION_DISCONNECT_FLAG] === "true";
}
