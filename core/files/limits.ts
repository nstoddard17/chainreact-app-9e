/**
 * FileRef per-provider size guidance.
 *
 * Per docs/slices/p-s3-file-output-contract-plan.md §4 / §5:
 *   - The FileRefSchema deliberately does NOT carry a hard size cap;
 *     providers enforce their own at upload time and the producer /
 *     consumer side of a chain are responsible for honoring it.
 *   - This module publishes the *guidance* numbers (in bytes) so
 *     planners, UIs, and pre-flight checks can warn before bytes
 *     actually move. Values mirror the provider documentation as of
 *     2026-05 and intentionally err on the conservative side
 *     (provider docs sometimes advertise higher caps for non-default
 *     plans; the constants here match the default free-tier limit).
 *   - Hard enforcement (quotas / per-plan caps / virus scanning) is
 *     Phase 7 work — see §11 decision #4. P-S3 ships guidance only.
 */

const MB = 1024 * 1024;

/**
 * Recommended maximum per provider, in bytes.
 *
 * Keys are V2 provider ids (lowercase, kebab/underscore). The `default`
 * entry is the catch-all the runtime falls back to when no provider-
 * specific entry exists.
 */
export const FILE_REF_SIZE_GUIDANCE = {
  /** Catch-all default for providers without an explicit entry. */
  default: 25 * MB,
  slack: 25 * MB,
  "google-drive": 25 * MB,
  gmail: 25 * MB,
  "microsoft-onedrive": 4 * MB,
  outlook: 3 * MB,
  // Slice 3.MONDAY-4 — Monday's per-file limit is 500 MB on paid plans
  // but the advisory guidance mirrors the conservative free-tier ceiling
  // (Monday's documented default upload limit). add_file warns past this;
  // Monday enforces the hard cap at upload time.
  monday: 25 * MB,
  // Slice 3.DROPBOX-2 — Dropbox single-shot /2/files/upload caps at
  // 150 MB; larger files need the resumable upload_session flow (deferred
  // to DROPBOX-N). upload_file warns past this; Dropbox enforces the hard
  // cap at upload time.
  dropbox: 150 * MB,
} as const;

export type FileRefSizeGuidanceProvider = keyof typeof FILE_REF_SIZE_GUIDANCE;

/**
 * Look up the recommended cap for a provider id. Returns the `default`
 * value when the provider has no specific entry — the runtime never
 * needs to special-case "unknown provider".
 */
export function getFileRefSizeGuidance(provider: string): number {
  if (provider in FILE_REF_SIZE_GUIDANCE) {
    return FILE_REF_SIZE_GUIDANCE[provider as FileRefSizeGuidanceProvider];
  }
  return FILE_REF_SIZE_GUIDANCE.default;
}
