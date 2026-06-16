/**
 * Active-revision execution rollout flag (V2-READY-41B).
 *
 * Read at call time (not module load) so tests + rollout can toggle without
 * re-importing — mirrors services/apiKeys/flags.ts and
 * services/teamCredentials/flags.ts.
 *
 * 41B ONLY gates the EXECUTION read path. When OFF (default), live execution
 * reads `workflow.draftDefinition` exactly as before. When ON, the engine reads
 * the workflow's immutable active revision (falling back to draft when
 * `active_revision_id` is null — e.g. legacy workflows, or activations whose
 * revision snapshot failed best-effort). Activation-time revision snapshotting
 * happens regardless of this flag; the flag only changes what EXECUTION reads.
 * Default OFF until parity verification (CS-6 in the active-revision plan).
 */

/** Env var gating whether execution reads the active revision instead of the draft. */
export const ACTIVE_REVISION_EXECUTION_FLAG = "ENABLE_ACTIVE_REVISION_EXECUTION";

/**
 * DEFAULT OFF. When false, execution reads `draftDefinition` (pre-41B behavior,
 * byte-identical). When true, execution reads the active revision via
 * `getActiveDefinition`.
 */
export function isActiveRevisionExecutionEnabled(): boolean {
  return process.env[ACTIVE_REVISION_EXECUTION_FLAG] === "true";
}
