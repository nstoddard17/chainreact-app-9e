/**
 * Per-node credential reassignment rollout flag
 * (Slice 4.TEAM-WORKFLOWS-CREDENTIAL-SHARING-2 / CS-1).
 *
 * Read at call time (not module load) so tests + rollout can toggle without
 * re-importing — mirrors services/workflowFolders/trashFlags.ts and
 * services/accounts/accountDeletionFlags.ts.
 *
 * The whole CS-1..CS-8 arc has landed: this flag is now read by execution
 * resolution (engine), consent routes, builder/options, AI availability, and
 * offboarding. It is the global rollout kill-switch for per-node credential
 * reassignment. Default OFF: while off, the absence of an `accepted` row keeps the
 * current creator-pin behavior unchanged and every gated path is inert — the
 * feature stays dark until deliberately enabled and production-verified.
 */

/** Env var gating per-node credential ownership / reassignment behavior. */
export const NODE_CREDENTIAL_REASSIGNMENT_FLAG =
  "ENABLE_NODE_CREDENTIAL_REASSIGNMENT";

/**
 * DEFAULT OFF. When false, later slices treat node-credential overrides as
 * inert (personal-provider steps resolve to workflow.created_by_user_id exactly
 * as today). CS-1 never calls this — it exists for the slices that follow.
 */
export function isNodeCredentialReassignmentEnabled(): boolean {
  return process.env[NODE_CREDENTIAL_REASSIGNMENT_FLAG] === "true";
}
