/**
 * Hosted-Hermes guidance rollout flag (HOSTED-HERMES-GUIDANCE-FOUNDATION-1).
 *
 * Read at call time (not module load) so tests + rollout can toggle without re-import —
 * mirrors `services/apiKeys/flags.ts`. DEFAULT OFF: the hosted guidance adapter is inert
 * until this is `"true"` AND the HERMES_* env is configured AND a transport is wired (a
 * later slice). This foundation slice ships no transport, so the flag gates nothing live.
 */

/** Env var gating the hosted Hermes workflow-guidance adapter. */
export const HOSTED_HERMES_GUIDANCE_FLAG = "ENABLE_HOSTED_HERMES_GUIDANCE";

/** DEFAULT OFF. When false, the hosted adapter returns `PROVIDER_DISABLED` and never calls out. */
export function isHostedHermesGuidanceEnabled(): boolean {
  return process.env[HOSTED_HERMES_GUIDANCE_FLAG] === "true";
}
