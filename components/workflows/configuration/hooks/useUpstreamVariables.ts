"use client"

import { useMemo } from 'react'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'
import { extractNodeOutputs, sanitizeAlias } from '../autoMapping'
import { getActionOutputSchema } from '@/lib/workflows/actions/outputSchemaRegistry'

/**
 * Helper function to recursively get ALL previous nodes in the workflow
 * Not just the immediate parent, but all ancestors
 */
function getAllPreviousNodeIds(currentNodeId: string, edges: any[]): string[] {
  const findPreviousNodes = (nodeId: string, visited = new Set<string>()): string[] => {
    if (visited.has(nodeId)) return []
    visited.add(nodeId)

    const incomingEdges = edges.filter((edge: any) => edge.target === nodeId)
    if (incomingEdges.length === 0) return []

    const sourceNodeIds = incomingEdges.map((edge: any) => edge.source)
    const allPreviousNodes: string[] = [...sourceNodeIds]

    sourceNodeIds.forEach(sourceId => {
      const previousNodes = findPreviousNodes(sourceId, visited)
      allPreviousNodes.push(...previousNodes)
    })

    return allPreviousNodes
  }

  return findPreviousNodes(currentNodeId)
}

export interface UpstreamVariable {
  nodeId: string
  nodeTitle: string
  nodeAlias: string
  providerId?: string
  fieldName: string
  fieldLabel: string
  fieldType?: string
  fullReference: string // e.g., {{node_id.field_name}}
  isArrayProperty?: boolean
  parentArray?: string
  parentArrayLabel?: string
}

export interface UpstreamNode {
  id: string
  title: string
  alias: string
  type?: string
  providerId?: string
  outputs: any[]
  position: { x: number; y: number }
}

interface UseUpstreamVariablesOptions {
  workflowData?: { nodes: any[]; edges: any[] }
  currentNodeId?: string
}

interface UseUpstreamVariablesResult {
  upstreamNodes: UpstreamNode[]
  variables: UpstreamVariable[]
  hasUpstreamNodes: boolean
  hasVariables: boolean
}

/**
 * Shared hook to get upstream nodes and their variables
 * Used by both VariablePickerDropdown and VariableSelectionDropdown
 */
export function useUpstreamVariables({
  workflowData,
  currentNodeId
}: UseUpstreamVariablesOptions): UseUpstreamVariablesResult {
  const upstreamNodes = useMemo<UpstreamNode[]>(() => {
    if (!workflowData?.nodes || !currentNodeId) return []

    const nodeById = new Map(workflowData.nodes.map(n => [n.id, n]))
    const edges = workflowData.edges || []

    // Find ALL previous nodes (all ancestors, not just immediate parents)
    const sourceIds = getAllPreviousNodeIds(currentNodeId, edges)

    const nodes = sourceIds
      .map(id => nodeById.get(id))
      .filter(Boolean)
      .filter((node: any) =>
        node.id !== 'add-action-button' &&
        !node.data?.title?.toLowerCase().includes('add action')
      )
      .map((node: any) => {
        const nodeComponent = ALL_NODE_COMPONENTS.find(c => c.type === node.data?.type)

        // Try multiple sources for output schema
        // 1. extractNodeOutputs - gets outputs based on node config (most accurate)
        // 2. getActionOutputSchema - registry-based outputs
        // 3. nodeComponent?.outputSchema - fallback to static schema
        const extractedOutputs = extractNodeOutputs(node as any)
        const registryOutputs = getActionOutputSchema(node.data?.type || '', node.data?.config)
        const staticOutputs = nodeComponent?.outputSchema || []

        let outputs = (extractedOutputs && extractedOutputs.length > 0)
          ? extractedOutputs
          : (registryOutputs && registryOutputs.length > 0)
            ? registryOutputs
            : staticOutputs

        // Flatten array properties - if an output has 'properties', include those as individual outputs
        const flattenedOutputs: any[] = []
        outputs.forEach((output: any) => {
          // Always include the top-level field
          flattenedOutputs.push(output)

          // If this is an array with properties, also include the properties as separate fields
          if (output.type === 'array' && Array.isArray(output.properties)) {
            output.properties.forEach((prop: any) => {
              flattenedOutputs.push({
                ...prop,
                name: `${output.name}[].${prop.name}`,
                label: prop.label || prop.name,
                _isArrayProperty: true,
                _parentArray: output.name,
                _parentArrayLabel: output.label || output.name
              })
            })
          }
        })

        const title = node.data?.title || node.data?.label || nodeComponent?.title || 'Unnamed'

        return {
          id: node.id,
          title,
          alias: sanitizeAlias(node.data?.label || node.data?.title || node.data?.type || node.id),
          type: node.data?.type,
          providerId: node.data?.providerId || nodeComponent?.providerId,
          outputs: flattenedOutputs,
          position: node.position || { x: 0, y: 0 }
        }
      })

    // Sort by Y position (top to bottom order in the workflow builder)
    return nodes.sort((a, b) => a.position.y - b.position.y)
  }, [workflowData, currentNodeId])

  // Flatten all variables for easy iteration
  const variables = useMemo<UpstreamVariable[]>(() => {
    return upstreamNodes.flatMap(node =>
      node.outputs.map(output => ({
        nodeId: node.id,
        nodeTitle: node.title,
        nodeAlias: node.alias,
        providerId: node.providerId,
        fieldName: output.name,
        fieldLabel: output.label || output.name,
        fieldType: output.type,
        fullReference: `{{${node.id}.${output.name}}}`,
        isArrayProperty: output._isArrayProperty,
        parentArray: output._parentArray,
        parentArrayLabel: output._parentArrayLabel
      }))
    )
  }, [upstreamNodes])

  const hasUpstreamNodes = upstreamNodes.length > 0
  const hasVariables = variables.length > 0

  return {
    upstreamNodes,
    variables,
    hasUpstreamNodes,
    hasVariables
  }
}

/**
 * Format provider ID to human-readable name
 */
export function formatProviderName(providerId?: string): string {
  if (!providerId) return ''
  return providerId
    .replace(/[_-]/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
