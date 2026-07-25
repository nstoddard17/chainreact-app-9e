/**
 * PROCESS-LOCAL in-flight coalescing for connected-analytics queries (CD-2).
 *
 * Several identical cold-cache requests in one server process share ONE
 * execution: the first caller (leader) runs `work()`; followers await the
 * same promise. Keys are the SAME isolation-safe identity as the snapshot
 * cache key (account + optional personal source-user + source + dataset +
 * full normalized query), so cross-account or cross-user coalescing is
 * impossible by construction. Entries are removed on settle (success AND
 * failure — a rejection is shared by current waiters but never poisons later
 * requests), plus a defensive TTL sweep for abandoned entries. This is
 * per-instance only; the Postgres limiter provides cross-instance protection.
 */

const inflight = new Map<string, { promise: Promise<unknown>; startedAt: number }>();

/** Defensive cap — an entry older than this is treated as abandoned. */
const MAX_ENTRY_AGE_MS = 120_000;

function sweep(now: number): void {
  for (const [key, entry] of inflight) {
    if (now - entry.startedAt > MAX_ENTRY_AGE_MS) inflight.delete(key);
  }
}

export interface CoalesceOutcome<T> {
  result: T;
  /** True for the caller that actually executed `work()`. */
  leader: boolean;
}

export async function coalesceInflight<T>(
  key: string,
  work: () => Promise<T>,
): Promise<CoalesceOutcome<T>> {
  const now = Date.now();
  sweep(now);
  const existing = inflight.get(key);
  if (existing) {
    return { result: (await existing.promise) as T, leader: false };
  }
  const promise = (async () => work())();
  inflight.set(key, { promise, startedAt: now });
  try {
    const result = await promise;
    return { result, leader: true };
  } finally {
    // Remove on settle regardless of outcome; a later retry executes fresh.
    if (inflight.get(key)?.promise === promise) inflight.delete(key);
  }
}

/** Test-only: reset process state. */
export function __resetInflightForTesting(): void {
  inflight.clear();
}
