import { resolveValue } from '@/lib/workflows/actions/core/resolveValue'
import { logger } from '@/lib/utils/logger'

/**
 * Validates that a variable resolves to a non-empty value
 * @param value The field value (may contain variables like {{node.field}})
 * @param input The input context for variable resolution
 * @returns Error message if variable is unresolved/empty, undefined otherwise
 */
export function validateVariableResolution(
  value: any,
  input: Record<string, any>,
  fieldName?: string
): string | undefined {
  // Skip validation for non-string values
  if (typeof value !== 'string') {
    return undefined
  }

  // Check if the value contains a variable
  const variableRegex = /\{\{([^}]+)\}\}/g
  const matches = value.match(variableRegex)

  if (!matches || matches.length === 0) {
    return undefined // No variables to validate
  }

  // Check if the entire value is a single variable (e.g., "{{node.field}}")
  const isSingleVariable = /^\{\{[^}]+\}\}$/.test(value.trim())

  if (isSingleVariable) {
    // Resolve the variable
    const resolved = resolveValue(value, input)

    // Check if it resolved to undefined or empty
    if (
      resolved === undefined ||
      resolved === null ||
      resolved === '' ||
      resolved === value // Variable didn't resolve (still has curly braces)
    ) {
      // Extract variable name for better error message
      const variableName = value.replace(/^\{\{|\}\}$/g, '').trim()

      return `Variable "${variableName}" is not available. Make sure the previous node has been executed and produced output.`
    }
  } else {
    // Value contains embedded variables (e.g., "Hello {{node.name}}")
    // Resolve and check if any variables remained unresolved
    const resolved = resolveValue(value, input)

    if (typeof resolved === 'string' && /\{\{([^}]+)\}\}/.test(resolved)) {
      // Some variables were not resolved
      const unresolvedMatches = resolved.match(variableRegex)
      if (unresolvedMatches) {
        const unresolvedVars = unresolvedMatches.map(v =>
          v.replace(/^\{\{|\}\}$/g, '').trim()
        ).join(', ')

        return `Variables not available: ${unresolvedVars}. Make sure the previous node has been executed.`
      }
    }
  }

  return undefined
}

/**
 * Validates all fields with variables in their values
 * @param config Current form values
 * @param input Input context for variable resolution
 * @param fields Optional list of specific fields to validate
 * @returns Object with field errors
 */
export function validateAllVariables(
  config: Record<string, any>,
  input: Record<string, any>,
  fields?: string[]
): Record<string, string> {
  const errors: Record<string, string> = {}

  const fieldsToValidate = fields || Object.keys(config)

  fieldsToValidate.forEach(fieldName => {
    const value = config[fieldName]
    const error = validateVariableResolution(value, input, fieldName)

    if (error) {
      errors[fieldName] = error
    }
  })

  return errors
}

/**
 * Checks if a value contains any variables
 * @param value The value to check
 * @returns True if the value contains variables
 */
export function containsVariables(value: any): boolean {
  if (typeof value !== 'string') {
    return false
  }

  return /\{\{([^}]+)\}\}/.test(value)
}

/**
 * Extracts all variable names from a value
 * @param value The value to extract variables from
 * @returns Array of variable names (without curly braces)
 */
export function extractVariableNames(value: any): string[] {
  if (typeof value !== 'string') {
    return []
  }

  const variableRegex = /\{\{([^}]+)\}\}/g
  const matches = value.matchAll(variableRegex)

  return Array.from(matches).map(match => match[1].trim())
}
