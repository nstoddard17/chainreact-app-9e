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
  IntentStrategy,
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
  IntentStrategyResponseSchema,
} from './llmPlannerSchemas'
import { logger } from '../../../../../lib/utils/logger'
import { callLLMWithRetry, parseLLMJson } from '../../../../../lib/ai/llm-retry'
import { AI_MODELS } from '../../../../../lib/ai/models'
import { truncateConversationHistory, summarizeConversation } from '../../../../../lib/ai/token-utils'
import { formatDraftingContextForLLM, DRAFTING_CONTEXT_RULES, type DraftingContext } from './draftingContext'
import { classifyAllFields, formatClassificationsForLLM } from './fieldClassifier'
import type { NodeComponent } from '../../../../../lib/workflows/nodes/types'

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_LAYOUT = {
  startX: 400,
  startY: 100,
  nodeSpacingY: 160,
  branchSpacingX: 400,
}

const DEFAULT_MAX_NODES = 7

// ============================================================================
// FLOW STATE FORMATTING
// ============================================================================

/**
 * Creates a compact string representation of the current workflow for LLM context.
 * Target: <200 tokens for a 10-node workflow.
 */
export function formatFlowStateForLLM(flow: { nodes: Node[]; edges: Edge[] }): string {
  if (!flow.nodes || flow.nodes.length === 0) {
    return 'CURRENT WORKFLOW: Empty (no nodes yet)'
  }

  const nodeList = flow.nodes.map((n, i) => {
    const label = n.label && n.label !== n.type ? ` "${n.label}"` : ''
    return `  ${i + 1}. ${n.type}${label}`
  }).join('\n')

  const edgeList = flow.edges.map(e => {
    const fromNode = flow.nodes.find(n => n.id === e.from.nodeId)
    const toNode = flow.nodes.find(n => n.id === e.to.nodeId)
    return `  ${fromNode?.type || '?'} → ${toNode?.type || '?'}`
  }).join('\n')

  return `CURRENT WORKFLOW (${flow.nodes.length} nodes):\nNodes:\n${nodeList}${edgeList ? `\nConnections:\n${edgeList}` : ''}`
}

// ============================================================================
// PROMPT TEMPLATES
// ============================================================================

const NODE_SELECTION_SYSTEM_PROMPT = `You are an AI workflow planner for ChainReact.

Your job is to convert a user request into a small, focused, useful workflow.

CRITICAL PRINCIPLES:

1. STRATEGY BEFORE NODES
   Before selecting nodes, interpret the user's goal and define a clear strategy.
   Think:
   - What event starts this workflow?
   - What is the main outcome?
   - What are the minimal steps required?
   Then select nodes that implement that strategy.

2. KEEP WORKFLOWS SIMPLE
   Default to: 1 trigger + 1–3 actions (max 4 steps).
   Only exceed this if explicitly required.

3. DO NOT OVER-ASK QUESTIONS
   - If you can reasonably proceed, DO NOT ask questions
   - Assume sensible defaults
   - Ask only when absolutely necessary

4. USE CONNECTED INTEGRATIONS
   - Prefer integrations already connected
   - If user says "email" and only Gmail is connected → use Gmail

5. ONE STRATEGY PER WORKFLOW
   - Choose ONE approach
   - Do NOT combine multiple strategies

6. EVERY NODE MUST HAVE PURPOSE
   - Each node must clearly contribute to the goal
   - If not → remove it

7. MODIFY OVER CREATE
   If context exists:
   - modify existing nodes
   - DO NOT duplicate

8. NODE LIMIT (STRICT)
   - Maximum 7 nodes unless explicitly requested

HANDLING DIFFERENT PROMPT TYPES:
- Specific commands ("when I get an email, send to Slack") → Build exactly what's requested.
- Business goals ("improve retention", "automate onboarding") → Choose ONE clear approach, build it, explain why.
- Vague requests ("automate my CRM") → Pick the highest-impact automation and build it.

VARIABLE REFERENCES:
- {{trigger.field}} for trigger outputs
- {{nodeId.field}} for action outputs
- {{AI_FIELD:fieldName}} for runtime-generated values
- Only reference fields that exist in output schema

CONTEXT RULES:
- Context nodes are the source of truth
- Do NOT ignore or replace them
- Data flows from earlier → later nodes
- When modifying existing workflows, modify/reconfigure existing nodes rather than creating replacements
- Limit new node creation: add at most 3 new nodes per request unless explicitly asked

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
- "low": This node might be helpful but is optional`

const NODE_CONFIGURATION_SYSTEM_PROMPT = `You are configuring workflow nodes for ChainReact.

Your job is to intelligently fill node fields using:
- workflow context
- upstream outputs
- schema definitions

CRITICAL RULES:

1. NEVER LEAVE USEFUL FIELDS EMPTY
   If a reasonable value exists → fill it

2. USE OUTPUT DATA AGGRESSIVELY
   - Prefer mapping over static values
   - Always use upstream data when relevant
   Example: "New email from {{trigger.sender}}: {{trigger.subject}}"

FIELD MODE SELECTION (MANDATORY):
For EVERY field, choose ONE:

(A) DETERMINISTIC
- fixed config values, IDs, dropdowns, booleans, user-specific selections

(B) MAPPABLE
- use {{nodeId.field}}
- ONLY if field exists in upstream output schema

(C) GENERATIVE (AI_FIELD)
- use {{AI_FIELD:fieldName}} when:
  - content must be generated
  - summarization or rewriting is needed
  - value depends on interpretation

HARD RULES:

1. NEVER LEAVE TEXT FIELDS EMPTY
   If text-based and no mapping → use {{AI_FIELD:fieldName}}

2. VARIABLE RULES
   - ONLY use {{nodeId.field}}
   - nodeId must exist
   - field must exist in output schema

3. DO NOT HALLUCINATE
   - Do NOT invent fields or values

4. REQUIRED FIELDS
   - If unknown → mark as userRequired
   - DO NOT guess

5. DO NOT RE-ASK KNOWN DATA
   If data exists → USE IT

CONFIDENCE BEHAVIOR:
- High confidence → fill
- Medium → fill (editable)
- Low → userRequired

FIELD PRIORITY LOGIC:
1. deterministic → set
2. mappable → map
3. text-based → AI_FIELD
4. otherwise → userRequired

AI_FIELD USAGE:
{{AI_FIELD:fieldName}} means value generated at runtime

USE FOR: message content, summaries, descriptions, generated text, classification
DO NOT USE FOR: IDs, dropdowns, structural config

CONTEXT ENFORCEMENT:
- Context nodes are the source of truth
- Nodes are ordered trigger → downstream
- Data flows forward only

MODIFICATION RULE:
If request implies change → update existing nodes, do NOT recreate

OUTPUT FORMAT:
Return a JSON object with:
- configurations: Record<nodeType, {config, confidence, fieldConfidence, userRequiredFields, dynamicFields}>
- variableMappings: Record<"nodeType.field", "sourceNode.sourceField">`

// ============================================================================
// PRE-STAGE: INTENT ANALYSIS
// ============================================================================

/**
 * Lightweight pre-planning step that interprets user intent before node selection.
 * Returns a structured strategy: trigger, actions, reasoning.
 * On failure, returns null and planning proceeds without it.
 */
async function analyzeIntent(
  prompt: string,
  connectedIntegrations: string[]
): Promise<IntentStrategy | null> {
  try {
    const result = await callLLMWithRetry({
      messages: [
        {
          role: 'system',
          content: `You are a workflow strategy advisor. Given a user's automation request, interpret their goal and suggest a concrete strategy. Be concise.

Return JSON:
{
  "userGoal": "what the user wants to achieve",
  "interpretedStrategy": "how to achieve it as an automation",
  "suggestedTrigger": "what event starts this workflow",
  "suggestedActions": ["action1", "action2"],
  "reasoning": "why this strategy",
  "confidence": "high" | "medium" | "low"
}`
        },
        {
          role: 'user',
          content: `Request: "${prompt}"
Connected integrations: ${connectedIntegrations.length > 0 ? connectedIntegrations.join(', ') : 'None'}`
        }
      ],
      model: AI_MODELS.fast,
      temperature: 0.2,
      maxTokens: 500,
      jsonMode: true,
      timeoutMs: 5000,
      maxRetries: 1,
      fallbackModel: null,
      label: 'LLMPlanner:analyzeIntent',
    })

    const parsed = parseLLMJson(result.content, 'LLMPlanner:analyzeIntent')
    const validated = IntentStrategyResponseSchema.parse(parsed)

    logger.info('[LLMPlanner] Intent analysis complete', {
      goal: validated.userGoal,
      trigger: validated.suggestedTrigger,
      actionCount: validated.suggestedActions.length,
      confidence: validated.confidence,
    })

    return validated
  } catch (error: any) {
    logger.debug('[LLMPlanner] Intent analysis skipped (non-critical)', {
      error: error?.message || String(error),
    })
    return null
  }
}

// ============================================================================
// STAGE 1: NODE SELECTION
// ============================================================================

async function selectNodes(
  prompt: string,
  connectedIntegrations: string[],
  conversationHistory?: ConversationMessage[],
  currentFlow?: { nodes: Node[]; edges: Edge[] },
  draftingContext?: DraftingContext
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
  // When drafting context is present, append the mandatory behavioral rules to the system prompt
  const systemPrompt = draftingContext
    ? `${NODE_SELECTION_SYSTEM_PROMPT}\n\n${DRAFTING_CONTEXT_RULES}`
    : NODE_SELECTION_SYSTEM_PROMPT

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: `AVAILABLE NODES (you MUST only use node types from this list):\n${catalog}\n\n${
        connectedIntegrations.length > 0
          ? `The user has connected these integrations: ${connectedIntegrations.join(', ')}. BUILD the workflow using ONLY these connected providers. Do not suggest disconnected providers. If the request is vague, pick the best automation using these specific apps and explain your reasoning.`
          : 'No integrations are connected yet. Use schedule or webhook triggers. In your reasoning, recommend which integrations the user should connect.'
      }\n\nUser request: "${prompt}"\n\nDesign and build a workflow for this request. If the request is vague or open-ended, use your expertise to pick the best approach and explain your reasoning.`,
    },
  ]

  // Add current workflow state context
  if (currentFlow && currentFlow.nodes.length > 0) {
    const flowContext = formatFlowStateForLLM(currentFlow)
    messages.push({
      role: 'user',
      content: `${flowContext}\n\nThe user wants to MODIFY this existing workflow. Consider what already exists and make targeted changes rather than rebuilding from scratch.`,
    })
  }

  // Add structured drafting context (authoritative summary of conversation state)
  if (draftingContext) {
    messages.push({
      role: 'user',
      content: formatDraftingContextForLLM(draftingContext),
    })
  }

  // Add conversation history with summarization for longer conversations
  if (conversationHistory && conversationHistory.length > 0) {
    // Check for cached summary in the most recent assistant message metadata
    const lastAssistant = [...conversationHistory].reverse().find(m => m.role === 'assistant')
    const cachedSummary = (lastAssistant as any)?.metadata?.conversationSummary
    const cachedMessageCount = (lastAssistant as any)?.metadata?.summaryMessageCount

    const { summary, recentMessages, wasSummarized } = await summarizeConversation(
      conversationHistory,
      { recentMessageCount: 3, cachedSummary, cachedMessageCount }
    )

    let contextBlock = ''
    if (wasSummarized && summary) {
      contextBlock += `Summary of earlier conversation:\n${summary}\n\n`
    }
    if (recentMessages.length > 0) {
      contextBlock += `Recent conversation:\n${recentMessages.map(m => `${m.role}: ${m.content}`).join('\n')}`
    }

    messages.push({
      role: 'user',
      content: `${contextBlock}\n\nCurrent request: "${prompt}"`,
    })
  }

  try {
    const result = await callLLMWithRetry({
      messages,
      model: AI_MODELS.planning,
      temperature: 0.3,
      maxTokens: 2000,
      jsonMode: true,
      timeoutMs: 30000,
      maxRetries: 2,
      fallbackModel: AI_MODELS.fast,
      label: 'LLMPlanner:selectNodes',
    })

    const parsed = parseLLMJson(result.content, 'LLMPlanner:selectNodes')

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
  } catch (error: any) {
    logger.error('[LLMPlanner] Node selection failed', {
      error: error?.message || String(error),
      prompt: prompt?.substring(0, 100),
      isZodError: error?.name === 'ZodError',
      zodIssues: error?.issues?.map((i: any) => i.message),
    })
    throw error
  }
}

// ============================================================================
// STAGE 2: NODE CONFIGURATION
// ============================================================================

async function configureNodes(
  nodes: PlannedNode[],
  prompt: string,
  connectedIntegrations: string[],
  currentFlow?: { nodes: Node[]; edges: Edge[] }
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

  // Build upstream context for field classification
  // Each node can reference outputs from all preceding nodes
  const classificationsByNode = new Map<string, import('./types').FieldClassification[]>()
  for (let i = 0; i < nodeTypes.length; i++) {
    const schema = schemas.get(nodeTypes[i])
    if (!schema) continue

    // Build upstream nodes list (all preceding nodes)
    const upstreamNodes = nodeTypes.slice(0, i).map((type, idx) => {
      const upSchema = schemas.get(type)
      if (!upSchema) return null
      const isTrigger = idx === 0 && upSchema.isTrigger
      return {
        nodeId: type,
        alias: isTrigger ? 'trigger' : type.replace(/_action_|_trigger_/g, '_'),
        node: upSchema,
      }
    }).filter(Boolean) as Array<{ nodeId: string; alias: string; node: NodeComponent }>

    const classifications = classifyAllFields(schema, upstreamNodes)
    classificationsByNode.set(nodeTypes[i], classifications)
  }

  // Build schema context for LLM (enhanced with classifications)
  const schemaContext = nodeTypes
    .map(type => {
      const schema = schemas.get(type)
      if (!schema) return `${type}: Schema not found`
      const classifications = classificationsByNode.get(type)
      return formatConfigSchemaForLLM(schema, classifications)
    })
    .join('\n\n')

  // Build field mode recommendations section
  const fieldModeSection = nodeTypes
    .map(type => {
      const classifications = classificationsByNode.get(type)
      if (!classifications || classifications.length === 0) return ''
      return `${type}:\n${formatClassificationsForLLM(classifications)}`
    })
    .filter(Boolean)
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
${currentFlow && currentFlow.nodes.length > 0 ? `\nExisting workflow context:\n${formatFlowStateForLLM(currentFlow)}\n` : ''}
Node schemas:
${schemaContext}

Available outputs for variable references:
${outputContext}

${fieldModeSection ? `\n${fieldModeSection}\n` : ''}
CRITICAL RULE: NO TEXT FIELD SHOULD EVER BE EMPTY. If no mapping exists, use {{AI_FIELD:fieldName}}.

Configure each node appropriately.`,
    },
  ]

  try {
    const result = await callLLMWithRetry({
      messages,
      model: AI_MODELS.configuration,
      temperature: 0.2,
      maxTokens: 3000,
      jsonMode: true,
      timeoutMs: 30000,
      maxRetries: 2,
      fallbackModel: AI_MODELS.fast,
      label: 'LLMPlanner:configureNodes',
    })

    const parsed = parseLLMJson(result.content, 'LLMPlanner:configureNodes')
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
    // Pre-Stage: Intent Analysis (lightweight, optional)
    const intentStrategy = await analyzeIntent(
      input.prompt,
      input.connectedIntegrations || []
    )

    if (intentStrategy) {
      allReasoning.push({
        step: 2,
        phase: 'understanding',
        thought: `Strategy: ${intentStrategy.interpretedStrategy}`,
        decision: `Trigger: ${intentStrategy.suggestedTrigger} → Actions: ${intentStrategy.suggestedActions.join(', ')}`,
        confidence: intentStrategy.confidence,
      })
    }

    // Stage 1: Node Selection
    allReasoning.push({
      step: allReasoning.length + 1,
      phase: 'selecting',
      thought: 'Selecting appropriate nodes from catalog...',
    })

    let {
      nodes: selectedNodes,
      reasoning: selectionReasoning,
      hasBranching,
      branchPoints,
      workflowName,
    } = await selectNodes(
      input.prompt,
      input.connectedIntegrations || [],
      input.conversationHistory,
      input.flow,
      input.draftingContext
    )

    allReasoning.push(...selectionReasoning)

    // Hard node count guardrail
    const maxNodes = (input as any).maxNodes || DEFAULT_MAX_NODES
    if (selectedNodes.length > maxNodes) {
      logger.warn(`[LLMPlanner] Capping workflow from ${selectedNodes.length} to ${maxNodes} nodes`)
      selectedNodes = selectedNodes.slice(0, maxNodes)
    }

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
      input.connectedIntegrations || [],
      input.flow
    )

    // Post-Stage 2 Safeguards
    const nodeTypes = selectedNodes.map(n => n.type)
    const schemas = getFullNodeSchemas(nodeTypes)
    sanitizeConfigurations(configurations, schemas)
    validateVariableMappings(configurations, schemas)

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
    logger.info('[LLMPlanner] Planning complete', {
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

// ============================================================================
// POST-CONFIGURATION SAFEGUARDS
// ============================================================================

/**
 * S2: Enforce "no empty text fields" rule in code.
 * Any text-based field left empty by LLM gets auto-assigned {{AI_FIELD:fieldName}}.
 */
function sanitizeConfigurations(
  configurations: Record<string, { config: Record<string, any>; partialConfig: NodeConfiguration }>,
  schemas: Map<string, NodeComponent>
): void {
  for (const [nodeType, { config, partialConfig }] of Object.entries(configurations)) {
    const schema = schemas.get(nodeType)
    if (!schema?.configSchema) continue

    for (const field of schema.configSchema) {
      const fieldType = field.type?.toLowerCase() || ''
      const isTextBased = ['text', 'textarea', 'rich-text', 'email-rich-text', 'discord-rich-text'].includes(fieldType)
      const isEmpty = config[field.name] === undefined || config[field.name] === '' || config[field.name] === null
      const isDeterministic = field.dynamic || ['select', 'combobox', 'boolean', 'button-toggle'].includes(fieldType)

      // S2: Auto-assign AI_FIELD to empty text fields
      if (isTextBased && isEmpty && !isDeterministic) {
        config[field.name] = `{{AI_FIELD:${field.name}}}`
        partialConfig.aiConfigured[field.name] = {
          value: `{{AI_FIELD:${field.name}}}`,
          confidence: 'medium',
          reason: 'Auto-assigned AI generation (no value or mapping provided)',
        }
        logger.debug('[LLMPlanner] Sanitizer: auto-assigned AI_FIELD', { nodeType, field: field.name })
      }

      // S4: Fix nested or duplicated AI_FIELD patterns
      if (typeof config[field.name] === 'string') {
        config[field.name] = config[field.name]
          .replace(/\{\{AI_FIELD:\{\{AI_FIELD:([^}]+)\}\}\}\}/g, '{{AI_FIELD:$1}}')
          .replace(/(\{\{AI_FIELD:[^}]+\}\})\1+/g, '$1')
      }
    }
  }
}

/**
 * S3: Validate variable references against actual output schemas.
 * Invalid references get replaced with {{AI_FIELD:fieldName}} fallback.
 */
function validateVariableMappings(
  configurations: Record<string, { config: Record<string, any> }>,
  schemas: Map<string, NodeComponent>
): void {
  const outputsByType = new Map<string, Set<string>>()
  for (const [type, schema] of schemas) {
    const outputs = new Set((schema.outputSchema || []).map(o => o.name))
    outputsByType.set(type, outputs)
  }

  for (const [nodeType, { config }] of Object.entries(configurations)) {
    for (const [field, value] of Object.entries(config)) {
      if (typeof value !== 'string') continue
      const refPattern = /\{\{(\w+)\.(\w+)\}\}/g
      let match
      let needsReplacement = false

      while ((match = refPattern.exec(value)) !== null) {
        const [fullMatch, refNode, refField] = match
        if (refNode === 'AI_FIELD') continue

        // Check if the referenced output field exists
        const refOutputs = outputsByType.get(refNode)
        // Also check 'trigger' alias
        const triggerOutputs = outputsByType.get('trigger') || (() => {
          for (const [t, s] of schemas) {
            if (s.isTrigger) return outputsByType.get(t)
          }
          return undefined
        })()

        const validOutputs = refNode === 'trigger' ? triggerOutputs : refOutputs
        if (validOutputs && !validOutputs.has(refField)) {
          logger.warn('[LLMPlanner] Invalid variable reference', { nodeType, field, ref: fullMatch })
          needsReplacement = true
        }
      }

      if (needsReplacement) {
        config[field] = `{{AI_FIELD:${field}}}`
      }
    }
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
