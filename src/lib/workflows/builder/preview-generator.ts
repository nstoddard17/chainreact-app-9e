/**
 * preview-generator.ts
 *
 * Utility for generating node preview content from output schema metadata.
 * Converts previewFields metadata into preview blocks that show available merge fields.
 */

import type { Node } from "./schema"
import { ALL_NODE_COMPONENTS } from "@/lib/workflows/nodes"

export interface PreviewContent {
  title?: string
  content: string | string[]
}

/**
 * Generate preview content for a node showing its available output/merge fields
 * @param node - The workflow node
 * @returns Preview content object ready for CustomNode display
 */
export function generateNodePreview(node: Node): PreviewContent | null {
  // Get previewFields from metadata (added by planner)
  const previewFields = node.metadata?.previewFields as Array<{
    name: string
    label: string
    type: string
    example?: any
  }> | undefined

  // Fallback: If no previewFields in metadata, get from node component definition
  if (!previewFields || previewFields.length === 0) {
    const component = ALL_NODE_COMPONENTS.find(c => c.type === node.type)
    if (!component?.outputSchema || component.outputSchema.length === 0) {
      return null // No output fields to preview
    }

    // Use first 3 output fields as preview
    const fields = component.outputSchema.slice(0, 3)
    return {
      title: 'Available Merge Fields',
      content: fields.map(field => {
        const mergeField = `{{${node.id}.${field.name}}}`
        const example = field.example ? ` (e.g., ${JSON.stringify(field.example)})` : ''
        return `${field.label}: ${mergeField}${example}`
      })
    }
  }

  // Generate preview from metadata previewFields
  return {
    title: 'Available Merge Fields',
    content: previewFields.map(field => {
      const mergeField = `{{${node.id}.${field.name}}}`
      const example = field.example ? ` (e.g., ${JSON.stringify(field.example)})` : ''
      return `${field.label}: ${mergeField}${example}`
    })
  }
}

/**
 * Generate preview content showing node output schema as merge fields
 * @param nodeId - The node ID for merge field references
 * @param outputSchema - The output schema fields
 * @param maxFields - Maximum number of fields to show (default: 3)
 * @returns Preview content lines
 */
export function generateMergeFieldsPreview(
  nodeId: string,
  outputSchema: Array<{
    name: string
    label: string
    type: string
    example?: any
  }>,
  maxFields: number = 3
): string[] {
  return outputSchema.slice(0, maxFields).map(field => {
    const mergeField = `{{${nodeId}.${field.name}}}`
    const typeLabel = field.type ? ` [${field.type}]` : ''
    const example = field.example ? ` — e.g., ${formatExample(field.example)}` : ''
    return `${field.label}${typeLabel}: ${mergeField}${example}`
  })
}

/**
 * Format example values for display
 */
function formatExample(example: any): string {
  if (typeof example === 'string') {
    return `"${example}"`
  }
  if (typeof example === 'number' || typeof example === 'boolean') {
    return String(example)
  }
  if (Array.isArray(example)) {
    return `[${example.slice(0, 2).map(formatExample).join(', ')}${example.length > 2 ? '...' : ''}]`
  }
  if (typeof example === 'object' && example !== null) {
    return '{...}'
  }
  return JSON.stringify(example)
}

/**
 * Get all merge fields available for a node (for autocomplete/suggestions)
 * @param node - The workflow node
 * @returns Array of merge field strings
 */
export function getAvailableMergeFields(node: Node): string[] {
  const component = ALL_NODE_COMPONENTS.find(c => c.type === node.type)
  if (!component?.outputSchema) {
    return []
  }

  return component.outputSchema.map(field => `{{${node.id}.${field.name}}}`)
}

/**
 * Get merge field suggestions for all upstream nodes in a workflow
 * @param currentNodeId - The current node being configured
 * @param allNodes - All nodes in the workflow
 * @param edges - Workflow edges (connections)
 * @returns Map of node ID to available merge fields
 */
export function getUpstreamMergeFields(
  currentNodeId: string,
  allNodes: Node[],
  edges: Array<{ from: { nodeId: string }; to: { nodeId: string } }>
): Map<string, { nodeLabel: string; fields: string[] }> {
  const result = new Map<string, { nodeLabel: string; fields: string[] }>()

  // Find all upstream nodes (nodes that come before current node)
  const upstreamNodeIds = new Set<string>()

  // Simple BFS to find upstream nodes
  const queue = [currentNodeId]
  const visited = new Set<string>([currentNodeId])

  while (queue.length > 0) {
    const nodeId = queue.shift()!

    // Find edges pointing TO this node
    const incomingEdges = edges.filter(e => e.to.nodeId === nodeId)

    for (const edge of incomingEdges) {
      const upstreamId = edge.from.nodeId
      if (!visited.has(upstreamId)) {
        visited.add(upstreamId)
        upstreamNodeIds.add(upstreamId)
        queue.push(upstreamId)
      }
    }
  }

  // For each upstream node, get its available merge fields
  for (const nodeId of upstreamNodeIds) {
    const node = allNodes.find(n => n.id === nodeId)
    if (node) {
      const fields = getAvailableMergeFields(node)
      if (fields.length > 0) {
        result.set(nodeId, {
          nodeLabel: node.label,
          fields
        })
      }
    }
  }

  return result
}
