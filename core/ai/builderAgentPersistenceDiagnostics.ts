/**
 * Builder Agent persistence diagnostics (Slice 4.AI-25 follow-up).
 *
 * Live observation (Marcus, 2026-05-27): the React Agent chat appeared to
 * "clear on refresh". The chat persistence layer (AI-23) was reachable in
 * code, but the local Supabase DB had NOT received the AI-23 migration —
 * so `getOrCreateThreadForWorkflow` threw:
 *
 *   "Could not find the table 'public.builder_agent_threads' in the
 *    schema cache"
 *
 * The route returned a generic 500 with no server log; the client's
 * fail-open `console.warn` showed only the raw error string. A V2
 * developer running the app locally for the first time after this slice
 * had no obvious signal that the fix was `supabase db push`.
 *
 * This module is the central place to translate that class of error into
 * a dev-friendly diagnostic string the route, client, and tests can all
 * agree on. It's intentionally tiny — string-pattern detection + a fixed
 * remediation hint. Add new patterns here when new dev-time failure
 * modes surface.
 *
 * Server-side only? No — the client warn path also uses
 * `formatPersistenceErrorForDev` to add the hint when it sees a 500 body
 * carrying the diagnostic. Importable from both sides because it has no
 * Supabase / Next.js / Node dependencies.
 */

/**
 * Pattern signals that a Postgres / PostgREST error is about a MISSING
 * table (typical when a migration hasn't been applied yet). Three signals:
 *   - The PostgREST schema-cache message ("Could not find the table
 *     'public.<x>' in the schema cache" — PGRST205 / "table not found in
 *     schema cache").
 *   - Postgres SQLSTATE 42P01 ("undefined_table") if the driver surfaces
 *     the bare code.
 *   - Supabase-JS error shape that mentions "relation … does not exist".
 */
const SCHEMA_CACHE_PATTERNS: readonly RegExp[] = [
  /Could not find the table .* in the schema cache/i,
  /\bschema cache\b/i,
  /PGRST205/,
  /\b42P01\b/,
  /relation .* does not exist/i,
];

export function isMissingTableError(message: string | undefined | null): boolean {
  if (!message) return false;
  return SCHEMA_CACHE_PATTERNS.some((p) => p.test(message));
}

/**
 * One-line remediation hint shown alongside the raw error in dev logs +
 * dev-time console.warns. Stable string so tests can assert on it.
 */
export const MIGRATION_HINT =
  "Builder Agent persistence is unavailable — the public.builder_agent_threads / public.builder_agent_messages tables are missing. " +
  "Run `supabase db push` (or `supabase migration up`) to apply pending migrations, " +
  "then restart the dev server if PostgREST's schema cache still reports the table as missing.";

/**
 * Format an error for a developer-visible log line. The result is safe to
 * send into `console.warn` / `console.error` / `logger.warn` and to embed
 * in a structured 500 response body's `diagnostic` field. Production
 * surfaces should NOT expose the migration hint to end users — wrap calls
 * accordingly.
 */
export function formatPersistenceErrorForDev(
  err: unknown,
  context: { readonly route?: string; readonly op?: string } = {},
): string {
  const baseMessage = err instanceof Error ? err.message : String(err);
  const parts: string[] = [];
  if (context.route) parts.push(`route=${context.route}`);
  if (context.op) parts.push(`op=${context.op}`);
  const prefix = parts.length > 0 ? `[${parts.join(" ")}] ` : "";
  if (isMissingTableError(baseMessage)) {
    return `${prefix}${baseMessage}\n  ${MIGRATION_HINT}`;
  }
  return `${prefix}${baseMessage}`;
}

/**
 * Structured 500 body the routes return when a persistence call fails.
 * `code = "PERSISTENCE_UNAVAILABLE"` lets the client distinguish this
 * from auth / not-found / validation errors. `migrationHint` is non-null
 * only when the error matched a missing-table pattern; the client uses
 * its presence to upgrade its dev-side console.warn with the remediation
 * note.
 */
export interface PersistenceErrorResponseBody {
  readonly error: string;
  readonly code: "PERSISTENCE_UNAVAILABLE";
  readonly migrationHint?: string;
}

export function buildPersistenceErrorBody(
  err: unknown,
  fallbackMessage: string,
): PersistenceErrorResponseBody {
  const message = err instanceof Error ? err.message : String(err);
  const body: PersistenceErrorResponseBody = {
    error: fallbackMessage,
    code: "PERSISTENCE_UNAVAILABLE",
  };
  if (isMissingTableError(message)) {
    return { ...body, migrationHint: MIGRATION_HINT };
  }
  return body;
}
