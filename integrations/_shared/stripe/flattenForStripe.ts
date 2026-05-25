/**
 * Flatten nested objects/arrays to Stripe bracket notation for
 * `application/x-www-form-urlencoded` request bodies.
 *
 * `URLSearchParams` accepts only flat key-value string pairs. Stripe's
 * REST API expects nested data in PHP-style bracket notation:
 *
 *   { customer: { email: "x@y.com" } }
 *     → "customer[email]=x@y.com"
 *
 *   { line_items: [{ price: "price_1", quantity: 2 }] }
 *     → "line_items[0][price]=price_1&line_items[0][quantity]=2"
 *
 * Without this layer, `new URLSearchParams({ customer: { email } })`
 * silently stringifies the object as `[object Object]`, causing
 * Stripe to return `parameter_invalid_string`. V1 hit this in
 * production (see V1's `lib/workflows/actions/stripe/utils.ts:1-35`
 * and `__tests__/workflows/stripe-flatten.test.ts:144-160` regression
 * guard).
 *
 * Behavior:
 *   - Recursively flattens nested objects + arrays-of-objects.
 *   - Drops `null` / `undefined` entirely (NOT stringified to "null").
 *   - Booleans serialize as the literal strings `"true"` / `"false"`
 *     (Stripe's form-encoding requirement; NOT `"1"` / `"0"`).
 *   - All other primitives are `String()`-coerced.
 *   - Empty arrays produce no entries (no `tags[]=`).
 *
 * Exact V1 port — V1's behavior is battle-tested and aligns with
 * Stripe's wire-format; V2 keeps the same shape.
 */
export function flattenForStripe(
  obj: Readonly<Record<string, unknown>>,
  prefix = "",
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}[${key}]` : key;

    if (value === null || value === undefined) {
      continue;
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (typeof item === "object" && item !== null) {
          Object.assign(
            result,
            flattenForStripe(
              item as Readonly<Record<string, unknown>>,
              `${fullKey}[${index}]`,
            ),
          );
        } else if (item !== null && item !== undefined) {
          result[`${fullKey}[${index}]`] =
            typeof item === "boolean" ? (item ? "true" : "false") : String(item);
        }
      });
    } else if (typeof value === "object") {
      Object.assign(
        result,
        flattenForStripe(
          value as Readonly<Record<string, unknown>>,
          fullKey,
        ),
      );
    } else if (typeof value === "boolean") {
      result[fullKey] = value ? "true" : "false";
    } else {
      result[fullKey] = String(value);
    }
  }

  return result;
}
