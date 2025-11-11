import { logger } from '@/lib/utils/logger'
import type { ConditionalPath, Condition } from '@/components/workflows/configuration/fields/CriteriaBuilder'

interface ExecuteRouterContext {
  config: {
    mode: 'filter' | 'router'
    conditions: ConditionalPath[]
    stopMessage?: string
  }
  previousOutputs: Record<string, any>
  trigger?: any
}

/**
 * Execute Router node - Unified handler for both filter and multi-path routing
 *
 * Filter mode: Stops workflow if conditions are NOT met
 * Router mode: Routes to first matching path, or else path if no match
 */
export async function executeRouter(context: ExecuteRouterContext) {
  try {
    const { config, previousOutputs } = context
    const { mode, conditions, stopMessage } = config

    if (!conditions || conditions.length === 0) {
      throw new Error('No routing conditions configured')
    }

    const isFilterMode = mode === 'filter'

    if (isFilterMode) {
      // Filter mode: Use first path, stop if it doesn't match
      return executeFilterMode(conditions[0], previousOutputs, stopMessage)
    } else {
      // Router mode: Evaluate paths in order, take first match
      return executeRouterMode(conditions, previousOutputs)
    }
  } catch (error: any) {
    logger.error('Error executing router node:', error)
    return {
      success: false,
      error: error.message || 'Failed to evaluate routing conditions',
    }
  }
}

/**
 * Execute in filter mode - binary pass/fail
 */
function executeFilterMode(
  filterPath: ConditionalPath,
  previousOutputs: Record<string, any>,
  stopMessage?: string
) {
  const filterPassed = evaluatePathConditions(filterPath, previousOutputs)

  if (filterPassed) {
    logger.info('[Router:Filter] Conditions passed, continuing workflow')

    return {
      success: true,
      filterPassed: true,
      data: {
        mode: 'filter',
        filterPassed: true,
        pathTaken: 'continue',
        conditionsMet: true,
        reason: 'All filter conditions met',
      }
    }
  } else {
    // Filter failed - stop workflow
    const reason = stopMessage || 'Filter conditions not met'

    logger.info('[Router:Filter] Conditions failed, stopping workflow', { reason })

    return {
      success: false,
      filterPassed: false,
      stopWorkflow: true, // Signal to workflow engine to stop
      reason,
      data: {
        mode: 'filter',
        filterPassed: false,
        pathTaken: 'stopped',
        conditionsMet: false,
        reason,
      }
    }
  }
}

/**
 * Execute in router mode - multi-path routing
 */
function executeRouterMode(
  paths: ConditionalPath[],
  previousOutputs: Record<string, any>
) {
  const evaluatedPaths: Array<{ name: string; conditionsMet: boolean }> = []
  let matchedPath: ConditionalPath | null = null

  // Evaluate paths in order, take first match
  for (const path of paths) {
    const conditionsMet = evaluatePathConditions(path, previousOutputs)
    evaluatedPaths.push({ name: path.name, conditionsMet })

    if (conditionsMet && !matchedPath) {
      matchedPath = path
      logger.info(`[Router:Multi-path] Matched path: ${path.name}`)
      break // Take first match
    }
  }

  const pathTaken = matchedPath ? matchedPath.name : 'Else'

  logger.info('[Router:Multi-path] Routing decision:', {
    pathTaken,
    evaluatedPaths
  })

  return {
    success: true,
    routingComplete: true,
    pathTaken, // Used by workflow engine to determine which edge to follow
    data: {
      mode: 'router',
      pathTaken,
      conditionsMet: !!matchedPath,
      evaluatedPaths,
    }
  }
}

/**
 * Evaluate if path conditions are met
 */
function evaluatePathConditions(path: ConditionalPath, data: Record<string, any>): boolean {
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
