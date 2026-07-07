/**
 * Default max due rows the refresh sweep processes per tick. Bounded so a
 * single serverless invocation stays well inside function limits: worst case
 * is one provider token exchange (~1-2 s) per row at concurrency 5.
 */
export const DEFAULT_BATCH_LIMIT = 200;
