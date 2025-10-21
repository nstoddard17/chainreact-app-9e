import { logger } from '@/lib/utils/logger'
import type { ConditionalPath, Condition } from '@/components/workflows/configuration/fields/CriteriaBuilder'

interface ExecutePathContext {
  config: {
    paths: ConditionalPath[]
  }
  previousOutputs: Record<string, any>
  trigger?: any
}

/**
 * Execute Path node - Routes workflow based on conditions
 * Returns which path to take (pathA, pathB, else, etc.)
 */
export async function executePath(context: ExecutePathContext) {
  try {
    const { config, previousOutputs } = context
    const { paths } = config

    if (!paths || paths.length === 0) {
      throw new Error('No paths configured')
    }

    // Evaluate each path in order
    for (const path of paths) {
      const pathMet = evaluatePath(path, previousOutputs)

      if (pathMet) {
        logger.info(`Path "${path.name}" conditions met`, {
          pathId: path.id,
          pathName: path.name,
        })

        return {
          success: true,
          pathTaken: path.id,
          pathName: path.name,
          conditionsMet: true,
          data: {
            pathTaken: path.id,
            pathName: path.name,
            conditionsMet: true,
          }
        }
      }
    }

    // No paths matched - take else path
    logger.info('No path conditions met, taking else path')

    return {
      success: true,
      pathTaken: 'else',
      pathName: 'Else',
      conditionsMet: false,
      data: {
        pathTaken: 'else',
        pathName: 'Else',
        conditionsMet: false,
      }
    }
  } catch (error: any) {
    logger.error('Error executing path node:', error)
    return {
      success: false,
      error: error.message || 'Failed to evaluate path conditions',
    }
  }
}

/**
 * Evaluate if a path's conditions are met
 */
function evaluatePath(path: ConditionalPath, data: Record<string, any>): boolean {
  const { conditions, logicOperator } = path

  if (conditions.length === 0) {
    return false
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
 * Example: getNestedValue({ user: { name: 'John' } }, 'user.name') => 'John'
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
