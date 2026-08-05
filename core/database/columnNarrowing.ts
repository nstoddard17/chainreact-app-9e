/**
 * SUPABASE-TABLE-TYPING-1A — narrowing a CHECK-constrained text column.
 *
 * PostgreSQL enforces closed value sets with CHECK constraints on plain `text`
 * columns, which the Supabase generator can only describe as `string`. The
 * repositories, meanwhile, model those columns as closed TypeScript unions and
 * used to bridge the gap with an unchecked handwritten row interface — so an
 * unexpected value would have flowed straight into a plan, deletion or
 * ownership decision typed as something it is not.
 *
 * These helpers close that gap at the one place each repository maps a row, and
 * they FAIL CLOSED: an unknown value throws rather than being coerced, defaulted
 * or asserted away. The allowed sets are the repository's OWN constants (e.g.
 * `PLAN_TIERS`), never a second copy of the constraint.
 */

/** Narrow a NOT NULL constrained column, or throw naming the offending column. */
export function narrowColumn<T extends string>(
  column: string,
  allowed: readonly T[],
  value: string | null,
): T {
  if (value !== null && (allowed as readonly string[]).includes(value)) {
    return value as T;
  }
  // The value itself is included because these are closed, non-sensitive
  // enumerations (plan tiers, lifecycle states) — never identifiers or secrets.
  throw new Error(
    `${column}: unexpected value ${JSON.stringify(value)} — expected one of ${allowed.join(", ")}`,
  );
}

/** Narrow a nullable constrained column, preserving a genuine NULL. */
export function narrowNullableColumn<T extends string>(
  column: string,
  allowed: readonly T[],
  value: string | null,
): T | null {
  if (value === null) return null;
  return narrowColumn(column, allowed, value);
}
