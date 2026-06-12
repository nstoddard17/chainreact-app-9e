/**
 * Explicit connection-sharing rollout flag (Slice 4.CONN-SHARE / CS-1).
 *
 * Read at call time (not module load) so tests + rollout can toggle without
 * re-importing — mirrors services/teamCredentials/flags.ts and
 * services/accounts/accountDeletionFlags.ts.
 *
 * TEMPORARY dev guard, NOT a permanently-hidden feature (plan §0.9): it exists
 * so the CS-2+ slices (toggle service, run/edit gate, execution resolver, Apps
 * surface) can land inert while in flight, and is flipped on — or removed — once
 * the arc is complete and verified. Default OFF.
 *
 * CS-1 NEVER calls this. The column + pure helpers CS-1 ships are behavior-inert;
 * this accessor exists only for the slices that follow, which stay dark until it
 * is deliberately enabled and production-verified.
 */

/** Env var gating explicit connection-sharing behavior. */
export const CONNECTION_SHARING_FLAG = "ENABLE_CONNECTION_SHARING";

/**
 * DEFAULT OFF. When false, every later connection-sharing path is inert
 * (personal-provider connections stay private_to_connector exactly as today).
 */
export function isConnectionSharingEnabled(): boolean {
  return process.env[CONNECTION_SHARING_FLAG] === "true";
}
