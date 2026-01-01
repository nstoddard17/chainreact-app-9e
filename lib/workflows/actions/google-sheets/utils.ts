/**
 * Google Sheets Action Utilities
 */

/**
 * Parse sheet name from various formats.
 * The sheetName might be:
 * - A plain string: "Sheet1"
 * - A JSON string: "{\"id\":0,\"name\":\"Sheet1\",...}"
 * - An object: { id: 0, name: "Sheet1", ... }
 */
export function parseSheetName(rawSheetName: any): string {
  if (!rawSheetName) {
    return ''
  }

  // If it's an object with a 'name' property, extract it
  if (typeof rawSheetName === 'object' && rawSheetName !== null) {
    return (rawSheetName as any).name || String(rawSheetName)
  }

  // If it's a string, check if it's JSON
  if (typeof rawSheetName === 'string') {
    const trimmed = rawSheetName.trim()
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed)
        return parsed?.name || rawSheetName
      } catch {
        // Not valid JSON, use as-is
        return rawSheetName
      }
    }
    return rawSheetName
  }

  return String(rawSheetName)
}
