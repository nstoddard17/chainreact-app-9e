/**
 * SUPABASE-TABLE-TYPING-1A — table contracts, projected ENTIRELY from the
 * generated `types/database.types.ts`.
 *
 * As with `types/rpc.ts`, there is deliberately no hand-written table shape
 * here and there never should be: a duplicated interface is exactly what drifts
 * from the database. `db-ci` regenerates the source of truth from a clean local
 * reset and fails on drift.
 *
 * Usage:
 *
 *   const patch = {
 *     plan: nextPlan,
 *     ai_credits_limit: nextLimit,
 *   } satisfies TableUpdate<"account_billing">;
 *
 * Use `Insert` for inserts and `Update` for partial writes — never `Row`, which
 * would demand database-managed columns (ids, timestamps, trigger-populated
 * values) the caller must not supply.
 *
 * For a PARTIAL select, do NOT reach for `TableRow`: let Supabase infer the
 * projection, or write `Pick<TableRow<"t">, "a" | "b">`. Typing a projection as
 * a full row claims columns the query never fetched.
 */
import type { Database } from "@/types/database.types";

/** Every table on the public schema. */
export type TableName = keyof Database["public"]["Tables"];

/** A complete row, exactly as the database declares it. */
export type TableRow<Name extends TableName> = Database["public"]["Tables"][Name]["Row"];

/** The insert contract: required columns required, defaulted columns optional. */
export type TableInsert<Name extends TableName> = Database["public"]["Tables"][Name]["Insert"];

/** The partial-write contract. */
export type TableUpdate<Name extends TableName> = Database["public"]["Tables"][Name]["Update"];

/** A named projection of a row — the honest type for a partial select. */
export type TableColumns<Name extends TableName, Columns extends keyof TableRow<Name>> = Pick<
  TableRow<Name>,
  Columns
>;
