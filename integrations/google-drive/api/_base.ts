/**
 * Google Drive API base URLs.
 *
 * Drive's metadata API and its upload API live under different hosts in
 * production (`www.googleapis.com` vs. `www.googleapis.com/upload`). For
 * the e2e mock both can target the same loopback host; the
 * `GOOGLE_DRIVE_API_BASE` and `GOOGLE_DRIVE_UPLOAD_BASE` env vars are
 * e2e-only overrides that let the Drive walkthrough's mock server own
 * both roots without coupling them to OAuth bases.
 *
 * Two separate vars (instead of one) so a Drive upload can hit a
 * different mock surface than a Drive metadata call if a test ever needs
 * to exercise that distinction. In production both default to the same
 * googleapis.com origin.
 */

export function driveApiBase(): string {
  return process.env.GOOGLE_DRIVE_API_BASE ?? "https://www.googleapis.com";
}

export function driveUploadBase(): string {
  return process.env.GOOGLE_DRIVE_UPLOAD_BASE ?? "https://www.googleapis.com";
}
