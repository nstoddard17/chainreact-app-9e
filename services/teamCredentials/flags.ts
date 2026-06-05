/**
 * Per-node credential reassignment rollout flag
 * (Slice 4.TEAM-WORKFLOWS-CREDENTIAL-SHARING-2 / CS-1).
 *
 * Read at call time (not module load) so tests + rollout can toggle without
 * re-importing — mirrors services/workflowFolders/trashFlags.ts and
 * services/accounts/accountDeletionFlags.ts.
 *
 * CS-1 (this slice) ADDS the flag but DOES NOT consume it — there is no behavior
 * to gate yet. Later slices (CS-2 execution resolution, CS-3 consent routes,
 * CS-4 builder/options, CS-5 AI, CS-6 offboarding) read it. Default OFF: until the
 * whole arc lands and is verified, the absence of an `accepted` row keeps the
 * current creator-pin behavior unchanged regardless of this flag.
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
