/**
 * Onboarding feature flags (5.ONBOARD-1).
 *
 * DEFAULT OFF — while off, the checklist routes are inert (GET returns
 * `{enabled:false}`, mutations 404), the dashboard renders nothing, and the
 * activation-time completion latch is a no-op. Read at call time (not module
 * load) so tests + rollout can toggle without re-importing — the established
 * V2 flag pattern (services/billing/billingFeatureFlags.ts).
 */

/** Env var name for the first-workflow onboarding checklist rollout flag. */
export const ONBOARDING_CHECKLIST_FLAG = "ENABLE_ONBOARDING_CHECKLIST";

/** True only when ENABLE_ONBOARDING_CHECKLIST === "true". Default false. */
export function isOnboardingChecklistEnabled(): boolean {
  return process.env[ONBOARDING_CHECKLIST_FLAG] === "true";
}

export interface OnboardingVideoConfig {
  readonly videoUrl: string;
  readonly captionsUrl: string | null;
}

/**
 * Optional "See how it works" video (5.ONBOARD-1 Batch 4). Server-configured
 * asset URLs — the content is replaceable by re-uploading at the same URL
 * without a code deploy. `null` (unset/blank) hides the entire video surface
 * (safe unavailable state — never a broken player). Captions are strongly
 * recommended; the modal renders the <track> only when configured.
 */
export function getOnboardingVideoConfig(): OnboardingVideoConfig | null {
  const videoUrl = process.env.ONBOARDING_VIDEO_URL?.trim();
  if (!videoUrl) return null;
  const captionsUrl = process.env.ONBOARDING_VIDEO_CAPTIONS_URL?.trim();
  return { videoUrl, captionsUrl: captionsUrl || null };
}
