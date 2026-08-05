/**
 * SUPABASE-TABLE-TYPING-1A — narrowing a constrained column at the repository
 * boundary (CHECK-constrained text, and — since 1C — numeric aggregates).
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

/**
 * SUPABASE-TABLE-TYPING-1D — a NULLABLE column a domain invariant requires.
 *
 * Some columns are nullable in the schema for a reason that has not arrived
 * yet: `workflows.created_by_user_id` is `ON DELETE SET NULL` so a future
 * team-member deletion (Phase D) can clear it, while today the owning user
 * cannot be deleted at all (`accounts.owner_user_id` is `ON DELETE RESTRICT`).
 * The habit that grew around that gap was to declare the column non-null in a
 * handwritten row interface — which does not make it non-null, it only stops
 * TypeScript from mentioning it. The value then flowed into billing
 * attribution and credential-owner resolution as `undefined` wearing the type
 * `string`.
 *
 * This asserts the invariant at the boundary instead. It FAILS CLOSED: a
 * workflow whose billing owner is unknown must not silently execute, be
 * attributed, or resolve someone else's credentials — it must stop and say so.
 * The value is never echoed (these are user/account identifiers).
 */
export function requireColumn<T>(column: string, value: T | null | undefined): T {
  if (value === null || value === undefined) {
    throw new Error(
      `${column}: expected a value, received ${value === null ? "null" : "undefined"}`,
    );
  }
  return value;
}

/**
 * SUPABASE-TABLE-TYPING-1C — a numeric aggregate arriving from PostgREST.
 *
 * `count(*)` and `sum(...)` are `bigint`/`numeric` in Postgres, and PostgREST
 * may serialize either as a JSON number OR as a string (numeric has no lossless
 * JSON number form). The habit that grew around that is `Number(row.runs)` —
 * which turns a NULL, an empty string or anything non-numeric into `NaN` and
 * carries it silently into a chart, a total, or a billing-adjacent comparison.
 * `NaN` then poisons every downstream sum without ever throwing.
 *
 * This FAILS CLOSED instead: an aggregate that is not a finite number is a
 * broken query result, not a zero. It deliberately does NOT default to 0 —
 * "no runs" and "the aggregate did not parse" are different facts, and only the
 * database may assert the first one.
 *
 * The offending value is NOT echoed: unlike the closed enumerations above, an
 * aggregate cell is not a known-safe vocabulary, so the error names the column
 * and the received type only.
 */
export function requireFiniteNumber(column: string, value: unknown): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(parsed)) {
    throw new Error(
      `${column}: expected a finite numeric aggregate, received ${value === null ? "null" : typeof value}`,
    );
  }
  return parsed;
}
