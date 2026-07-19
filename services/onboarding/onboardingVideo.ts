/**
 * Optional onboarding video configuration (5.ONBOARD-1).
 *
 * NOT a feature flag — the onboarding checklist itself is always enabled. This
 * is content configuration: server-provided asset URLs so the video can be
 * replaced by re-uploading at the same URL without a code deploy. `null`
 * (unset/blank) hides the entire video surface (safe unavailable state — never
 * a broken player). Captions are strongly recommended; the modal renders the
 * <track> only when configured.
 */

export interface OnboardingVideoConfig {
  readonly videoUrl: string;
  readonly captionsUrl: string | null;
}

export function getOnboardingVideoConfig(): OnboardingVideoConfig | null {
  const videoUrl = process.env.ONBOARDING_VIDEO_URL?.trim();
  if (!videoUrl) return null;
  const captionsUrl = process.env.ONBOARDING_VIDEO_CAPTIONS_URL?.trim();
  return { videoUrl, captionsUrl: captionsUrl || null };
}
