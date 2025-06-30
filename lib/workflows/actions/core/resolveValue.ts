/**
 * Resolves a value from input data using template syntax
 * Supports {{data.field}} syntax for accessing nested properties
 */
export function resolveValue(value: any, input: Record<string, any>): any {
  if (typeof value !== "string") return value
  
  const match = value.match(/^{{(.*)}}$/)
  if (match) {
    const key = match[1]
    // Basic key access, e.g., {{data.field}}
    // For simplicity, we'll support basic dot notation.
    return key.split(".").reduce((acc: any, part: any) => acc && acc[part], input)
  }
  
  return value
} 