import { logger } from '@/lib/utils/logger'
import type { ConditionalPath, Condition } from '@/components/workflows/configuration/fields/CriteriaBuilder'

interface ExecuteFilterContext {
  config: {
    conditions: ConditionalPath[]
    stopMessage?: string
  }
  previousOutputs: Record<string, any>
  trigger?: any
}

/**
 * Execute Filter node - Stops workflow if conditions are NOT met
 * Returns success if filter passes, stops workflow if filter fails
 */
export async function executeFilter(context: ExecuteFilterContext) {
  try {
    const { config, previousOutputs } = context
    const { conditions, stopMessage } = config

    if (!conditions || conditions.length === 0) {
      throw new Error('No filter conditions configured')
    }

    // Use the first path as the filter conditions
    const filterPath = conditions[0]
    const filterPassed = evaluateFilterConditions(filterPath, previousOutputs)

    if (filterPassed) {
      logger.info('Filter conditions passed, continuing workflow')

      return {
        success: true,
        filterPassed: true,
        data: {
          filterPassed: true,
          reason: 'All filter conditions met',
        }
      }
    } else {
      // Filter failed - stop workflow
      const reason = stopMessage || 'Filter conditions not met'

      logger.info('Filter conditions failed, stopping workflow', { reason })

      return {
        success: false,
        filterPassed: false,
        stopWorkflow: true, // Signal to workflow engine to stop
        reason,
        data: {
          filterPassed: false,
          reason,
        }
      }
    }
  } catch (error: any) {
    logger.error('Error executing filter node:', error)
    return {
      success: false,
      error: error.message || 'Failed to evaluate filter conditions',
    }
  }
}

/**
 * Evaluate if filter conditions are met
 */
function evaluateFilterConditions(path: ConditionalPath, data: Record<string, any>): boolean {
  const { conditions, logicOperator } = path

  if (conditions.length === 0) {
    return true // No conditions = pass through
  }

  const results = conditions.map(condition => evaluateCondition(condition, data))

  if (logicOperator === 'and') {
    return results.every(r => r === true)
  } else {
    return results.some(r => r === true)
  }
}

/**
 * Evaluate a single condition
 */
function evaluateCondition(condition: Condition, data: Record<string, any>): boolean {
  const { field, operator, value } = condition

  // Get the actual value from data
  let actualValue = getNestedValue(data, field)

  // Resolve variable if needed
  let compareValue = value
  if (condition.isVariable && value.startsWith('{{') && value.endsWith('}}')) {
    const varPath = value.slice(2, -2).trim()
    compareValue = getNestedValue(data, varPath)
  }

  // Evaluate based on operator
  switch (operator) {
    case 'equals':
      return actualValue == compareValue

    case 'not_equals':
      return actualValue != compareValue

    case 'contains':
      if (typeof actualValue === 'string' && typeof compareValue === 'string') {
        return actualValue.toLowerCase().includes(compareValue.toLowerCase())
      }
      if (Array.isArray(actualValue)) {
        return actualValue.includes(compareValue)
      }
      return false

    case 'not_contains':
      if (typeof actualValue === 'string' && typeof compareValue === 'string') {
        return !actualValue.toLowerCase().includes(compareValue.toLowerCase())
      }
      if (Array.isArray(actualValue)) {
        return !actualValue.includes(compareValue)
      }
      return true

    case 'starts_with':
      if (typeof actualValue === 'string' && typeof compareValue === 'string') {
        return actualValue.toLowerCase().startsWith(compareValue.toLowerCase())
      }
      return false

    case 'ends_with':
      if (typeof actualValue === 'string' && typeof compareValue === 'string') {
        return actualValue.toLowerCase().endsWith(compareValue.toLowerCase())
      }
      return false

    case 'greater_than':
      return Number(actualValue) > Number(compareValue)

    case 'less_than':
      return Number(actualValue) < Number(compareValue)

    case 'greater_equal':
      return Number(actualValue) >= Number(compareValue)

    case 'less_equal':
      return Number(actualValue) <= Number(compareValue)

    case 'is_empty':
      return !actualValue || actualValue === '' || (Array.isArray(actualValue) && actualValue.length === 0)

    case 'is_not_empty':
      return !!actualValue && actualValue !== '' && (!Array.isArray(actualValue) || actualValue.length > 0)

    case 'is_true':
      return actualValue === true || actualValue === 'true' || actualValue === 1

    case 'is_false':
      return actualValue === false || actualValue === 'false' || actualValue === 0

    default:
      logger.warn(`Unknown operator: ${operator}`)
      return false
  }
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: any, path: string): any {
  if (!path) return undefined

  const keys = path.split('.')
  let current = obj

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined
    }
    current = current[key]
  }

  return current
}
