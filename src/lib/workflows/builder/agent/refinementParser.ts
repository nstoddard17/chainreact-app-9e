/**
 * Refinement Parser for Conversational Workflow Modifications
 *
 * This module parses user messages to detect refinement intents like:
 * - "add a filter before step 3"
 * - "use Trello instead of GitHub"
 * - "remove the email step"
 * - "change the Slack channel to #general"
 *
 * It enables conversational editing of workflows without full replanning.
 */

import type { Node } from '../schema'
import type {
  RefinementIntent,
  RefinementType,
  PositionReference,
  BranchCondition,
  ConfigConfidence,
  ReasoningStep,
  RefinementResult,
} from './types'
import type { Edit } from './planner'
import { getCompactCatalog, searchCatalog } from './nodeCatalog'

// ============================================================================
// PATTERN DEFINITIONS
// ============================================================================

interface RefinementPattern {
  type: RefinementType
  patterns: RegExp[]
  extractors: {
    position?: (match: RegExpMatchArray, text: string) => PositionReference | undefined
    targetNode?: (match: RegExpMatchArray, text: string, nodes: Node[]) => string[] | undefined
    newNode?: (match: RegExpMatchArray, text: string) => string | undefined
    config?: (match: RegExpMatchArray, text: string) => Record<string, any> | undefined
    condition?: (match: RegExpMatchArray, text: string) => BranchCondition | undefined
  }
}

const REFINEMENT_PATTERNS: RefinementPattern[] = [
  // ADD NODE patterns
  {
    type: 'add_node',
    patterns: [
      /add (?:a |an )?(.+?) (?:node |step )?(?:before|after|at) (?:step |node )?(\d+|the (?:start|end|beginning|last))/i,
      /insert (?:a |an )?(.+?) (?:before|after) (?:step |node )?(\d+|the (?:start|end|beginning|last))/i,
      /put (?:a |an )?(.+?) (?:before|after) (?:step |node )?(\d+|the (?:start|end|beginning|last))/i,
      /add (?:a |an )?(.+?) (?:node |step )?(?:to|at) the (?:start|end|beginning)/i,
    ],
    extractors: {
      position: (match, text) => {
        const positionText = text.toLowerCase()
        if (positionText.includes('before')) {
          const ref = match[2] || 'start'
          return { type: 'before', reference: parseReference(ref) }
        }
        if (positionText.includes('after')) {
          const ref = match[2] || 'end'
          return { type: 'after', reference: parseReference(ref) }
        }
        if (positionText.includes('start') || positionText.includes('beginning')) {
          return { type: 'at_start', reference: 1 }
        }
        if (positionText.includes('end') || positionText.includes('last')) {
          return { type: 'at_end', reference: 'last' }
        }
        return undefined
      },
      newNode: (match, text) => {
        const nodeDesc = match[1]?.trim()
        if (!nodeDesc) return undefined
        // Try to find matching node type
        const matches = searchCatalog(nodeDesc)
        return matches.length > 0 ? matches[0].type : nodeDesc
      },
    },
  },

  // REMOVE NODE patterns
  {
    type: 'remove_node',
    patterns: [
      /remove (?:the )?(?:step |node )?(\d+|.+?(?= step| node| from|$))/i,
      /delete (?:the )?(?:step |node )?(\d+|.+?(?= step| node| from|$))/i,
      /get rid of (?:the )?(?:step |node )?(\d+|.+?(?= step| node| from|$))/i,
    ],
    extractors: {
      targetNode: (match, text, nodes) => {
        const ref = match[1]?.trim()
        if (!ref) return undefined

        // Check if it's a step number
        const stepNum = parseInt(ref)
        if (!isNaN(stepNum) && stepNum > 0 && stepNum <= nodes.length) {
          return [nodes[stepNum - 1].type]
        }

        // Try to find by type or label
        return findNodesByDescription(ref, nodes)
      },
    },
  },

  // REPLACE NODE patterns
  {
    type: 'replace_node',
    patterns: [
      /(?:use|switch to|change to|replace (?:with )?|swap (?:with |for )?)(.+?) instead of (.+)/i,
      /replace (?:the )?(.+?) (?:step |node )?with (?:a |an )?(.+)/i,
      /swap (?:the )?(.+?) (?:step |node )?for (?:a |an )?(.+)/i,
    ],
    extractors: {
      newNode: (match) => {
        const newNodeDesc = match[1]?.trim()
        const matches = searchCatalog(newNodeDesc)
        return matches.length > 0 ? matches[0].type : newNodeDesc
      },
      targetNode: (match, text, nodes) => {
        const oldNodeDesc = match[2]?.trim()
        if (!oldNodeDesc) return undefined
        return findNodesByDescription(oldNodeDesc, nodes)
      },
    },
  },

  // MODIFY CONFIG patterns
  {
    type: 'modify_config',
    patterns: [
      /change (?:the )?(.+?) (?:to|=) (.+)/i,
      /set (?:the )?(.+?) (?:to|=) (.+)/i,
      /update (?:the )?(.+?) (?:to|=) (.+)/i,
      /(?:use|pick|select) (.+?) (?:as|for) (?:the )?(.+)/i,
    ],
    extractors: {
      config: (match) => {
        const fieldOrValue = match[1]?.trim()
        const valueOrField = match[2]?.trim()

        // Detect common field names
        const commonFields = ['channel', 'message', 'subject', 'to', 'from', 'title', 'body', 'database', 'table']
        const isFirstField = commonFields.some(f => fieldOrValue.toLowerCase().includes(f))

        if (isFirstField) {
          // First match is field, second is value
          const fieldName = extractFieldName(fieldOrValue)
          return { [fieldName]: valueOrField }
        } else {
          // Second match is field, first is value
          const fieldName = extractFieldName(valueOrField)
          return { [fieldName]: fieldOrValue }
        }
      },
    },
  },

  // ADD BRANCH patterns
  {
    type: 'add_branch',
    patterns: [
      /add (?:a )?(?:condition|branch|if) (?:for |when )?(?:if )?(.+)/i,
      /(?:if|when) (.+?)[,\s]+(?:then |also )?(.+)/i,
      /split (?:the workflow |)(?:based on|by|if) (.+)/i,
    ],
    extractors: {
      condition: (match) => {
        const conditionText = match[1]?.trim()
        return parseCondition(conditionText)
      },
    },
  },

  // MOVE NODE patterns
  {
    type: 'move_node',
    patterns: [
      /move (?:the )?(?:step |node )?(\d+|.+?) (?:to |)(before|after) (?:step |node )?(\d+|.+)/i,
      /put (?:the )?(?:step |node )?(\d+|.+?) (?:to |)(before|after) (?:step |node )?(\d+|.+)/i,
    ],
    extractors: {
      targetNode: (match, text, nodes) => {
        const ref = match[1]?.trim()
        return findNodesByDescription(ref, nodes)
      },
      position: (match) => {
        const posType = match[2]?.toLowerCase() as 'before' | 'after'
        const ref = match[3]?.trim()
        return { type: posType, reference: parseReference(ref) }
      },
    },
  },

  // REORDER patterns
  {
    type: 'reorder',
    patterns: [
      /swap (?:step |node )?(\d+) (?:and|with) (?:step |node )?(\d+)/i,
      /switch (?:step |node )?(\d+) (?:and|with) (?:step |node )?(\d+)/i,
    ],
    extractors: {
      // Both positions stored in targetNode as strings
      targetNode: (match) => [match[1], match[2]],
    },
  },
]

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function parseReference(ref: string): string | number {
  if (!ref) return 'end'

  const normalized = ref.toLowerCase().trim()

  // Check for keywords
  if (normalized.includes('start') || normalized.includes('beginning') || normalized.includes('first')) {
    return 1
  }
  if (normalized.includes('end') || normalized.includes('last')) {
    return 'last'
  }

  // Check for number
  const num = parseInt(normalized.replace(/\D/g, ''))
  if (!isNaN(num)) return num

  // Return as string reference (node type or label)
  return ref.trim()
}

function findNodesByDescription(desc: string, nodes: Node[]): string[] | undefined {
  const normalized = desc.toLowerCase().trim()

  // Check for step number
  const stepMatch = normalized.match(/step\s*(\d+)/)
  if (stepMatch) {
    const stepNum = parseInt(stepMatch[1])
    if (stepNum > 0 && stepNum <= nodes.length) {
      return [nodes[stepNum - 1].type]
    }
  }

  // Check by type
  const byType = nodes.filter(n =>
    n.type.toLowerCase().includes(normalized) ||
    normalized.includes(n.type.toLowerCase().replace(/_/g, ' '))
  )
  if (byType.length > 0) return byType.map(n => n.type)

  // Check by label
  const byLabel = nodes.filter(n =>
    n.label?.toLowerCase().includes(normalized)
  )
  if (byLabel.length > 0) return byLabel.map(n => n.type)

  // Check by provider name
  const providerKeywords = ['gmail', 'slack', 'discord', 'notion', 'trello', 'github', 'airtable', 'stripe', 'teams']
  for (const provider of providerKeywords) {
    if (normalized.includes(provider)) {
      const byProvider = nodes.filter(n => n.type.toLowerCase().startsWith(provider))
      if (byProvider.length > 0) return byProvider.map(n => n.type)
    }
  }

  return undefined
}

function extractFieldName(text: string): string {
  const normalized = text.toLowerCase().trim()

  // Common field name mappings
  const fieldMappings: Record<string, string> = {
    'channel': 'channel',
    'slack channel': 'channel',
    'message': 'message',
    'text': 'message',
    'content': 'content',
    'body': 'body',
    'email body': 'body',
    'subject': 'subject',
    'email subject': 'subject',
    'to': 'to',
    'recipient': 'to',
    'from': 'from',
    'sender': 'from',
    'title': 'title',
    'name': 'name',
    'database': 'database_id',
    'notion database': 'database_id',
    'table': 'table_id',
    'airtable table': 'table_id',
  }

  for (const [key, value] of Object.entries(fieldMappings)) {
    if (normalized.includes(key)) {
      return value
    }
  }

  // Default: convert to snake_case
  return normalized.replace(/\s+/g, '_')
}

function parseCondition(text: string): BranchCondition | undefined {
  if (!text) return undefined

  const normalized = text.toLowerCase().trim()

  // Common condition patterns
  const conditionPatterns: Array<{
    pattern: RegExp
    operator: BranchCondition['operator']
  }> = [
    { pattern: /(.+?) (?:is |equals |=|==) (.+)/i, operator: 'equals' },
    { pattern: /(.+?) (?:is not|isn't|!=|<>) (.+)/i, operator: 'not_equals' },
    { pattern: /(.+?) contains (.+)/i, operator: 'contains' },
    { pattern: /(.+?) (?:does not contain|doesn't contain) (.+)/i, operator: 'not_contains' },
    { pattern: /(.+?) (?:is empty|has no value)/i, operator: 'is_empty' },
    { pattern: /(.+?) (?:is not empty|has value|exists)/i, operator: 'is_not_empty' },
    { pattern: /(.+?) > (.+)/i, operator: 'greater_than' },
    { pattern: /(.+?) < (.+)/i, operator: 'less_than' },
  ]

  for (const { pattern, operator } of conditionPatterns) {
    const match = text.match(pattern)
    if (match) {
      return {
        field: match[1]?.trim() || text,
        operator,
        value: match[2]?.trim(),
      }
    }
  }

  // Default: treat as custom expression
  return {
    field: text,
    operator: 'custom_expression',
    expression: text,
  }
}

function calculateConfidence(
  matchQuality: number,
  hasAllExtractors: boolean
): ConfigConfidence {
  if (matchQuality > 0.8 && hasAllExtractors) return 'high'
  if (matchQuality > 0.5 || hasAllExtractors) return 'medium'
  return 'low'
}

// ============================================================================
// MAIN PARSER
// ============================================================================

/**
 * Parses a user message to detect refinement intent
 *
 * @param prompt - The user's message
 * @param currentNodes - Current nodes in the workflow
 * @returns Parsed refinement intent or null if no refinement detected
 */
export function parseRefinementIntent(
  prompt: string,
  currentNodes: Node[]
): RefinementIntent | null {
  const normalizedPrompt = prompt.trim()

  for (const refinement of REFINEMENT_PATTERNS) {
    for (const pattern of refinement.patterns) {
      const match = normalizedPrompt.match(pattern)
      if (!match) continue

      // Extract components using extractors
      const position = refinement.extractors.position?.(match, normalizedPrompt)
      const targetNodeTypes = refinement.extractors.targetNode?.(match, normalizedPrompt, currentNodes)
      const newNodeType = refinement.extractors.newNode?.(match, normalizedPrompt)
      const configChanges = refinement.extractors.config?.(match, normalizedPrompt)
      const condition = refinement.extractors.condition?.(match, normalizedPrompt)

      // Calculate confidence based on extraction success
      const extractorsUsed = [position, targetNodeTypes, newNodeType, configChanges, condition].filter(Boolean).length
      const extractorsDefined = Object.keys(refinement.extractors).length
      const hasAllExtractors = extractorsUsed >= extractorsDefined * 0.5

      return {
        type: refinement.type,
        position,
        targetNodeTypes,
        newNodeType,
        configChanges,
        condition,
        matchedText: match[0],
        confidence: calculateConfidence(0.7, hasAllExtractors),
      }
    }
  }

  return null
}

/**
 * Checks if a prompt looks like a refinement request
 * (quick check before full parsing)
 *
 * Refinement patterns must be specific modifications to existing workflow:
 * - "add X before/after step N"
 * - "remove the X step"
 * - "replace X with Y" or "use Y instead of X"
 * - "change the X to Y"
 * - "swap step N and M"
 */
export function looksLikeRefinement(prompt: string): boolean {
  const normalized = prompt.toLowerCase()

  // Explicit refinement patterns - must match specific modification syntax
  const refinementPatterns = [
    // Adding nodes at positions
    /\b(add|insert|put)\s+.+?\s+(before|after)\s+(step|node)?\s*\d+/i,
    /\b(add|insert)\s+.+?\s+(at the|to the)\s+(start|end|beginning)/i,
    // Removing nodes
    /\b(remove|delete|get rid of)\s+(the\s+)?(step|node)?\s*(\d+|.+?\s+step)/i,
    // Replacing nodes
    /\b(use|switch to|replace.+?with)\s+.+?\s+instead\s+of/i,
    /\breplace\s+(the\s+)?.+?\s+(step|node)?\s*with/i,
    // Modifying config - must reference specific field/value
    /\b(change|set|update)\s+(the\s+)?(\w+\s+)?(channel|message|subject|to|from|title|body|database|table)\s+(to|=)/i,
    // Reordering
    /\bswap\s+(step|node)?\s*\d+\s+(and|with)\s+(step|node)?\s*\d+/i,
    /\bmove\s+(the\s+)?(step|node)?\s*(\d+|.+?)\s+(before|after)/i,
    // Step references with actions
    /\bstep\s*\d+.*(add|remove|change|modify|update)/i,
    /(add|remove|change|modify|update).*\bstep\s*\d+/i,
  ]

  // Check if any refinement pattern matches
  return refinementPatterns.some(pattern => pattern.test(normalized))
}

// ============================================================================
// REFINEMENT OPERATIONS
// ============================================================================

/**
 * Adds a node at a specific position in the workflow
 */
export function addNodeAtPosition(
  nodes: Node[],
  edges: { from: { nodeId: string }; to: { nodeId: string } }[],
  nodeType: string,
  position: PositionReference
): { nodes: Node[]; edits: Edit[]; reasoning: ReasoningStep[] } {
  const edits: Edit[] = []
  const reasoning: ReasoningStep[] = []

  // Determine insertion index
  let insertIndex: number
  if (position.type === 'at_start') {
    insertIndex = 0
  } else if (position.type === 'at_end' || position.reference === 'last') {
    insertIndex = nodes.length
  } else if (typeof position.reference === 'number') {
    insertIndex = position.type === 'before'
      ? position.reference - 1
      : position.reference
  } else {
    // Find by type or label
    const refNode = nodes.find(n =>
      n.type.includes(position.reference as string) ||
      n.label?.includes(position.reference as string)
    )
    if (refNode) {
      const refIndex = nodes.indexOf(refNode)
      insertIndex = position.type === 'before' ? refIndex : refIndex + 1
    } else {
      insertIndex = nodes.length // Default to end
    }
  }

  reasoning.push({
    step: 1,
    phase: 'ordering',
    thought: `Inserting ${nodeType} at position ${insertIndex + 1}`,
    decision: `Node will be placed ${position.type} ${position.reference}`,
    confidence: 'high',
  })

  // Create new node
  const newNodeId = crypto.randomUUID()
  const newNode: Node = {
    id: newNodeId,
    type: nodeType,
    label: nodeType,
    config: {},
    inPorts: [],
    outPorts: [],
    io: { inputSchema: undefined, outputSchema: undefined },
    policy: { timeoutMs: 60000, retries: 0 },
    costHint: 0,
    metadata: {
      position: { x: 400, y: 100 + insertIndex * 160 },
      lane: 0,
      branchIndex: insertIndex,
    },
  }

  edits.push({ op: 'addNode', node: newNode })

  // Reconnect edges
  // Find the edge that crosses the insertion point and split it
  if (insertIndex > 0 && insertIndex < nodes.length) {
    const prevNode = nodes[insertIndex - 1]
    const nextNode = nodes[insertIndex]

    // Find existing edge between prev and next
    const existingEdge = edges.find(e =>
      e.from.nodeId === prevNode.id && e.to.nodeId === nextNode.id
    )

    if (existingEdge) {
      // Remove old edge (via new Edit operation in practice)
      // Add two new edges: prev -> new, new -> next
      edits.push({
        op: 'connect',
        edge: {
          id: crypto.randomUUID(),
          from: { nodeId: prevNode.id },
          to: { nodeId: newNodeId },
          mappings: [],
        },
      })
      edits.push({
        op: 'connect',
        edge: {
          id: crypto.randomUUID(),
          from: { nodeId: newNodeId },
          to: { nodeId: nextNode.id },
          mappings: [],
        },
      })

      reasoning.push({
        step: 2,
        phase: 'connecting',
        thought: 'Reconnecting edges to maintain flow',
        decision: `Connected ${prevNode.type} → ${nodeType} → ${nextNode.type}`,
        confidence: 'high',
      })
    }
  } else if (insertIndex === 0 && nodes.length > 0) {
    // Inserting at start - connect to first node
    edits.push({
      op: 'connect',
      edge: {
        id: crypto.randomUUID(),
        from: { nodeId: newNodeId },
        to: { nodeId: nodes[0].id },
        mappings: [],
      },
    })
  } else if (insertIndex === nodes.length && nodes.length > 0) {
    // Inserting at end - connect from last node
    edits.push({
      op: 'connect',
      edge: {
        id: crypto.randomUUID(),
        from: { nodeId: nodes[nodes.length - 1].id },
        to: { nodeId: newNodeId },
        mappings: [],
      },
    })
  }

  // Return updated nodes array with new node inserted
  const updatedNodes = [...nodes]
  updatedNodes.splice(insertIndex, 0, newNode)

  return { nodes: updatedNodes, edits, reasoning }
}

/**
 * Replaces a node with a different type while preserving connections
 */
export function replaceNode(
  nodes: Node[],
  edges: { id: string; from: { nodeId: string }; to: { nodeId: string } }[],
  oldNodeType: string,
  newNodeType: string,
  preserveConfig: boolean = false
): { nodes: Node[]; edits: Edit[]; reasoning: ReasoningStep[] } {
  const edits: Edit[] = []
  const reasoning: ReasoningStep[] = []

  // Find the node to replace
  const nodeIndex = nodes.findIndex(n => n.type === oldNodeType)
  if (nodeIndex === -1) {
    reasoning.push({
      step: 1,
      phase: 'validating',
      thought: `Could not find node of type ${oldNodeType}`,
      confidence: 'low',
    })
    return { nodes, edits, reasoning }
  }

  const oldNode = nodes[nodeIndex]

  reasoning.push({
    step: 1,
    phase: 'selecting',
    thought: `Replacing ${oldNodeType} with ${newNodeType}`,
    decision: `Found ${oldNodeType} at position ${nodeIndex + 1}`,
    confidence: 'high',
  })

  // Create replacement node
  const newNode: Node = {
    ...oldNode,
    id: crypto.randomUUID(),
    type: newNodeType,
    label: newNodeType,
    config: preserveConfig ? oldNode.config : {},
  }

  edits.push({ op: 'addNode', node: newNode })

  // Reconnect edges
  const incomingEdges = edges.filter(e => e.to.nodeId === oldNode.id)
  const outgoingEdges = edges.filter(e => e.from.nodeId === oldNode.id)

  for (const edge of incomingEdges) {
    edits.push({
      op: 'connect',
      edge: {
        id: crypto.randomUUID(),
        from: edge.from,
        to: { nodeId: newNode.id },
        mappings: [],
      },
    })
  }

  for (const edge of outgoingEdges) {
    edits.push({
      op: 'connect',
      edge: {
        id: crypto.randomUUID(),
        from: { nodeId: newNode.id },
        to: edge.to,
        mappings: [],
      },
    })
  }

  reasoning.push({
    step: 2,
    phase: 'connecting',
    thought: `Reconnected ${incomingEdges.length} incoming and ${outgoingEdges.length} outgoing edges`,
    confidence: 'high',
  })

  // Return updated nodes
  const updatedNodes = [...nodes]
  updatedNodes[nodeIndex] = newNode

  return { nodes: updatedNodes, edits, reasoning }
}

/**
 * Removes a node and reconnects the surrounding nodes
 */
export function deleteNodeAndReconnect(
  nodes: Node[],
  edges: { id: string; from: { nodeId: string }; to: { nodeId: string } }[],
  nodeId: string
): { nodes: Node[]; edits: Edit[]; reasoning: ReasoningStep[] } {
  const edits: Edit[] = []
  const reasoning: ReasoningStep[] = []

  const nodeIndex = nodes.findIndex(n => n.id === nodeId)
  if (nodeIndex === -1) {
    reasoning.push({
      step: 1,
      phase: 'validating',
      thought: `Could not find node with id ${nodeId}`,
      confidence: 'low',
    })
    return { nodes, edits, reasoning }
  }

  const nodeToRemove = nodes[nodeIndex]

  reasoning.push({
    step: 1,
    phase: 'selecting',
    thought: `Removing ${nodeToRemove.type} at position ${nodeIndex + 1}`,
    confidence: 'high',
  })

  // Find edges to remove and nodes to reconnect
  const incomingEdges = edges.filter(e => e.to.nodeId === nodeId)
  const outgoingEdges = edges.filter(e => e.from.nodeId === nodeId)

  // Reconnect: connect each source to each target
  for (const inEdge of incomingEdges) {
    for (const outEdge of outgoingEdges) {
      edits.push({
        op: 'connect',
        edge: {
          id: crypto.randomUUID(),
          from: inEdge.from,
          to: outEdge.to,
          mappings: [],
        },
      })
    }
  }

  reasoning.push({
    step: 2,
    phase: 'connecting',
    thought: `Reconnected ${incomingEdges.length} sources to ${outgoingEdges.length} targets`,
    confidence: 'high',
  })

  // Note: We can't directly remove nodes with current Edit types
  // This would need an extended edit operation
  // For now, we return the filtered node list

  const updatedNodes = nodes.filter(n => n.id !== nodeId)

  return { nodes: updatedNodes, edits, reasoning }
}

/**
 * Applies a refinement intent to the current workflow
 */
export function applyRefinement(
  intent: RefinementIntent,
  nodes: Node[],
  edges: { id: string; from: { nodeId: string }; to: { nodeId: string } }[],
  planVersion: number
): RefinementResult {
  const reasoning: ReasoningStep[] = [{
    step: 1,
    phase: 'understanding',
    thought: `Applying ${intent.type} refinement: "${intent.matchedText}"`,
    confidence: intent.confidence,
  }]

  try {
    switch (intent.type) {
      case 'add_node': {
        if (!intent.newNodeType || !intent.position) {
          return {
            success: false,
            edits: [],
            reasoning: [...reasoning, {
              step: 2,
              phase: 'validating',
              thought: 'Missing node type or position for add operation',
              confidence: 'low',
            }],
            error: 'Could not determine which node to add or where',
            newPlanVersion: planVersion,
          }
        }
        const result = addNodeAtPosition(nodes, edges, intent.newNodeType, intent.position)
        return {
          success: true,
          edits: result.edits,
          reasoning: [...reasoning, ...result.reasoning],
          newPlanVersion: planVersion + 1,
        }
      }

      case 'remove_node': {
        if (!intent.targetNodeTypes || intent.targetNodeTypes.length === 0) {
          return {
            success: false,
            edits: [],
            reasoning: [...reasoning, {
              step: 2,
              phase: 'validating',
              thought: 'Could not identify which node to remove',
              confidence: 'low',
            }],
            error: 'Could not determine which node to remove',
            newPlanVersion: planVersion,
          }
        }
        const nodeToRemove = nodes.find(n => intent.targetNodeTypes!.includes(n.type))
        if (!nodeToRemove) {
          return {
            success: false,
            edits: [],
            reasoning,
            error: `Node of type ${intent.targetNodeTypes[0]} not found`,
            newPlanVersion: planVersion,
          }
        }
        const result = deleteNodeAndReconnect(nodes, edges, nodeToRemove.id)
        return {
          success: true,
          edits: result.edits,
          reasoning: [...reasoning, ...result.reasoning],
          newPlanVersion: planVersion + 1,
        }
      }

      case 'replace_node': {
        if (!intent.targetNodeTypes || !intent.newNodeType) {
          return {
            success: false,
            edits: [],
            reasoning,
            error: 'Could not determine replacement',
            newPlanVersion: planVersion,
          }
        }
        const result = replaceNode(nodes, edges, intent.targetNodeTypes[0], intent.newNodeType, false)
        return {
          success: true,
          edits: result.edits,
          reasoning: [...reasoning, ...result.reasoning],
          newPlanVersion: planVersion + 1,
        }
      }

      case 'modify_config': {
        if (!intent.configChanges) {
          return {
            success: false,
            edits: [],
            reasoning,
            error: 'No configuration changes specified',
            newPlanVersion: planVersion,
          }
        }

        // Find the node to modify (use target if specified, otherwise most relevant node)
        let nodeToModify: Node | undefined
        if (intent.targetNodeTypes && intent.targetNodeTypes.length > 0) {
          nodeToModify = nodes.find(n => intent.targetNodeTypes!.includes(n.type))
        } else {
          // Find by field name in configChanges
          const fieldName = Object.keys(intent.configChanges)[0]
          nodeToModify = nodes.find(n =>
            Object.keys(n.config || {}).includes(fieldName)
          )
        }

        if (!nodeToModify) {
          return {
            success: false,
            edits: [],
            reasoning,
            error: 'Could not find node to modify',
            newPlanVersion: planVersion,
          }
        }

        const edits: Edit[] = [{
          op: 'setConfig',
          nodeId: nodeToModify.id,
          patch: intent.configChanges,
        }]

        reasoning.push({
          step: 2,
          phase: 'configuring',
          thought: `Updating config for ${nodeToModify.type}`,
          decision: `Set: ${JSON.stringify(intent.configChanges)}`,
          confidence: 'high',
        })

        return {
          success: true,
          edits,
          reasoning,
          newPlanVersion: planVersion + 1,
        }
      }

      // Other refinement types...
      default:
        return {
          success: false,
          edits: [],
          reasoning: [...reasoning, {
            step: 2,
            phase: 'validating',
            thought: `Refinement type ${intent.type} not yet implemented`,
            confidence: 'low',
          }],
          error: `Refinement type ${intent.type} not yet supported`,
          newPlanVersion: planVersion,
        }
    }
  } catch (error) {
    return {
      success: false,
      edits: [],
      reasoning: [...reasoning, {
        step: reasoning.length + 1,
        phase: 'validating',
        thought: 'Error applying refinement',
        decision: error instanceof Error ? error.message : 'Unknown error',
        confidence: 'low',
      }],
      error: error instanceof Error ? error.message : 'Unknown error',
      newPlanVersion: planVersion,
    }
  }
}
