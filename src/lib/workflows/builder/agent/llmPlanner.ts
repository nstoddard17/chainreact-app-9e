/**
 * LLM-Powered Workflow Planner
 *
 * This module implements an intelligent workflow planner that uses LLM
 * to generate complex workflows from natural language prompts. It supports:
 * - 10-15+ node workflows from a single prompt
 * - Conversational refinement
 * - Visible reasoning/rationale
 * - Partial configuration with confidence scores
 * - Branching and conditional logic
 *
 * Architecture:
 * - Stage 1: Node selection using compact catalog (~2K tokens)
 * - Stage 2: Configuration using full schemas (loaded on demand)
 * - Stage 3: Edge generation and layout
 */

import OpenAI from 'openai'
import { z } from 'zod'
import type { Node, Edge } from '../schema'
import type { Edit, PlannerResult } from './planner'
import type {
  LLMPlannerInput,
  LLMPlannerOutput,
  PlannedNode,
  PlannedEdge,
  ReasoningStep,
  NodeConfiguration,
  ConversationMessage,
  ConfigConfidence,
  ConditionalBranch,
  BranchLayout,
  BranchCondition,
} from './types'
import {
  formatCatalogForLLM,
  formatCatalogForProviders,
  formatCatalogVerbose,
  getFullNodeSchemas,
  formatConfigSchemaForLLM,
  formatOutputSchemaForLLM,
  getCompactCatalog,
} from './nodeCatalog'
import {
  NodeSelectionResponseSchema,
  NodeConfigurationResponseSchema,
} from './llmPlannerSchemas'
import { logger } from '../../../../../lib/utils/logger'

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_LAYOUT = {
  startX: 400,
  startY: 100,
  nodeSpacingY: 160,
  branchSpacingX: 400,
}

// ============================================================================
// OPENAI CLIENT (lazy initialization)
// ============================================================================

let _openai: OpenAI | null = null

function getOpenAIClient(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    })
  }
  return _openai
}

// ============================================================================
// PROMPT TEMPLATES
// ============================================================================

const NODE_SELECTION_SYSTEM_PROMPT = `You are an expert workflow automation architect. Your task is to select the appropriate nodes for a workflow based on the user's request.

IMPORTANT RULES:
1. Start with a trigger node that initiates the workflow
2. Add action nodes in logical sequence
3. Use logic nodes (if_else, switch) for conditional flows
4. Use AI nodes for text generation, summarization, or analysis
5. Consider error handling and data transformation needs
6. Support 10-15+ node workflows when the request is complex

OUTPUT FORMAT:
Return a JSON object with:
- selectedNodes: array of {type, position, reasoning, confidence}
- reasoning: array of reasoning steps showing your thought process
- hasBranching: boolean indicating if workflow has conditional paths
- branchPoints: (if hasBranching) array of branch definitions
- workflowName: suggested name for the workflow (max 50 chars)

CONFIDENCE LEVELS:
- "high": You're certain this node is needed
- "medium": This node is likely needed but could be skipped
- "low": This node might be helpful but is optional

VARIABLE REFERENCES:
When nodes need to reference data from previous nodes, use:
- {{trigger.fieldName}} for trigger outputs
- {{nodeName.fieldName}} for action outputs
- {{AI_FIELD:fieldName}} for AI-generated content at runtime`

const NODE_CONFIGURATION_SYSTEM_PROMPT = `You are an expert workflow configuration assistant. Your task is to configure the selected workflow nodes based on the user's request.

RULES:
1. Configure all required fields with appropriate values
2. Use variable references ({{trigger.field}}, {{nodeName.field}}) to connect nodes
3. Use {{AI_FIELD:fieldName}} for fields that should be AI-generated at runtime
4. Leave dynamic/dropdown fields empty if they require API loading
5. Provide confidence level for each configured field

OUTPUT FORMAT:
Return a JSON object with:
- configurations: Record<nodeType, {config, confidence, fieldConfidence, userRequiredFields, dynamicFields}>
- variableMappings: Record<"nodeType.field", "sourceNode.sourceField">

FIELD CONFIGURATION:
- For text fields: provide actual value or variable reference
- For select fields with known options: pick the best option
- For dynamic select fields: leave empty, mark as dynamicField
- For boolean fields: set true/false based on context
- For required fields you can't determine: add to userRequiredFields`

// ============================================================================
// STAGE 1: NODE SELECTION
// ============================================================================

async function selectNodes(
  prompt: string,
  connectedIntegrations: string[],
  conversationHistory?: ConversationMessage[]
): Promise<{
  nodes: PlannedNode[]
  reasoning: ReasoningStep[]
  hasBranching: boolean
  branchPoints?: Array<{
    afterPosition: number
    condition: string
    trueBranch: string[]
    falseBranch?: string[]
  }>
  workflowName?: string
}> {
  // Build catalog - filter to connected integrations if provided
  // Use verbose format since GPT-4 has large context window
  const catalog = connectedIntegrations.length > 0
    ? formatCatalogForProviders(connectedIntegrations)
    : formatCatalogVerbose()

  // Build conversation context
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: NODE_SELECTION_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Available nodes:\n${catalog}\n\nConnected integrations: ${connectedIntegrations.length > 0 ? connectedIntegrations.join(', ') : 'All integrations available'}\n\nUser request: "${prompt}"`,
    },
  ]

  // Add conversation history for refinement context
  if (conversationHistory && conversationHistory.length > 0) {
    const historyContext = conversationHistory
      .slice(-5) // Last 5 messages for context
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n')
    messages.push({
      role: 'user',
      content: `Previous conversation:\n${historyContext}\n\nCurrent request: "${prompt}"`,
    })
  }

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o',
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.3, // Lower temperature for more consistent planning
      max_tokens: 2000,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('Empty response from LLM')
    }

    const parsed = JSON.parse(content)

    // Validate with Zod
    const validated = NodeSelectionResponseSchema.parse(parsed)

    // Convert to PlannedNode format
    const nodes: PlannedNode[] = validated.selectedNodes.map(n => ({
      type: n.type,
      position: n.position,
      confidence: n.confidence,
      reasoning: n.reasoning,
    }))

    return {
      nodes,
      reasoning: validated.reasoning,
      hasBranching: validated.hasBranching,
      branchPoints: validated.branchPoints,
      workflowName: validated.workflowName,
    }
  } catch (error) {
    logger.error('[LLMPlanner] Node selection failed', { error })
    throw error
  }
}

// ============================================================================
// STAGE 2: NODE CONFIGURATION
// ============================================================================

async function configureNodes(
  nodes: PlannedNode[],
  prompt: string,
  connectedIntegrations: string[]
): Promise<{
  configurations: Record<string, {
    config: Record<string, any>
    partialConfig: NodeConfiguration
  }>
  variableMappings: Record<string, string>
}> {
  // Load full schemas for selected nodes
  const nodeTypes = nodes.map(n => n.type)
  const schemas = getFullNodeSchemas(nodeTypes)

  // Build schema context for LLM
  const schemaContext = nodeTypes
    .map(type => {
      const schema = schemas.get(type)
      if (!schema) return `${type}: Schema not found`
      return formatConfigSchemaForLLM(schema)
    })
    .join('\n\n')

  // Build output context for variable references
  const outputContext = nodeTypes
    .map(type => {
      const schema = schemas.get(type)
      if (!schema) return ''
      return formatOutputSchemaForLLM(schema)
    })
    .filter(Boolean)
    .join('\n\n')

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: NODE_CONFIGURATION_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `User request: "${prompt}"

Selected nodes (in order):
${nodes.map((n, i) => `${i + 1}. ${n.type}`).join('\n')}

Node schemas:
${schemaContext}

Available outputs for variable references:
${outputContext}

Configure each node appropriately.`,
    },
  ]

  try {
    const response = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o',
      messages,
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 3000,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('Empty response from LLM')
    }

    const parsed = JSON.parse(content)
    const validated = NodeConfigurationResponseSchema.parse(parsed)

    // Convert to our format
    const configurations: Record<string, {
      config: Record<string, any>
      partialConfig: NodeConfiguration
    }> = {}

    for (const [nodeType, configData] of Object.entries(validated.configurations)) {
      const schema = schemas.get(nodeType)

      // Build partial config metadata
      const partialConfig: NodeConfiguration = {
        aiConfigured: {},
        userRequired: configData.userRequiredFields.map(f => ({
          fieldName: f.field,
          fieldLabel: schema?.configSchema?.find(s => s.name === f.field)?.label || f.field,
          fieldType: schema?.configSchema?.find(s => s.name === f.field)?.type || 'text',
          reason: f.reason,
        })),
        dynamicPending: configData.dynamicFields.map(f => ({
          fieldName: f,
          fieldLabel: schema?.configSchema?.find(s => s.name === f)?.label || f,
          dependsOn: schema?.configSchema?.find(s => s.name === f)?.dependsOn,
        })),
        completeness: 0,
      }

      // Calculate completeness
      const totalFields = schema?.configSchema?.filter(f => f.required).length || 0
      const configuredFields = Object.keys(configData.config).filter(
        k => configData.config[k] !== '' && configData.config[k] !== null
      ).length
      partialConfig.completeness = totalFields > 0 ? configuredFields / totalFields : 1

      // Build aiConfigured from fieldConfidence
      for (const [field, confData] of Object.entries(configData.fieldConfidence)) {
        if (configData.config[field] !== undefined && configData.config[field] !== '') {
          partialConfig.aiConfigured[field] = {
            value: configData.config[field],
            confidence: confData.confidence,
            reason: confData.reason,
          }
        }
      }

      configurations[nodeType] = {
        config: configData.config,
        partialConfig,
      }
    }

    return {
      configurations,
      variableMappings: validated.variableMappings,
    }
  } catch (error) {
    logger.error('[LLMPlanner] Node configuration failed', { error })
    throw error
  }
}

// ============================================================================
// STAGE 3: EDGE & LAYOUT GENERATION
// ============================================================================

function generateEdgesAndLayout(
  nodes: PlannedNode[],
  branchPoints?: Array<{
    afterPosition: number
    condition: string
    trueBranch: string[]
    falseBranch?: string[]
  }>
): {
  edges: PlannedEdge[]
  branches?: ConditionalBranch[]
  branchLayout?: BranchLayout
} {
  const edges: PlannedEdge[] = []
  const branches: ConditionalBranch[] = []

  if (!branchPoints || branchPoints.length === 0) {
    // Simple sequential flow
    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push({
        fromPosition: nodes[i].position,
        toPosition: nodes[i + 1].position,
      })
    }
    return { edges }
  }

  // Complex branching flow
  let currentPosition = 1
  const branchLayout: BranchLayout = {
    mainLaneX: DEFAULT_LAYOUT.startX,
    branchSpacing: DEFAULT_LAYOUT.branchSpacingX,
    branches: [],
  }

  for (const bp of branchPoints) {
    // Connect nodes before branch point
    while (currentPosition < bp.afterPosition) {
      edges.push({
        fromPosition: currentPosition,
        toPosition: currentPosition + 1,
      })
      currentPosition++
    }

    // Create branch
    const branchId = `branch-${bp.afterPosition}`
    const trueBranchId = `${branchId}-true`
    const falseBranchId = `${branchId}-false`

    branches.push({
      id: trueBranchId,
      label: 'If ' + bp.condition,
      conditions: [{
        field: bp.condition,
        operator: 'equals',
        value: true,
      }],
      conditionLogic: 'and',
      nodeIds: bp.trueBranch,
    })

    if (bp.falseBranch && bp.falseBranch.length > 0) {
      branches.push({
        id: falseBranchId,
        label: 'Otherwise',
        conditions: [{
          field: bp.condition,
          operator: 'equals',
          value: false,
        }],
        conditionLogic: 'and',
        nodeIds: bp.falseBranch,
      })
    }

    // Add to layout
    branchLayout.branches.push({
      branchId: trueBranchId,
      laneIndex: 1,
      xPosition: DEFAULT_LAYOUT.startX + DEFAULT_LAYOUT.branchSpacingX,
    })

    if (bp.falseBranch) {
      branchLayout.branches.push({
        branchId: falseBranchId,
        laneIndex: 2,
        xPosition: DEFAULT_LAYOUT.startX + DEFAULT_LAYOUT.branchSpacingX * 2,
      })
    }
  }

  // Connect remaining nodes after all branches
  const maxPosition = Math.max(...nodes.map(n => n.position))
  while (currentPosition < maxPosition) {
    edges.push({
      fromPosition: currentPosition,
      toPosition: currentPosition + 1,
    })
    currentPosition++
  }

  return {
    edges,
    branches: branches.length > 0 ? branches : undefined,
    branchLayout: branches.length > 0 ? branchLayout : undefined,
  }
}

// ============================================================================
// EDIT GENERATION
// ============================================================================

function generateEdits(
  nodes: PlannedNode[],
  edges: PlannedEdge[],
  configurations: Record<string, { config: Record<string, any>; partialConfig: NodeConfiguration }>,
  existingNodeIds: Set<string>,
  branches?: ConditionalBranch[],
  branchLayout?: BranchLayout
): Edit[] {
  const edits: Edit[] = []
  const nodeIdMap = new Map<number, string>() // position -> nodeId

  // Sort nodes by position
  const sortedNodes = [...nodes].sort((a, b) => a.position - b.position)

  // Create node edits
  for (const plannedNode of sortedNodes) {
    const nodeId = crypto.randomUUID()
    nodeIdMap.set(plannedNode.position, nodeId)

    // Determine position
    let x = DEFAULT_LAYOUT.startX
    let y = DEFAULT_LAYOUT.startY + (plannedNode.position - 1) * DEFAULT_LAYOUT.nodeSpacingY

    // Adjust for branching
    if (plannedNode.lane !== undefined && plannedNode.lane > 0 && branchLayout) {
      x = branchLayout.mainLaneX + plannedNode.lane * branchLayout.branchSpacing
    }

    const config = configurations[plannedNode.type]?.config || {}
    const partialConfig = configurations[plannedNode.type]?.partialConfig

    const node: Node = {
      id: nodeId,
      type: plannedNode.type,
      label: plannedNode.label || plannedNode.type,
      description: plannedNode.reasoning,
      config,
      inPorts: [],
      outPorts: [],
      io: { inputSchema: undefined, outputSchema: undefined },
      policy: { timeoutMs: 60000, retries: 0 },
      costHint: 0,
      metadata: {
        position: { x, y },
        agentHighlights: Object.keys(config),
        lane: plannedNode.lane || 0,
        branchIndex: plannedNode.position,
        branchId: plannedNode.branchId,
        aiConfidence: plannedNode.confidence,
        partialConfig: partialConfig ? {
          userRequiredCount: partialConfig.userRequired.length,
          dynamicPendingCount: partialConfig.dynamicPending.length,
          completeness: partialConfig.completeness,
        } : undefined,
      },
    }

    edits.push({ op: 'addNode', node })
  }

  // Create edge edits
  for (const plannedEdge of edges) {
    const fromNodeId = nodeIdMap.get(plannedEdge.fromPosition)
    const toNodeId = nodeIdMap.get(plannedEdge.toPosition)

    if (!fromNodeId || !toNodeId) {
      logger.warn('[LLMPlanner] Edge references non-existent node position', {
        from: plannedEdge.fromPosition,
        to: plannedEdge.toPosition,
      })
      continue
    }

    const edge: Edge = {
      id: crypto.randomUUID(),
      from: { nodeId: fromNodeId },
      to: { nodeId: toNodeId },
      mappings: [],
    }

    // Add condition metadata for conditional edges
    if (plannedEdge.condition) {
      (edge as any).metadata = {
        condition: plannedEdge.condition,
        label: plannedEdge.label,
      }
    }

    edits.push({ op: 'connect', edge })
  }

  return edits
}

// ============================================================================
// MAIN PLANNER FUNCTION
// ============================================================================

/**
 * Plans workflow edits using LLM
 *
 * This is the main entry point for the LLM planner. It:
 * 1. Selects appropriate nodes using compact catalog
 * 2. Loads full schemas for selected nodes
 * 3. Configures nodes with field values
 * 4. Generates edges and layout
 * 5. Returns Edit operations for the workflow builder
 */
export async function planWithLLM(input: LLMPlannerInput): Promise<LLMPlannerOutput> {
  const startTime = Date.now()
  const allReasoning: ReasoningStep[] = []

  // Add initial reasoning step
  allReasoning.push({
    step: 1,
    phase: 'understanding',
    thought: `Analyzing request: "${input.prompt}"`,
  })

  try {
    // Stage 1: Node Selection
    allReasoning.push({
      step: 2,
      phase: 'selecting',
      thought: 'Selecting appropriate nodes from catalog...',
    })

    const {
      nodes: selectedNodes,
      reasoning: selectionReasoning,
      hasBranching,
      branchPoints,
      workflowName,
    } = await selectNodes(
      input.prompt,
      input.connectedIntegrations || [],
      input.conversationHistory
    )

    allReasoning.push(...selectionReasoning)

    if (selectedNodes.length === 0) {
      return {
        nodes: [],
        edges: [],
        reasoning: allReasoning,
        partialConfigs: {},
        confidence: 'low',
        planVersion: 1,
        prerequisites: [],
      }
    }

    allReasoning.push({
      step: allReasoning.length + 1,
      phase: 'selecting',
      thought: `Selected ${selectedNodes.length} nodes`,
      decision: selectedNodes.map(n => n.type).join(' → '),
      confidence: 'high',
    })

    // Stage 2: Configuration
    allReasoning.push({
      step: allReasoning.length + 1,
      phase: 'configuring',
      thought: 'Configuring nodes with appropriate values...',
    })

    const { configurations, variableMappings } = await configureNodes(
      selectedNodes,
      input.prompt,
      input.connectedIntegrations || []
    )

    // Stage 3: Edge Generation
    allReasoning.push({
      step: allReasoning.length + 1,
      phase: 'connecting',
      thought: 'Creating connections between nodes...',
    })

    const { edges, branches, branchLayout } = generateEdgesAndLayout(
      selectedNodes,
      branchPoints
    )

    // Build partial configs map
    const partialConfigs: Record<string, NodeConfiguration> = {}
    for (const [nodeType, config] of Object.entries(configurations)) {
      partialConfigs[nodeType] = config.partialConfig
    }

    // Calculate overall confidence
    const confidenceScores = selectedNodes.map(n => {
      switch (n.confidence) {
        case 'high': return 1
        case 'medium': return 0.7
        case 'low': return 0.4
      }
    })
    const avgConfidence = confidenceScores.reduce((a, b) => a + b, 0) / confidenceScores.length
    const overallConfidence: ConfigConfidence =
      avgConfidence >= 0.8 ? 'high' :
      avgConfidence >= 0.5 ? 'medium' : 'low'

    // Determine prerequisites
    const prerequisites: string[] = []
    const compactCatalog = getCompactCatalog()
    for (const node of selectedNodes) {
      const catalogEntry = compactCatalog.find(e => e.type === node.type)
      if (catalogEntry?.requiresAuth && catalogEntry.provider) {
        if (!input.connectedIntegrations?.includes(catalogEntry.provider)) {
          prerequisites.push(`integration:${catalogEntry.provider}`)
        }
      }
    }

    allReasoning.push({
      step: allReasoning.length + 1,
      phase: 'validating',
      thought: `Plan complete with ${selectedNodes.length} nodes and ${edges.length} connections`,
      decision: hasBranching ? 'Workflow includes conditional branching' : 'Sequential workflow',
      confidence: overallConfidence,
    })

    const duration = Date.now() - startTime
    logger.debug('[LLMPlanner] Planning complete', {
      duration,
      nodeCount: selectedNodes.length,
      edgeCount: edges.length,
      confidence: overallConfidence,
    })

    return {
      nodes: selectedNodes,
      edges,
      reasoning: allReasoning,
      partialConfigs,
      confidence: overallConfidence,
      branches,
      branchLayout,
      planVersion: 1,
      workflowName,
      prerequisites: [...new Set(prerequisites)],
    }
  } catch (error) {
    logger.error('[LLMPlanner] Planning failed', { error })

    allReasoning.push({
      step: allReasoning.length + 1,
      phase: 'validating',
      thought: 'Planning encountered an error',
      decision: error instanceof Error ? error.message : 'Unknown error',
      confidence: 'low',
    })

    throw error
  }
}

/**
 * Converts LLM planner output to PlannerResult format for backward compatibility
 */
export function llmOutputToPlannerResult(
  output: LLMPlannerOutput,
  existingNodeIds: Set<string>
): PlannerResult & { reasoning?: ReasoningStep[]; partialConfigs?: Record<string, NodeConfiguration> } {
  // Build configurations map
  const configurations: Record<string, { config: Record<string, any>; partialConfig: NodeConfiguration }> = {}
  for (const [nodeType, partialConfig] of Object.entries(output.partialConfigs)) {
    const config: Record<string, any> = {}
    for (const [field, configData] of Object.entries(partialConfig.aiConfigured)) {
      config[field] = configData.value
    }
    configurations[nodeType] = { config, partialConfig }
  }

  // Generate edits
  const edits = generateEdits(
    output.nodes,
    output.edges,
    configurations,
    existingNodeIds,
    output.branches,
    output.branchLayout
  )

  // Build rationale from reasoning
  const rationale = output.reasoning
    .filter(r => r.decision)
    .map(r => r.decision)
    .join(' → ')

  return {
    edits,
    prerequisites: output.prerequisites,
    rationale: rationale || 'Plan generated by LLM',
    deterministicHash: '', // LLM plans are not deterministic
    workflowName: output.workflowName,
    reasoning: output.reasoning,
    partialConfigs: output.partialConfigs,
  }
}
