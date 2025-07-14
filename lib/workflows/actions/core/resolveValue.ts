/**
 * Resolves a value from input data using template syntax
 * Supports {{data.field}} and {{trigger.field}} syntax for accessing nested properties
 * If a trigger variable is referenced and not present in input, uses mockTriggerOutputs if provided
 */
export function resolveValue(
  value: any,
  input: Record<string, any>,
  mockTriggerOutputs?: Record<string, any>
): any {
  if (typeof value !== "string") return value
  
  const match = value.match(/^{{(.*)}}$/)
  if (match) {
    const key = match[1]
    // Basic key access, e.g., {{data.field}} or {{trigger.messageId}}
    const parts = key.split(".")
    // If referencing trigger output
    if (parts[0] === "trigger" && mockTriggerOutputs) {
      const triggerKey = parts[1]
      if (
        mockTriggerOutputs[triggerKey] &&
        (mockTriggerOutputs[triggerKey].example !== undefined || mockTriggerOutputs[triggerKey].value !== undefined)
      ) {
        // Prefer .value if present, else .example
        return mockTriggerOutputs[triggerKey].value ?? mockTriggerOutputs[triggerKey].example
      }
    }
    // Fallback to input
    return parts.reduce((acc: any, part: any) => acc && acc[part], input)
  }
  
  return value
} 