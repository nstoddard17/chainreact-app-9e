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

/** The return payload for a public RPC, exactly as Supabase generates it. */
export type RpcReturns<K extends PublicRpcName> = Database["public"]["Functions"][K]["Returns"];

/**
 * RPC-RETURN-CONTRACT-GUARD-1 — the RESULT side.
 *
 * Two facts drive everything below, and both are proved against the catalog by
 * `scripts/ci/rpc-signature-guard.mjs`:
 *
 * 1. A `jsonb`-returning function generates `Returns: Json`. `Json` is a union
 *    (string | number | boolean | null | object | array), so it carries NO field
 *    information — `RpcReturns<"apply_business_upgrade">` cannot be dotted into.
 *    A compile-time type therefore CANNOT protect these results; only runtime
 *    validation can. Those live in `core/database/rpcResultSchemas.ts`.
 *
 * 2. For `TABLE(...)`-returning functions the generator emits precise column
 *    types but marks every column NON-nullable. PostgreSQL does not track
 *    nullability of function output columns at all, so that non-nullability is
 *    an artifact of the generator, not a database guarantee — several of these
 *    functions genuinely return NULL columns (`get_account_member_identities.email`,
 *    `schedule_account_deletion.out_account_id`). Taking `RpcReturns` literally
 *    would LOSE null-safety the previous handwritten casts had, so row helpers
 *    below re-permit null. Same reasoning as `RpcArgs`.
 */
/** One row of a set-returning (`TABLE(...)` / `SETOF`) RPC, nulls permitted. */
export type RpcRow<K extends PublicRpcName> =
  RpcReturns<K> extends readonly (infer R)[] ? NullPermitting<R> : never;

/** The rows of a set-returning RPC. PostgREST returns an array, possibly empty. */
export type RpcRows<K extends PublicRpcName> = ReadonlyArray<RpcRow<K>>;

/**
 * A scalar-returning RPC's value. A SQL function may always return NULL (and
 * these do — `find_user_id_by_email` returns NULL for an unknown address), which
 * the generator does not express.
 */
export type RpcScalar<K extends PublicRpcName> = RpcReturns<K> | null;
