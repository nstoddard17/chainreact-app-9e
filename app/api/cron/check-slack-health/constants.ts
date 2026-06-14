/**
 * Constants for the proactive Slack health-check cron (V2-READY-29).
 *
 * Lives in a sibling module (NOT `route.ts`) because Next.js route files may
 * only export route handlers + recognized config — any other named export fails
 * the App Router route-type check at `next build`. Tests import the value here.
 */

/** Default per-tick cap so the sweep stays bounded regardless of connection count. */
export const DEFAULT_BATCH_LIMIT = 500;
