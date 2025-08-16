/**
 * Variable Resolution Utilities
 * 
 * Provides functions to resolve variable references to their actual values
 * from test results or workflow execution data
 */

import { useWorkflowTestStore } from '@/stores/workflowTestStore'

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
  // Extract node title and output name from variable reference
  const match = variableRef.match(/\{\{([^}]+)\.([^}]+)\}\}/)
  if (!match) return variableRef
  
  const [, nodeTitle, outputName] = match
  
  // Find the node by title
  const node = workflowData.nodes.find(n => 
    n.data?.title === nodeTitle || n.data?.type === nodeTitle
  )
  
  if (!node) return variableRef
  
  // If we have test results, try to get the actual value
  if (testResults && testResults[node.id]) {
    const nodeResult = testResults[node.id]
    
    // Handle AI agent's nested output structure: { output: { output: "actual value" } }
    if (nodeResult.output && nodeResult.output.output && outputName === "output") {
      return String(nodeResult.output.output)
    }
    
    // Handle regular output structure: { output: { fieldName: "value" } }
    if (nodeResult.output && nodeResult.output[outputName] !== undefined) {
      return String(nodeResult.output[outputName])
    }
  }
  
  // Fallback to variable reference if we can't resolve it
  return variableRef
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
  
  // Handle AI agent's nested output structure: { output: { output: "actual value" } }
  if (output.output !== undefined && Object.keys(output).length === 1) {
    // This is likely an AI agent output, return the nested output
    return { output: output.output }
  }
  
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

