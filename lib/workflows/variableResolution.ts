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
 * Gets all variable values for a specific node
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
  const output = nodeResult.output || {}
  return output
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
