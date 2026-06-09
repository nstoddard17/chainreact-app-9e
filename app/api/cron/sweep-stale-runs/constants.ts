/**
 * Constants for the stale-'running' workflow-run sweep cron.
 *
 * Lives in a sibling module (NOT `route.ts`) because Next.js route files may
 * only export route handlers + recognized config — any other named export
 * (`export const DEFAULT_BATCH_LIMIT`) fails the App Router route-type check at
 * `next build`. Tests import the value from here.
 */

/** Default per-tick cap so a backlog can't sweep an unbounded set in one call. */
export const DEFAULT_BATCH_LIMIT = 500;
