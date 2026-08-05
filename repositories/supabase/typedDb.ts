import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

/**
 * SUPABASE-TABLE-TYPING-1A — the scoped typed entry point for TABLE access.
 *
 * WHY NOT JUST TYPE THE FACTORY
 * -----------------------------
 * Typing `getServiceRoleClient` as `SupabaseClient<Database>` compiles 69
 * errors across ~30 repositories at once — an uncontrolled diff spanning
 * billing, workflow runs, integrations, analytics and credentials. It also
 * makes `.rpc()` argument types strictly non-nullable, which is WRONG: a
 * Postgres parameter accepts NULL, the generator just cannot say so (the same
 * artifact `RpcArgs` already works around). Callers legitimately passing
 * `x ?? null` would break.
 *
 * So table access is migrated repository by repository through this helper,
 * while `.rpc()` keeps flowing through the untyped client where it is already
 * guarded on both sides by `RpcArgs` / `RpcReturns` +
 * `scripts/ci/rpc-signature-guard.mjs`.
 *
 * THIS IS NOT A SECOND CLIENT ARCHITECTURE
 * ----------------------------------------
 * It is an identity function. It constructs nothing, connects to nothing, and
 * returns the SAME cached runtime client it was handed — only the static type
 * changes. There is no cast: the factory's row generic is `any`, so the value
 * narrows on assignment.
 *
 * CONVERGENCE PATH
 * ----------------
 * When every repository in `scripts/ci/typed-db-manifest.json` covers the whole
 * repository tree, `getServiceRoleClient` / `createClient` return
 * `SupabaseClient<Database>` directly and this helper is deleted in the same
 * batch. It exists to bound a migration, not to live forever.
 */
export function asTypedDb(client: SupabaseClient): SupabaseClient<Database> {
  return client;
}
