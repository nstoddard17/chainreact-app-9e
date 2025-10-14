import { logger } from '@/lib/utils/logger'

/**
 * Evaluates a condition between a field and a value using the specified operator
 */
export function evaluateCondition(field: any, operator: string, value: any): boolean {
  // Handle null or undefined fields
  if (field === null || field === undefined) {
    if (operator === "is_empty") return true
    if (operator === "is_not_empty") return false
    if (operator === "equals") return value === null || value === undefined
    if (operator === "not_equals") return value !== null && value !== undefined
    return false
  }

  // Convert values for comparison if needed
  let fieldValue = field
  let compareValue = value

  // Try to convert strings to numbers for numeric comparisons
  if (operator.includes("greater") || operator.includes("less")) {
    if (typeof fieldValue === "string" && !isNaN(Number(fieldValue))) {
      fieldValue = Number(fieldValue)
    }
    if (typeof compareValue === "string" && !isNaN(Number(compareValue))) {
      compareValue = Number(compareValue)
    }
  }

  // Perform the comparison
  switch (operator) {
    case "equals":
      return fieldValue == compareValue // Use loose equality for more flexible matching
    case "not_equals":
      return fieldValue != compareValue
    case "contains":
      return String(fieldValue).includes(String(compareValue))
    case "not_contains":
      return !String(fieldValue).includes(String(compareValue))
    case "starts_with":
      return String(fieldValue).startsWith(String(compareValue))
    case "ends_with":
      return String(fieldValue).endsWith(String(compareValue))
    case "greater_than":
      return fieldValue > compareValue
    case "greater_than_or_equals":
      return fieldValue >= compareValue
    case "less_than":
      return fieldValue < compareValue
    case "less_than_or_equals":
      return fieldValue <= compareValue
    case "is_empty":
      return fieldValue === "" || 
             (Array.isArray(fieldValue) && fieldValue.length === 0) ||
             (typeof fieldValue === "object" && Object.keys(fieldValue).length === 0)
    case "is_not_empty":
      return fieldValue !== "" && 
             !(Array.isArray(fieldValue) && fieldValue.length === 0) &&
             !(typeof fieldValue === "object" && Object.keys(fieldValue).length === 0)
    default:
      logger.warn(`Unknown operator: ${operator}`)
      return false
  }
} 