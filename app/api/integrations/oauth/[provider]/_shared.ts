/**
 * Shared no-leak boundary for the OAuth flow routes (connect / callback /
 * ingest) under app/api/integrations/oauth/[provider]/. V2-READY-21.
 *
 * The dispatcher (`connect` / `handleCallback` / `handleTokenIngest`) throws a
 * MIX of errors:
 *   - typed errors each route maps to a STABLE safe code BEFORE its catch-all
 *     (ReconnectIdentityMismatchError, StateAccountAccessError,
 *     InvalidStateError, TokenIngestVerificationError); and
 *   - plain `Error()`s whose `.message` can carry internal detail: dispatcher
 *     config hints ("...Update services/oauth/dispatcher.ts."), client-supplied
 *     provider-hint values, raw provider OAuth error codes, and — worst —
 *     unexpected infra errors (Supabase / Postgres messages naming tables /
 *     columns / constraints, token-encryption failures, raw network errors).
 *
 * Pre-V2-READY-21 the route catch-alls echoed `err.message` straight to the
 * user: the callback into a `/apps?integration_error=` URL param (browser
 * history / referrer exposure), connect / ingest into a JSON body. That is a
 * raw-internal-leak. This boundary collapses any UNRECOGNISED error to a single
 * stable code and logs the raw message SERVER-SIDE for diagnostics. Mirrors the
 * `lifecycleErrorResponse` boundary (V2-READY-20) and the `toSafeStepError`
 * boundary (V2-READY-2).
 *
 * Returns ONLY the stable code string — each route owns its own response shape
 * (URL param vs JSON) and status. The helper changes the BODY, never the status,
 * so existing route status contracts are preserved.
 */
export function redactedOAuthErrorCode(
  err: unknown,
  context: { event: string; provider: string },
  fallbackCode: string,
): string {
  // Server-side diagnostics only. The raw message never reaches the client.
  console.error(
    JSON.stringify({
      event: context.event,
      provider: context.provider,
      message: err instanceof Error ? err.message : String(err),
    }),
  );
  return fallbackCode;
}
