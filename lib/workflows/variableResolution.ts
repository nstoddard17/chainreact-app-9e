/**
 * Variable Resolution Utilities
 * 
 * Provides functions to resolve variable references to their actual values
 * from test results or workflow execution data
 */

import { useWorkflowTestStore } from '@/stores/workflowTestStore'
import { parseVariableReference, normalizeVariableReference } from './variableReferences'

/**
 * Resolves a variable reference to its actual value
 * @param variableRef - The variable reference (e.g., "{{AI Agent.output}}")
 * @param workflowData - The workflow data containing nodes and edges
 * @param testResults - Optional test results to get actual values
 * @returns The resolved value or the original variable reference if not found
 */
export function resolveVariableValue(
  variableRef: string, 
  workflowData: { nodes: any[], edges: any[] },
  testResults?: any
): string {
  const normalized = normalizeVariableReference(variableRef)
  const parsed = parseVariableReference(normalized)
  if (!parsed) return normalized

  if (parsed.kind === 'trigger') {
    const triggerNode = workflowData.nodes.find(n => n.data?.isTrigger)
    if (!triggerNode) return normalized
    const fieldValue = parsed.fieldPath.reduce((acc: any, key) => acc?.[key], triggerNode.data)
    return fieldValue !== undefined ? String(fieldValue) : normalized
  }

  if (parsed.kind !== 'node' || !parsed.nodeId) return normalized

  const node = workflowData.nodes.find(n => n.id === parsed.nodeId || n.data?.type === parsed.nodeId || n.data?.title === parsed.nodeId)
  if (!node) return normalized
  
  // If we have test results, try to get the actual value
  if (testResults && testResults[node.id]) {
    const nodeResult = testResults[node.id]
    
    if (nodeResult.output) {
      let current: any = nodeResult.output
      for (const segment of parsed.fieldPath) {
        if (current == null) break
        current = current[segment]
      }

      if (current !== undefined && current !== null) {
        return typeof current === 'string' ? current : JSON.stringify(current)
      }
    }
  }
  
  // Fallback to variable reference if we can't resolve it
  return normalized
}

/**
 * Recursively flattens nested objects and extracts all leaf values
 * Handles common API response patterns automatically
 *
 * @param obj - The object to flatten
 * @param prefix - Current path prefix for nested keys
 * @param maxDepth - Maximum depth to traverse (prevents infinite recursion)
 * @param currentDepth - Current depth in recursion
 * @returns Flattened object with all accessible values
 */
function flattenObject(
  obj: any,
  prefix: string = '',
  maxDepth: number = 3,
  currentDepth: number = 0
): Record<string, any> {
  if (!obj || typeof obj !== 'object' || currentDepth >= maxDepth) {
    return prefix ? { [prefix]: obj } : {}
  }

  // Handle arrays - keep them as-is but also expose length
  if (Array.isArray(obj)) {
    return {
      [prefix]: obj,
      ...(prefix && { [`${prefix}_count`]: obj.length })
    }
  }

  const result: Record<string, any> = {}

  // Add the whole object at this level (useful for complex objects)
  if (prefix) {
    result[prefix] = obj
  }

  // Flatten all properties
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key

    if (value === null || value === undefined) {
      result[key] = value
      continue
    }

    // For primitives, add directly
    if (typeof value !== 'object') {
      result[key] = value
      if (prefix) result[newKey] = value
      continue
    }

    // For nested objects/arrays, recurse but also keep the direct reference
    result[key] = value
    const nested = flattenObject(value, newKey, maxDepth, currentDepth + 1)
    Object.assign(result, nested)
  }

  return result
}

/**
 * Unwraps common API response wrapper patterns
 * e.g., { success: true, output: {...}, message: "..." } -> {...}
 */
function unwrapApiResponse(output: any): any {
  // Pattern 1: { success, output, message } - extract output
  if (output.output && typeof output.output === 'object' &&
      ('success' in output || 'message' in output)) {
    return output.output
  }

  // Pattern 2: { data: {...} } - extract data
  if (output.data && typeof output.data === 'object' && Object.keys(output).length <= 3) {
    return output.data
  }

  // Pattern 3: { result: {...} } - extract result
  if (output.result && typeof output.result === 'object' && Object.keys(output).length <= 3) {
    return output.result
  }

  return output
}

/**
 * Gets all variable values for a specific node
 * Dynamically adapts to any API response structure
 *
 * @param nodeId - The node ID
 * @param workflowData - The workflow data
 * @param testResults - Optional test results
 * @returns Object with output names as keys and their values
 */
export function getNodeVariableValues(
  nodeId: string,
  workflowData: { nodes: any[], edges: any[] },
  testResults?: any
): Record<string, any> {
  if (!testResults || !testResults[nodeId]) {
    return {}
  }

  const nodeResult = testResults[nodeId]
  let output = nodeResult.output || {}

  // Step 1: Unwrap common API wrapper patterns
  output = unwrapApiResponse(output)

  // Step 2: If single-key object with nested data, promote nested data to top level
  const keys = Object.keys(output)
  if (keys.length === 1 && typeof output[keys[0]] === 'object' && !Array.isArray(output[keys[0]])) {
    const nestedData = output[keys[0]]
    // Merge: keep both the nested object AND its flattened properties
    output = { ...output, ...nestedData }
  }

  // Step 3: Flatten nested objects to make all values accessible
  // This handles cases like person_details.email, user.profile.name, etc.
  const flattened = flattenObject(output)

  // Step 4: Apply common field name mappings for better compatibility
  const result = { ...flattened }

  // Common ID field mappings
  if (result.id && !result.user_id) result.user_id = result.id
  if (result.id && !result.page_id) result.page_id = result.id
  if (result.id && !result.database_id) result.database_id = result.id
  if (result.id && !result.message_id) result.message_id = result.id

  // Email mappings
  if (result['person_details.email'] && !result.email) result.email = result['person_details.email']
  if (result['user.email'] && !result.email) result.email = result['user.email']

  // Name mappings
  if (result['user.name'] && !result.name) result.name = result['user.name']
  if (result.display_name && !result.name) result.name = result.display_name

  return result
}

/**
 * Hook to get resolved variable value
 * @param variableRef - The variable reference
 * @param workflowData - The workflow data
 * @returns The resolved value or original reference
 */
export function useResolvedVariableValue(
  variableRef: string,
  workflowData: { nodes: any[], edges: any[] }
): string {
  const { testResults } = useWorkflowTestStore()
  return resolveVariableValue(variableRef, workflowData, testResults)
}
