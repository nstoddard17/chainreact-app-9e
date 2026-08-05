/**
 * RPC-SIGNATURE-DRIFT-GUARD-1 — compile-time contracts for Postgres RPC calls,
 * derived ENTIRELY from the generated `types/database.types.ts`.
 *
 * There is deliberately no hand-written function signature here and there never
 * should be: a second, manually maintained RPC type system would drift from the
 * database exactly the way the callers did. Everything below is a projection of
 * the generated `Database` type, which db-ci regenerates from a clean local
 * reset and fails on drift.
 *
 * Usage — annotate the argument object, never the values:
 *
 *   const args = {
 *     p_account_id: accountId,
 *     p_ai_credits_limit: limit,
 *   } satisfies RpcArgs<"apply_business_upgrade">;
 *
 * `satisfies` changes nothing at runtime and does not widen the inferred type,
 * but it fails compilation when an argument is misnamed, missing, removed from
 * the database, or the wrong type — the exact drift that shipped stale
 * `apply_business_upgrade` / `apply_business_downgrade` callers.
 *
 * Argument NAMES and required/optional status are additionally proven against
 * the live migrated catalog by `scripts/ci/rpc-signature-guard.mjs`, so the
 * generated type these helpers project is itself verified.
 */
import type { Database } from "@/types/database.types";

/** Every function PostgREST exposes on the public schema. */
export type PublicRpcName = keyof Database["public"]["Functions"];

/** The generated argument object, exactly as Supabase emits it. */
export type RpcArgsStrict<K extends PublicRpcName> = Database["public"]["Functions"][K]["Args"];

/**
 * Every property may additionally be `null`.
 *
 * A Postgres parameter accepts NULL unless the function body rejects it — but
 * Supabase's generator emits parameters as non-nullable, so a caller that
 * legitimately passes `currentPeriodEnd ?? null` would be rejected by the raw
 * generated type. Mapped types preserve the `?` modifier, so required vs.
 * optional, the argument NAMES, and the base types are all still enforced.
 */
type NullPermitting<T> = { [P in keyof T]: T[P] | null };

/**
 * The argument contract for a public RPC: the database's own argument names,
 * required/optional status and base types, permitting explicit SQL NULLs.
 *
 * Use `RpcArgsStrict` instead where the call never passes null.
 */
export type RpcArgs<K extends PublicRpcName> = NullPermitting<RpcArgsStrict<K>>;

/** The return payload for a public RPC, exactly as the database declares it. */
export type RpcReturns<K extends PublicRpcName> = Database["public"]["Functions"][K]["Returns"];
