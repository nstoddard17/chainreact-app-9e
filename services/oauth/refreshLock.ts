/**
 * Process-local single-flight lock for OAuth token refreshes.
 *
 * Per docs/rules/oauth-dispatcher.md §"Edge cases" — concurrent refreshes for
 * the same `(userId, provider, accountId)` triple must collapse into one
 * provider call. The first caller starts the refresh; subsequent callers
 * wait on the same Promise and receive the same result. Without this, ten
 * parallel API calls hitting 401 simultaneously would each request a new
 * token, hammering the provider's refresh endpoint and racing each other to
 * write the row (with rotating-refresh-token providers, the loser's token
 * is invalidated server-side mid-flight).
 *
 * Scope: in-process only. Two Node processes serving the same user can each
 * trigger an independent refresh — the multi-instance distributed lock
 * (advisory locks via Postgres `pg_advisory_xact_lock`, or a Redis-backed
 * mutex) is explicitly deferred per the Slice 2 plan. For Slice 2b's
 * single-process dev / single-instance prod, this is sufficient.
 *
 * Lock key shape: `${userId}:${provider}:${accountId ?? "default"}` —
 * matches the `(user_id, provider, provider_account_id)` row-scoping the
 * `integrations` table uses. A user with two Slack workspaces refreshes
 * each independently.
 */

const inFlight = new Map<string, Promise<unknown>>();

export interface RefreshLockKeyInput {
  /** V2 owner account of the integration. */
  accountId: string;
  provider: string;
  /** Provider-side account discriminator (Slack team_id, etc.). */
  providerAccountId: string | null;
  /**
   * Provenance pin (Slice 4.ACCOUNT-MODEL-22B). When a PERSONAL-credential
   * lookup is pinned to a specific connector, the lock must be per-connector
   * too — otherwise two members refreshing the same provider concurrently
   * would collapse into one refresh and share a single (wrong) result.
   * Appended only when present, so account-shared keys stay byte-identical to
   * the pre-22B format.
   */
  connectedByUserId?: string | null;
}

export function refreshLockKey(input: RefreshLockKeyInput): string {
  const base = `${input.accountId}:${input.provider}:${input.providerAccountId ?? "default"}`;
  return input.connectedByUserId != null
    ? `${base}:${input.connectedByUserId}`
    : base;
}

/**
 * Run `fn` under the single-flight lock for `key`. If a refresh is already
 * in-flight for the same key, return that in-flight Promise instead of
 * starting a new one. The lock entry is cleared after `fn` settles
 * (resolves or rejects) so subsequent calls re-run `fn`.
 *
 * Concurrent callers MUST be requesting the same logical operation — the
 * dispatcher's `refresh()` is the only intended caller, and all callers
 * for the same key are by construction asking to refresh the same row.
 */
export async function withRefreshLock<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = (async () => {
    try {
      return await fn();
    } finally {
      inFlight.delete(key);
    }
  })();
  inFlight.set(key, promise);
  return promise;
}

/**
 * Test-only escape hatch: clear all in-flight entries. Production code
 * never calls this; some test setups need it to reset state between
 * cases that intentionally trigger lock entries.
 */
export function __resetRefreshLockForTests(): void {
  inFlight.clear();
}
