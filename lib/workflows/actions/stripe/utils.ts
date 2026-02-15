/**
 * Flatten nested objects/arrays to Stripe bracket notation for form-encoded requests.
 * URLSearchParams can only handle flat key-value string pairs. Stripe's API expects
 * nested data in bracket notation:
 *   {line_items: [{price: "x", quantity: 1}]}
 *   → "line_items[0][price]=x&line_items[0][quantity]=1"
 */
export function flattenForStripe(obj: Record<string, any>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {}

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}[${key}]` : key

    if (value === null || value === undefined) {
      continue
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (typeof item === 'object' && item !== null) {
          Object.assign(result, flattenForStripe(item, `${fullKey}[${index}]`))
        } else {
          result[`${fullKey}[${index}]`] = String(item)
        }
      })
    } else if (typeof value === 'object') {
      Object.assign(result, flattenForStripe(value, fullKey))
    } else if (typeof value === 'boolean') {
      result[fullKey] = value ? 'true' : 'false'
    } else {
      result[fullKey] = String(value)
    }
  }

  return result
}
