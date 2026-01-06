/**
 * Node Context Helper for HITL
 * Provides AI with awareness of available nodes and current workflow structure
 */

import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'
import { createSupabaseServerClient } from '@/utils/supabase/server'
import { logger } from '@/lib/utils/logger'

interface NodeSummary {
  type: string
  title: string
  description: string
  category: string
  isTrigger: boolean
  provider?: string
}

interface WorkflowNode {
  id: string
  type: string
  title: string
  position: number
}

interface WorkflowStructure {
  nodes: WorkflowNode[]
  connections: { from: string; to: string }[]
}

/**
 * Get a condensed catalog of available nodes for AI context
 * Groups by category for easier comprehension
 */
export function getAvailableNodesCatalog(): string {
  // Filter out hidden, deprecated, and coming soon nodes
  const availableNodes = ALL_NODE_COMPONENTS.filter(node =>
    !node.hideInActionSelection &&
    !node.deprecated &&
    !node.comingSoon &&
    !node.isSystemNode
  )

  // Group by category
  const nodesByCategory = new Map<string, NodeSummary[]>()

  for (const node of availableNodes) {
    const category = node.category || 'Other'
    const existing = nodesByCategory.get(category) || []
    existing.push({
      type: node.type,
      title: node.title,
      description: node.description,
      category,
      isTrigger: node.isTrigger,
      provider: node.providerId
    })
    nodesByCategory.set(category, existing)
  }

  // Format for AI consumption
  let catalog = '## Available Workflow Nodes\n\n'

  // Sort categories alphabetically but put common ones first
  const priorityCategories = ['Triggers', 'Email', 'Messaging', 'AI', 'Logic', 'Data']
  const sortedCategories = [...nodesByCategory.keys()].sort((a, b) => {
    const aIndex = priorityCategories.indexOf(a)
    const bIndex = priorityCategories.indexOf(b)
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex
    if (aIndex !== -1) return -1
    if (bIndex !== -1) return 1
    return a.localeCompare(b)
  })

  for (const category of sortedCategories) {
    const nodes = nodesByCategory.get(category) || []

    // Separate triggers and actions
    const triggers = nodes.filter(n => n.isTrigger)
    const actions = nodes.filter(n => !n.isTrigger)

    catalog += `### ${category}\n`

    if (triggers.length > 0) {
      catalog += '**Triggers:**\n'
      for (const node of triggers) {
        catalog += `- **${node.title}** (${node.type}): ${node.description}\n`
      }
    }

    if (actions.length > 0) {
      catalog += '**Actions:**\n'
      for (const node of actions) {
        catalog += `- **${node.title}** (${node.type}): ${node.description}\n`
      }
    }

    catalog += '\n'
  }

  return catalog
}

/**
 * Get a condensed version with just node names grouped by use case
 * This is shorter and more suitable for system prompts
 */
export function getCondensedNodesCatalog(): string {
  const availableNodes = ALL_NODE_COMPONENTS.filter(node =>
    !node.hideInActionSelection &&
    !node.deprecated &&
    !node.comingSoon &&
    !node.isSystemNode
  )

  // Group by actual categories in the system
  const nodesByCategory = new Map<string, typeof availableNodes>()
  for (const node of availableNodes) {
    const category = node.category || 'Other'
    const existing = nodesByCategory.get(category) || []
    existing.push(node)
    nodesByCategory.set(category, existing)
  }

  // Define priority order for categories (most commonly used first)
  const priorityCategories = [
    'Email',
    'Communication',
    'Productivity',
    'Storage',
    'CRM',
    'AI & Automation',
    'Logic',
    'Finance',
    'E-commerce',
    'Social',
    'Development',
    'Analytics'
  ]

  let catalog = `## Available Workflow Nodes\n\n`
  catalog += `**Total: ${availableNodes.length} nodes available across ${nodesByCategory.size} categories**\n\n`

  // Sort categories: priority first, then alphabetically
  const sortedCategories = [...nodesByCategory.keys()].sort((a, b) => {
    const aIndex = priorityCategories.indexOf(a)
    const bIndex = priorityCategories.indexOf(b)
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex
    if (aIndex !== -1) return -1
    if (bIndex !== -1) return 1
    return a.localeCompare(b)
  })

  for (const category of sortedCategories) {
    const nodes = nodesByCategory.get(category) || []
    if (nodes.length === 0) continue

    // Separate triggers and actions
    const triggers = nodes.filter(n => n.isTrigger)
    const actions = nodes.filter(n => !n.isTrigger)

    catalog += `### ${category} (${nodes.length} nodes)\n`

    if (triggers.length > 0) {
      catalog += `**Triggers:** ${triggers.map(n => n.title).join(', ')}\n`
    }
    if (actions.length > 0) {
      // Limit to first 15 actions to keep context manageable
      const actionNames = actions.slice(0, 15).map(n => n.title)
      if (actions.length > 15) {
        actionNames.push(`... and ${actions.length - 15} more`)
      }
      catalog += `**Actions:** ${actionNames.join(', ')}\n`
    }
    catalog += '\n'
  }

  return catalog
}

/**
 * Load the current workflow structure for context
 */
export async function getWorkflowStructure(workflowId: string): Promise<WorkflowStructure | null> {
  try {
    const supabase = await createSupabaseServerClient()

    // Load from normalized tables
    const [nodesResult, edgesResult] = await Promise.all([
      supabase
        .from('workflow_nodes')
        .select('id, node_type, label, config, is_trigger, display_order')
        .eq('workflow_id', workflowId)
        .order('display_order'),
      supabase
        .from('workflow_edges')
        .select('id, source_node_id, target_node_id')
        .eq('workflow_id', workflowId)
    ])

    if (nodesResult.error) {
      logger.warn('[HITL NodeContext] Could not load workflow structure', { error: nodesResult.error })
      return null
    }

    const nodes = (nodesResult.data || [])
      .filter((n: any) =>
        n.node_type !== 'addAction' &&
        !n.id?.startsWith('add-action-')
      )
      .map((n: any, index: number) => ({
        id: n.id,
        type: n.node_type,
        title: n.label || n.node_type,
        position: index
      }))

    const connections = (edgesResult.data || []).map((e: any) => ({
      from: e.source_node_id,
      to: e.target_node_id
    }))

    return { nodes, connections }
  } catch (error) {
    logger.error('[HITL NodeContext] Error loading workflow structure', { error })
    return null
  }
}

/**
 * Format workflow structure for AI context
 */
export function formatWorkflowStructure(structure: WorkflowStructure): string {
  if (!structure || structure.nodes.length === 0) {
    return 'No nodes in the current workflow.'
  }

  let output = '## Current Workflow Structure\n\n'
  output += '**Nodes in workflow:**\n'

  for (const node of structure.nodes) {
    output += `${node.position + 1}. **${node.title}** (${node.type})\n`
  }

  if (structure.connections.length > 0) {
    output += '\n**Connections:**\n'
    for (const conn of structure.connections) {
      const fromNode = structure.nodes.find(n => n.id === conn.from)
      const toNode = structure.nodes.find(n => n.id === conn.to)
      if (fromNode && toNode) {
        output += `- ${fromNode.title} → ${toNode.title}\n`
      }
    }
  }

  return output
}

/**
 * Build complete node context for HITL system prompt
 */
export async function buildNodeContext(workflowId: string): Promise<string> {
  const nodesCatalog = getCondensedNodesCatalog()
  const workflowStructure = await getWorkflowStructure(workflowId)
  const workflowContext = workflowStructure
    ? formatWorkflowStructure(workflowStructure)
    : ''

  return `
${workflowContext}

${nodesCatalog}

**Note:** When the user asks about what nodes to add or what's available, refer to the above catalog. You can suggest specific nodes based on their needs.
`
}
