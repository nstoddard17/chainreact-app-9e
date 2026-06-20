/**
 * Guidance fallback policy — SKELETON (HOSTED-HERMES-GUIDANCE-BRAIN-2).
 *
 * Decides whether, when the hosted Hermes brain is unavailable, guidance should fall back to the
 * existing OpenAI seam (as a "teacher"). Per the slice constraints, broad fallback is NOT wired:
 * the existing OpenAI seam is not yet confirmed clean for this use, so this policy returns
 * `useFallback: false` for every input until a future slice (a) confirms the seam and (b) flips
 * `ENABLE_HERMES_OPENAI_FALLBACK` ON. The flag is read so the wiring exists, but it is gated
 * behind BOTH the flag AND an explicit `seamClean` signal the caller must supply — and there is
 * no such caller yet. This decision NEVER mutates anything; it only returns a verdict.
 */

export const HERMES_OPENAI_FALLBACK_FLAG = "ENABLE_HERMES_OPENAI_FALLBACK";

/** DEFAULT OFF. */
export function isHermesOpenAiFallbackEnabled(): boolean {
  return process.env[HERMES_OPENAI_FALLBACK_FLAG] === "true";
}

export type GuidanceUnavailableReason =
  | "PROVIDER_DISABLED"
  | "PROVIDER_NOT_CONFIGURED"
  | "PROVIDER_ERROR"
  | "TIMEOUT"
  | "INVALID_RESPONSE";

export interface GuidanceFallbackInput {
  /** Why Hermes could not answer. */
  readonly hermesUnavailableReason: GuidanceUnavailableReason;
  /**
   * Whether the caller has CONFIRMED the OpenAI guidance seam is clean for this use. No caller
   * sets this today — broad fallback stays off until a future slice proves the seam.
   */
  readonly seamClean?: boolean;
}

export interface GuidanceFallbackDecision {
  readonly useFallback: boolean;
  /** Safe reason tag (never a raw error). */
  readonly reason: string;
}

/**
 * Decide fallback. Returns `useFallback: true` ONLY when the flag is ON AND the caller asserts a
 * clean seam — neither holds today, so this always returns `false`. A `PROVIDER_DISABLED` reason
 * (the brain is intentionally off) never falls back regardless.
 */
export function decideGuidanceFallback(input: GuidanceFallbackInput): GuidanceFallbackDecision {
  if (input.hermesUnavailableReason === "PROVIDER_DISABLED") {
    return { useFallback: false, reason: "hermes_disabled_no_fallback" };
  }
  if (!isHermesOpenAiFallbackEnabled()) {
    return { useFallback: false, reason: "fallback_flag_off" };
  }
  if (!input.seamClean) {
    return { useFallback: false, reason: "openai_seam_not_confirmed_clean" };
  }
  // Reached only once a future slice flips the flag AND asserts a clean seam.
  return { useFallback: true, reason: "hermes_unavailable_fallback_to_openai" };
}
