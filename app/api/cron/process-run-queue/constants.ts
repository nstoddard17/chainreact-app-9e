/**
 * Constants for the durable run-queue processor cron.
 *
 * Lives in a sibling module (NOT `route.ts`) because Next.js route files may only
 * export route handlers + recognized config — any other named export fails the
 * App Router route-type check at `next build`. Tests import the value from here.
 */

/**
 * Default queued runs drained per tick. Small because each entry is a FULL
 * workflow execution (not a cheap UPDATE like the stale-run sweep): the inline
 * run-now drain handles the happy path, so the cron normally finds ~0 and only
 * recovers runs whose inline drain never ran or crashed before claiming. Each
 * run is bounded by the engine; the batch is bounded so a tick stays inside
 * `maxDuration`. A larger backlog drains across subsequent ticks.
 */
export const DEFAULT_QUEUE_BATCH_LIMIT = 10;
