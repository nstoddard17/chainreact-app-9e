/**
 * Stream Workflow Helper Functions
 *
 * Extracted from stream-workflow/route.ts to reduce the route file size
 * and enable independent testing. Contains:
 * - Node configuration generation
 * - Test execution and preview building
 * - Clarification extraction
 * - Auto-mapping utilities
 * - Position calculation
 * - Formatting utilities
 */

import { logger } from '@/lib/utils/logger'
import { callLLMWithRetry, parseLLMJson } from '@/lib/ai/llm-retry'
import { AI_MODELS, selectModel } from '@/lib/ai/models'
import { getOpenAIClient } from '@/lib/ai/openai-client'
import { computeAutoMappingEntries, extractNodeOutputs, sanitizeAlias, applyAutoMappingSuggestions, type AutoMappingEntry } from '@/lib/workflows/autoMapping'

// ============================================================================
// PREREQUISITE CHECKING
// ============================================================================

export function buildPrerequisitePrompt({ prompt, availableNodes, connectedIntegrations }: any) {
  const triggerNodes = availableNodes.filter((n: any) => n.isTrigger)
  const actionNodes = availableNodes.filter((n: any) => !n.isTrigger)

  return `Analyze this workflow request and determine what apps and setup are required.

User Request: "${prompt}"

Available Trigger Apps: ${triggerNodes.map((n: any) => n.providerId).filter((p: string, i: number, arr: string[]) => arr.indexOf(p) === i).join(', ')}
Available Action Apps: ${actionNodes.map((n: any) => n.providerId).filter((p: string, i: number, arr: string[]) => arr.indexOf(p) === i).join(', ')}

Currently Connected Apps: ${connectedIntegrations.length > 0 ? connectedIntegrations.join(', ') : 'None'}

Analyze the request and return JSON:
{
  "requiredApps": ["app1", "app2"],
  "requiresSetup": true/false,
  "setupItems": [
    {
      "app": "google_sheets",
      "item": "spreadsheet",
      "description": "A Google Sheet to store the data"
    }
  ],
  "setupMessage": "Optional friendly message asking if they have the required setup"
}

Be precise - only include apps that are actually needed.`
}

export async function checkPrerequisites({
  prompt,
  availableNodes,
  connectedIntegrations,
}: any): Promise<{
  success: boolean
  requiredApps?: string[]
  requiresSetup?: boolean
  setupItems?: any[]
  setupMessage?: string
  error?: string
}> {
  try {
    const prerequisitePrompt = buildPrerequisitePrompt({ prompt, availableNodes, connectedIntegrations })

    const result = await callLLMWithRetry({
      messages: [{ role: 'user', content: prerequisitePrompt }],
      model: AI_MODELS.fast,
      temperature: 0.2,
      jsonMode: true,
      maxTokens: 500,
      maxRetries: 1,
      fallbackModel: null,
      label: 'Stream:prerequisites',
    })

    const parsed = parseLLMJson(result.content, 'Stream:prerequisites')
    return { success: true, ...parsed }
  } catch (error: any) {
    logger.error('[Stream:prerequisites] Failed', { error: error?.message })
    return { success: false, error: error?.message || 'Failed to check prerequisites' }
  }
}

// ============================================================================
// NODE CONFIGURATION
// ============================================================================

export function selectModelForTask({ taskType, nodeType, complexity, userPreference }: any) {
  if (userPreference !== 'auto') {
    return userPreference
  }

  // Only use GPT-4o for AI agents — everything else can use mini
  if (nodeType.includes('ai_agent')) {
    return AI_MODELS.planning
  }

  return AI_MODELS.fast
}

export function calculateComplexity(node: any): number {
  let complexity = 1
  if (node.type.includes('ai')) complexity += 5
  if (node.type.includes('filter') || node.type.includes('router')) complexity += 3
  if (node.description && node.description.length > 100) complexity += 2
  return Math.min(complexity, 10)
}

export async function generateNodeConfig({
  node,
  runtimeNode,
  nodeComponent,
  previousNodes,
  prompt,
  model,
  userId,
  clarifications = {},
  workflowData
}: any) {
  try {
    logger.info('[generateNodeConfig] Starting configuration', {
      nodeTitle: node.title,
      nodeType: nodeComponent.type,
      providerId: nodeComponent.providerId
    })

    const {
      fieldValues: clarificationFieldValues,
      displayOverrides,
      messageTemplate
    } = extractNodeClarifications(clarifications, nodeComponent)

    const clarificationEntries = Object.entries(clarificationFieldValues)
    if (nodeComponent.type === 'slack_action_send_message') {
      logger.info('[generateNodeConfig] Slack clarifications captured', {
        clarificationFieldValues,
        clarificationEntries
      })
    }

    let clarificationContext = ''
    if (clarificationEntries.length > 0 || messageTemplate) {
      const clarificationLines: string[] = []

      clarificationEntries.forEach(([fieldName, value]) => {
        if (fieldName === 'keywords') {
          clarificationLines.push(`- Search both subject AND body for keywords: ${value} (USER SPECIFIED - DO NOT CHANGE)`)
          return
        }
        if (Array.isArray(value)) {
          clarificationLines.push(`- Field "${fieldName}": Match ANY of these values: ${value.join(', ')} (USER SELECTED - DO NOT CHANGE)`)
        } else {
          clarificationLines.push(`- Field "${fieldName}": ${value} (USER SELECTED - DO NOT CHANGE)`)
        }
      })

      if (messageTemplate && (nodeComponent.providerId === 'slack' || nodeComponent.providerId === 'discord' || nodeComponent.type.includes('message') || nodeComponent.type.includes('send'))) {
        clarificationLines.push(`- Field "message" or "text": Use this template:\n${messageTemplate}\n(AI PROVIDED TEMPLATE - USE AS-IS)`)
      }

      if (clarificationLines.length > 0) {
        clarificationContext = [
          '',
          'USER PROVIDED CLARIFICATIONS (CRITICAL - USE EXACT VALUES):',
          clarificationLines.join('\n'),
          '',
          'CRITICAL INSTRUCTIONS:',
          '1. Use the EXACT values above for the corresponding fields',
          '2. Do NOT use placeholders or example values',
          '3. Variable syntax like {{trigger.from}} should be preserved exactly as shown'
        ].join('\n')
      }
    }

    // Auto-mapping entries
    const autoMappingEntries =
      runtimeNode && workflowData
        ? computeAutoMappingEntries({
            workflowData,
            currentNodeId: runtimeNode.id,
            configSchema: Array.isArray(nodeComponent?.configSchema) ? nodeComponent.configSchema : [],
            currentConfig: runtimeNode?.data?.config || {}
          })
        : []

    // Check if we can skip AI call
    const hasAllRequiredFields = (() => {
      if (nodeComponent.isTrigger) {
        return true
      }
      if (nodeComponent.type === 'slack_action_send_message') {
        const hasChannel = clarificationFieldValues.channel || clarificationFieldValues.channelId || clarificationFieldValues.slack_channel
        const hasMessage = messageTemplate || clarificationFieldValues.message
        const hasAutoMessage = autoMappingEntries.some((entry: AutoMappingEntry) => entry.fieldKey === 'message')
        const hasAutoChannel = autoMappingEntries.some((entry: AutoMappingEntry) => entry.fieldKey === 'channel')
        if ((hasChannel || hasAutoChannel) && (hasMessage || hasAutoMessage)) {
          return true
        }
      }
      return false
    })()

    let result: any

    if (hasAllRequiredFields) {
      result = {
        success: true,
        config: {},
        reasoning: 'Configuration built from user clarifications'
      }
    } else {
      const context = previousNodes.map((n: any) => ({
        title: n.data.title,
        type: n.data.type,
        outputs: getNodeOutputs(n)
      }))
      const formattedContext = formatNodeContextForPrompt(context)

      const simplifiedSchema = nodeComponent.configSchema?.map((field: any) => ({
        name: field.name,
        label: field.label,
        type: field.type,
        required: field.required || false,
        ...(field.options ? { options: field.options } : {}),
        ...(field.defaultValue !== undefined ? { defaultValue: field.defaultValue } : {})
      })) || []

      const autoMappingPromptSection = buildAutoMappingPrompt(autoMappingEntries)

      const configPrompt = `Generate configuration for a ${node.title} node in a workflow automation.

Node Type: ${node.type}
Node Description: ${node.description}
User's Original Goal: "${prompt}"

Previous Nodes in Workflow:
${formattedContext}

Configuration Fields: ${JSON.stringify(simplifiedSchema, null, 2)}
${autoMappingPromptSection ? `${autoMappingPromptSection}\n` : ''}${clarificationContext}

Generate a complete configuration that:
- Uses variables from previous nodes when appropriate (e.g., {{trigger.email}})
- Fills all required fields
- Uses sensible defaults for optional fields
- Matches the user's goal
${autoMappingEntries.length ? '- When a field is blank, prefer one of the AUTO-MAPPING SUGGESTIONS tokens shown above' : ''}${clarificationContext ? '\n- CRITICAL: Use the exact values from USER PROVIDED CLARIFICATIONS above - these are not suggestions, they are required values the user has specified' : ''}

Return JSON:
{
  "config": { /* configuration object matching schema */ },
  "reasoning": "Brief explanation of choices made"
}`

      try {
        const llmResult = await callLLMWithRetry({
          messages: [{ role: 'user', content: configPrompt }],
          model,
          temperature: 0.3,
          jsonMode: true,
          maxTokens: 2000,
          maxRetries: 1,
          fallbackModel: AI_MODELS.fast,
          label: 'Stream:nodeConfig',
        })

        const parsed = parseLLMJson(llmResult.content, 'Stream:nodeConfig')
        result = { success: true, ...parsed }
      } catch (err: any) {
        result = { success: false, error: err.message }
      }
    }

    if (!result.config) {
      result.config = {}
    }

    // Unwrap nested config containers
    const unwrappedConfig = unwrapAIConfig(result.config, nodeComponent.type)
    if (unwrappedConfig && typeof unwrappedConfig === 'object' && !Array.isArray(unwrappedConfig)) {
      result.config = { ...unwrappedConfig }
    }

    // Force-apply clarification values
    if (clarificationEntries.length > 0) {
      clarificationEntries.forEach(([fieldName, value]) => {
        if (fieldName && value !== undefined && value !== null && !(Array.isArray(value) && value.length === 0)) {
          result.config[fieldName] = value
        }
      })
    }

    // Provider-specific normalization (Gmail)
    if (nodeComponent.type === 'gmail_trigger_new_email') {
      applyGmailNormalization(result, clarificationFieldValues, displayOverrides)
    }

    // Provider-specific normalization (Slack)
    if (nodeComponent.type === 'slack_action_send_message') {
      applySlackNormalization(result, clarificationFieldValues, displayOverrides, messageTemplate, autoMappingEntries)
    }

    // Force-apply message template for other messaging providers
    if (messageTemplate && nodeComponent.providerId && ['discord'].includes(nodeComponent.providerId)) {
      if (!result.config.message || result.config.message === '' || result.config.message === 'Empty') {
        result.config.message = messageTemplate
      }
      if (!displayOverrides.message) {
        const condensedTemplate = String(result.config.message).replace(/\s+/g, ' ').trim()
        displayOverrides.message = condensedTemplate.length > 80
          ? `${condensedTemplate.slice(0, 77)}...`
          : condensedTemplate || 'Auto-generated message template'
      }
    }

    // Normalize to schema field names
    const normalizedConfig = sanitizeConfigForNode(result.config, nodeComponent)
    result.config = { ...normalizedConfig }

    // Re-apply clarification overrides after normalization
    if (clarificationEntries.length > 0) {
      clarificationEntries.forEach(([fieldName, value]) => {
        if (fieldName && value !== undefined && value !== null && !(Array.isArray(value) && value.length === 0)) {
          result.config[fieldName] = value
        }
      })
    }

    result.config = sanitizeConfigForNode(result.config, nodeComponent)

    return {
      ...result,
      displayOverrides,
      autoMappingEntries
    }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function generateNodeConfigFix({
  node,
  nodeComponent,
  previousConfig,
  error,
  errorDetails,
  previousNodes,
  prompt,
  model = AI_MODELS.fast,
  userId
}: any): Promise<{ success: boolean; config?: Record<string, any>; reasoning?: string; error?: string }> {
  try {
    const simplifiedSchema = nodeComponent.configSchema?.map((field: any) => ({
      name: field.name,
      type: field.type,
      required: field.required || false
    })) || []

    const systemPrompt = `You are fixing a configuration error in a workflow node.

Node: ${node.title} (${node.type})
Current Configuration: ${JSON.stringify(previousConfig, null, 2)}
Error: ${error}
Error Details: ${errorDetails || 'None provided'}

Available fields:
${JSON.stringify(simplifiedSchema, null, 2)}

Previous nodes in workflow that you can reference:
${previousNodes.map((n: any) => `- ${n.data.title} (outputs: ${JSON.stringify(n.data.outputSchema || [])})`).join('\n')}

Analyze the error and provide a CORRECTED configuration that fixes the issue. Return ONLY the fields that need to be changed to fix the error.`

    const userPrompt = `Fix this error: "${error}"

The user's original request was: "${prompt}"

Provide the minimal configuration changes needed to fix this error.`

    const result = await callLLMWithRetry({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      model: model.startsWith('gpt') ? model : AI_MODELS.fast,
      temperature: 0.3,
      maxTokens: 1000,
      jsonMode: true,
      maxRetries: 1,
      fallbackModel: null,
      label: 'Stream:configFix',
    })

    const parsed = parseLLMJson(result.content, 'Stream:configFix')
    const fixedConfig = { ...previousConfig, ...parsed.config }

    return {
      success: true,
      config: fixedConfig,
      reasoning: parsed.reasoning || 'Applied automatic fix based on error analysis'
    }
  } catch (error: any) {
    logger.error('Failed to generate config fix:', error)
    return {
      success: false,
      error: error.message || 'Failed to generate fix'
    }
  }
}

// ============================================================================
// FORMAT TRANSFORMER AUGMENTATION
// ============================================================================

const HTML_CONTENT_SOURCE_TYPES = new Set([
  'gmail_trigger_new_email',
  'gmail_action_search_email',
  'gmail_action_read_email',
  'gmail_action_fetch_message',
  'microsoft-outlook_trigger_new_email',
  'microsoft-outlook_action_fetch_emails'
])

export function augmentPlanWithFormatTransformers(plan: any) {
  if (!plan || !Array.isArray(plan.nodes)) {
    return plan
  }

  const augmentedNodes: any[] = []
  let insertedCount = 0

  for (const node of plan.nodes) {
    const previousNode = augmentedNodes[augmentedNodes.length - 1]
    if (shouldInsertFormatTransformer(previousNode, node)) {
      augmentedNodes.push(createFormatTransformerPlanNode(previousNode))
      insertedCount += 1
    }
    augmentedNodes.push(node)
  }

  if (insertedCount > 0) {
    logger.info('[STREAM] Auto-inserted Format Transformer nodes', { insertedCount })
  }

  return { ...plan, nodes: augmentedNodes }
}

function shouldInsertFormatTransformer(previousNode: any, currentNode: any): boolean {
  if (!currentNode || currentNode.type !== 'slack_action_send_message') return false
  if (!previousNode || previousNode.type === 'format_transformer') return false
  return HTML_CONTENT_SOURCE_TYPES.has(previousNode.type)
}

function createFormatTransformerPlanNode(prevNode: any) {
  const prevTitle = prevNode?.title || 'previous node'
  return {
    type: 'format_transformer',
    title: 'Format Transformer',
    description: `Convert ${prevTitle} output into Slack-friendly formatting.`,
    providerId: 'utility',
    note: 'Auto-added to convert HTML emails into Slack-friendly formatting. Delete it if you prefer the raw content.'
  }
}

// ============================================================================
// TEST EXECUTION
// ============================================================================

export async function testNode({ node, previousNodes, userId, supabase, userPrompt, workflowContext }: any) {
  try {
    const config = node?.data?.config || {}
    const isTrigger = Boolean(node?.data?.isTrigger)

    const { generateContextualMockData } = await import('@/lib/workflows/testing/generateContextualMockData')

    const previousNodeOutput = previousNodes?.length > 0
      ? previousNodes[previousNodes.length - 1].testData
      : null

    const mockData = await generateContextualMockData({
      nodeType: node.data.type,
      nodeTitle: node.data.title,
      providerId: node.data.providerId,
      userPrompt,
      previousNodeOutput,
      workflowContext,
      nodeConfig: config
    })

    const preview = buildTestPreview({ node, config, previousNodes, mockData })
    const summary = buildTestSummary({ node, preview, config, isTrigger })
    node.testData = mockData

    return { success: true, preview, summary, canContinue: true }
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      summary: 'Testing failed unexpectedly. Adjust the configuration or try again.',
      canContinue: true
    }
  }
}

// ============================================================================
// POSITION CALCULATION
// ============================================================================

export function calculateNodePosition(index: number, existingNodes: any[], viewport: any = null) {
  const NODE_WIDTH = 450
  const BASE_PADDING = 80
  const HORIZONTAL_GAP = 130

  const zoom = viewport?.defaultZoom || 1
  const chatPanelWidth = viewport?.chatPanelWidth || 0
  const adjustedPanelOffset = chatPanelWidth ? chatPanelWidth / zoom : 0
  const startX = BASE_PADDING + adjustedPanelOffset

  const x = startX + index * (NODE_WIDTH + HORIZONTAL_GAP)
  const y = BASE_PADDING

  return { x, y }
}

// ============================================================================
// CONFIG BUILDING & FALLBACK
// ============================================================================

export function buildConfigWithFallback({ nodeComponent, initialConfig, plannedNode, prompt }: any) {
  const schemaFields = nodeComponent?.configSchema || []
  const finalConfig: Record<string, any> = { ...(initialConfig || {}) }
  const fallbackFields: string[] = []

  for (const field of schemaFields) {
    const currentValue = finalConfig[field.name]
    const hasValue = currentValue !== undefined && currentValue !== null && currentValue !== ''

    if (hasValue || !field.required) continue

    const fallbackValue = deriveFallbackValue(field, { plannedNode, prompt })
    if (fallbackValue !== undefined) {
      finalConfig[field.name] = fallbackValue
      fallbackFields.push(field.name)
    }
  }

  const usedFallback = fallbackFields.length > 0
  const reasoning = usedFallback
    ? `Auto-filled ${fallbackFields.length} field${fallbackFields.length === 1 ? '' : 's'} using safe defaults. Review these values to tailor the automation.`
    : ''

  return { finalConfig, fallbackFields, reasoning, usedFallback }
}

export function isEmptyFieldValue(value: any): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value.trim().length === 0
  if (Array.isArray(value)) return value.length === 0
  return false
}

// ============================================================================
// FORMATTING UTILITIES
// ============================================================================

export function formatFieldName(fieldKey: string): string {
  const upperCaseWords = ['id', 'ids', 'url', 'api', 'html', 'css', 'js', 'sql', 'crm']

  const words = fieldKey
    .replace(/([A-Z])/g, ' $1')
    .split(/[_\s]+/)
    .filter(word => word.length > 0)

  return words.map(word => {
    const lower = word.toLowerCase()
    if (upperCaseWords.includes(lower)) return lower.toUpperCase()
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  }).join(' ')
}

export function formatFieldValue(value: any): string {
  if (value === null || value === undefined) return 'None'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'string') {
    if (value.length > 60) return `"${value.substring(0, 60)}..."`
    return `"${value}"`
  }
  if (typeof value === 'number') return value.toString()
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    if (value.length === 1) return `[${formatFieldValue(value[0])}]`
    return `[${value.length} items]`
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value)
    if (keys.length === 0) return '{}'
    if (keys.length <= 2) return `{${keys.join(', ')}}`
    return `{${keys.length} fields}`
  }
  return JSON.stringify(value).substring(0, 60)
}

// ============================================================================
// AUTO-MAPPING
// ============================================================================

export type AutoMappingTelemetry = {
  suggested: number
  applied: number
  ignored: number
  fields: {
    key: string
    label: string
    suggested: string
    actual: any
    applied: boolean
  }[]
} | null

export function buildAutoMappingTelemetry({
  entries,
  finalConfig
}: {
  entries?: AutoMappingEntry[]
  finalConfig: Record<string, any> | undefined
}): AutoMappingTelemetry {
  if (!entries || entries.length === 0) return null

  const config = finalConfig || {}
  let appliedCount = 0
  const fields = entries.map((entry) => {
    const actualValue = config[entry.fieldKey]
    const normalizedActual = actualValue === undefined || actualValue === null ? '' : String(actualValue).trim()
    const isApplied = normalizedActual === entry.value
    if (isApplied) appliedCount += 1
    return {
      key: entry.fieldKey,
      label: entry.fieldLabel,
      suggested: entry.value,
      actual: actualValue ?? null,
      applied: isApplied
    }
  })

  return { suggested: entries.length, applied: appliedCount, ignored: entries.length - appliedCount, fields }
}

export function filterAutoMappingEntriesForNode(nodeComponent: any, entries?: AutoMappingEntry[]): AutoMappingEntry[] | undefined {
  if (!entries || entries.length === 0) return entries
  if (nodeComponent?.type !== 'slack_action_send_message') return entries
  const allowed = new Set(['channel', 'message', 'attachments'])
  return entries.filter(entry => allowed.has(entry.fieldKey))
}

// ============================================================================
// LOGGING
// ============================================================================

export function logManualVerificationChecklist({
  createdNodes,
  workflowPrompt,
  clarificationsSummary,
  connectedIntegrations
}: {
  createdNodes: any[]
  workflowPrompt: string
  clarificationsSummary: number
  connectedIntegrations: string[]
}) {
  const nodes = createdNodes.map((node) => ({
    id: node.id,
    title: node.data?.title,
    status: node.data?.aiStatus,
    testStatus: node.data?.executionStatus || (node.data?.isTrigger ? 'skipped' : 'pending'),
    autoMapping: node.data?.autoMappingTelemetry || null
  }))

  const checklist = [
    'Confirm each node configuration shows the same suggested tokens as listed above (autoMapping.applied).',
    'Verify the SSE `node_configured` events contained `autoMappingTelemetry` and that applied > 0 when suggestions existed.',
    'Open the builder UI and ensure Data Inspector / auto-fill show identical tokens to the server summary.',
    'If a node was tested, validate the test preview matches expectations; for triggers ensure skip messaging appears.',
    'Report any nodes with `status !== "ready"` or tests that did not run.'
  ]

  logger.info('[MANUAL QA CHECKLIST] React agent verification summary', {
    workflowPrompt,
    connectedIntegrations,
    clarificationsFields: clarificationsSummary,
    nodeCount: nodes.length,
    nodes,
    checklist
  })
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function extractNodeClarifications(clarifications: any, nodeComponent: any) {
  const fieldValues: Record<string, any> = {}
  const displayOverrides: Record<string, string> = {}

  const allowedFields = new Set(
    Array.isArray(nodeComponent?.configSchema)
      ? nodeComponent.configSchema
          .map((field: any) => field?.name)
          .filter((name: any): name is string => typeof name === 'string' && name.length > 0)
      : []
  )

  const addFieldValue = (rawField: string, value: any, display?: string) => {
    if (!rawField) return

    let fieldName = rawField
    if (fieldName === 'sender') fieldName = 'from'
    if (fieldName === 'channel_id' || fieldName === 'slack_channel') fieldName = 'channel'

    if (allowedFields.size > 0 && !allowedFields.has(fieldName)) return

    let processedValue = value
    if (Array.isArray(processedValue) && processedValue.length === 0) return
    if (typeof processedValue === 'string') {
      const trimmed = processedValue.trim()
      if (!trimmed) return
      processedValue = trimmed
    }

    fieldValues[fieldName] = processedValue
    if (display && !displayOverrides[fieldName]) {
      displayOverrides[fieldName] = display
    }
  }

  const providerId = nodeComponent?.providerId
  const nodeType = nodeComponent?.type

  if (Array.isArray(clarifications?.details)) {
    for (const detail of clarifications.details) {
      if (!detail) continue

      const detailNodeType = detail.nodeType
      const detailProvider = detail.providerId
      const questionId = detail.questionId

      const matchesNode =
        (detailNodeType && detailNodeType === nodeType) ||
        (detailProvider && providerId && detailProvider === providerId) ||
        (questionId && typeof questionId === 'string' && (
          (providerId && questionId.includes(providerId)) ||
          (nodeType && questionId.includes(nodeType))
        )) ||
        (detailNodeType && providerId && typeof detailNodeType === 'string' && detailNodeType.includes(providerId))

      if (!matchesNode) continue

      let fieldName = detail.configField

      if (!fieldName && typeof questionId === 'string') {
        const match = questionId.match(/_(channel|channel_id|from|subject|to|body|message|sender|keywords)(?:_filter)?$/)
        if (match) fieldName = match[1]
      }

      if (!fieldName && typeof detailNodeType === 'string') {
        const match = detailNodeType.match(/_(channel|channel_id|from|subject|to|body|message|sender|keywords)(?:_filter)?$/)
        if (match) fieldName = match[1]
      }

      if (!fieldName && typeof questionId === 'string') {
        fieldName = questionId
      }

      if (!fieldName) continue

      addFieldValue(fieldName, detail.value, detail.displayValue)
    }
  }

  const legacySource = clarifications?.answers && typeof clarifications.answers === 'object'
    ? clarifications.answers
    : clarifications

  if (legacySource && typeof legacySource === 'object') {
    for (const [key, value] of Object.entries(legacySource)) {
      if (['answers', 'details', 'displayMap', 'inferredData', 'reasoning', 'message_template', 'email_source'].includes(key)) {
        continue
      }

      const matchesProvider = providerId && key.includes(providerId)
      const matchesType = nodeType && key.includes(nodeType)
      const matchesEmail = key.includes('email') && providerId === 'gmail'

      if (!matchesProvider && !matchesType && !matchesEmail) continue

      addFieldValue(key, value, clarifications?.displayMap?.[key])
    }
  }

  if (clarifications?.displayMap && typeof clarifications.displayMap === 'object') {
    for (const [key, display] of Object.entries(clarifications.displayMap)) {
      if (typeof display !== 'string' || !display) continue
      const match = key.match(/_(channel|channel_id|from|subject|to|body|message|sender|keywords)(?:_filter)?$/)
      if (!match) continue
      let fieldName = match[1]
      if (fieldName === 'sender') fieldName = 'from'
      if (fieldName === 'channel_id' || fieldName === 'slack_channel') fieldName = 'channel'
      if (allowedFields.size === 0 || allowedFields.has(fieldName)) {
        if (!displayOverrides[fieldName]) {
          displayOverrides[fieldName] = display
        }
      }
    }
  }

  const messageTemplate =
    clarifications?.message_template ||
    clarifications?.inferredData?.message_template

  return { fieldValues, displayOverrides, messageTemplate }
}

function normalizeFieldKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function unwrapAIConfig(rawConfig: any, nodeType: string, depth = 0): any {
  if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) return rawConfig
  if (depth > 4) return rawConfig

  const keys = Object.keys(rawConfig)
  if (keys.length !== 1) return rawConfig

  const key = keys[0]
  const value = rawConfig[key]
  if (!value || typeof value !== 'object' || Array.isArray(value)) return rawConfig

  const normalizedKey = key.toLowerCase()
  const unwrapKeys = ['config', 'data', 'fields', 'payload', 'settings', 'parameters', 'params', 'request', 'trigger', 'action', nodeType.toLowerCase()]

  if (!unwrapKeys.includes(normalizedKey)) return rawConfig
  return unwrapAIConfig(value, nodeType, depth + 1)
}

export function sanitizeConfigForNode(config: Record<string, any> | undefined, nodeComponent: any) {
  if (!config || typeof config !== 'object') return {}

  const schemaFields = Array.isArray(nodeComponent?.configSchema) ? nodeComponent.configSchema : []

  const normalizationMap = new Map<string, string>()
  schemaFields.forEach((field: any) => {
    if (field?.name) normalizationMap.set(normalizeFieldKey(field.name), field.name)
  })

  if (normalizationMap.size === 0) return { ...config }

  const sanitized: Record<string, any> = {}
  for (const [rawKey, value] of Object.entries(config)) {
    if (value === undefined || value === null) continue
    const normalizedKey = normalizationMap.get(normalizeFieldKey(rawKey))
    if (normalizedKey) {
      sanitized[normalizedKey] = value
    }
  }

  return sanitized
}

type NodeOutputFieldSummary = { name: string; label: string; type: string; token: string }
type NodeOutputSummary = { alias: string; fields: NodeOutputFieldSummary[]; tokens: string[] }

function getNodeOutputs(node: any): NodeOutputSummary {
  const alias = sanitizeAlias(
    (node?.data?.isTrigger && 'trigger') ||
    node?.data?.label || node?.data?.title || node?.data?.type || node?.id
  )

  const schema = extractNodeOutputs(node)
  if (!Array.isArray(schema) || schema.length === 0) {
    const tokens = [`{{${alias}.output}}`]
    if (node?.data?.isTrigger) tokens.push('{{trigger.data}}', '{{trigger.timestamp}}')
    return { alias, fields: [], tokens }
  }

  const fields: NodeOutputFieldSummary[] = schema
    .filter((field: any) => field?.name)
    .map((field: any) => ({
      name: field.name,
      label: field.label || field.name,
      type: field.type || 'string',
      token: `{{${alias}.${field.name}}}`
    }))

  const tokens = fields.map(field => field.token)
  if (node?.data?.isTrigger) tokens.push('{{trigger.data}}', '{{trigger.timestamp}}')

  return { alias, fields, tokens }
}

function formatNodeContextForPrompt(
  contextEntries: { title: string; type: string; outputs: NodeOutputSummary }[]
): string {
  if (!contextEntries || contextEntries.length === 0) {
    return '- None yet (this is the first node in the workflow)'
  }

  return contextEntries
    .map((entry) => {
      const lines = [`- ${entry.title} (${entry.type}) alias: ${entry.outputs.alias}`]
      if (entry.outputs.fields.length > 0) {
        lines.push('  Outputs:')
        entry.outputs.fields.forEach((field) => {
          const labelPart = field.label && field.label !== field.name ? `, label: ${field.label}` : ''
          lines.push(`    - ${field.name} [type: ${field.type}${labelPart}] -> ${field.token}`)
        })
      } else {
        lines.push(`  Outputs: ${entry.outputs.tokens.join(', ')}`)
      }
      return lines.join('\n')
    })
    .join('\n')
}

function buildAutoMappingPrompt(entries: AutoMappingEntry[]): string {
  if (!entries || entries.length === 0) return ''
  const lines = entries.map((entry) => `- ${entry.fieldLabel} (${entry.fieldKey}): ${entry.value}`)
  return ['AUTO-MAPPING SUGGESTIONS (prefer these upstream tokens for blank fields):', ...lines].join('\n')
}

function buildTestPreview({ node, config, previousNodes, mockData }: any) {
  const timestamp = new Date().toISOString()
  const normalizedConfig = Object.entries(config || {}).reduce((acc: Record<string, any>, [key, value]) => {
    acc[key] = value
    return acc
  }, {})

  if (node?.data?.isTrigger) {
    return {
      eventSource: node.data.title,
      sampleTimestamp: timestamp,
      samplePayloadSummary: `Mock event generated for ${node.data.title}`,
      capturedFields: mockData ? Object.keys(mockData).slice(0, 5) : ['id', 'type', 'timestamp'],
      sampleData: mockData || {
        id: `${node.id}-sample`,
        type: 'event',
        preview: 'This is representative data provided for review.',
        created_at: timestamp
      }
    }
  }

  const upstream = previousNodes && previousNodes.length > 0 ? previousNodes[previousNodes.length - 1] : null

  if (mockData) {
    const previewData = typeof mockData === 'object' && !Array.isArray(mockData)
      ? Object.fromEntries(Object.entries(mockData).slice(0, 5))
      : mockData

    return {
      runTimestamp: timestamp,
      upstreamSource: upstream ? upstream.data?.title : null,
      outputPreview: `Processed data from ${node.data?.title}`,
      configuredFields: normalizedConfig,
      testOutput: previewData,
      result: { status: 'success', notes: 'Test executed with contextual mock data' }
    }
  }

  return {
    runTimestamp: timestamp,
    upstreamSource: upstream ? upstream.data?.title : null,
    outputPreview: `Example output produced for ${node.data?.title}`,
    configuredFields: normalizedConfig,
    result: { status: 'success', notes: 'Mock execution completed with the provided configuration.' }
  }
}

function buildTestSummary({ node, preview, config, isTrigger }: any) {
  if (isTrigger) {
    return `Mock data generated to illustrate how ${node.data?.title || 'this trigger'} will fire. Review the sample payload to validate the fields the workflow will receive.`
  }
  const configuredCount = Object.keys(config || {}).length
  const fieldDescriptor = configuredCount > 0 ? `${configuredCount} configured field${configuredCount === 1 ? '' : 's'}` : 'the default settings'
  return `The node successfully executed using ${fieldDescriptor} and produced a representative preview. Adjust anything above if you'd like the automation to behave differently.`
}

function deriveFallbackValue(field: any, _context: any) {
  if (!field) return undefined
  if (field.dynamic) return undefined
  if (field.defaultValue !== undefined) {
    return field.multiple ? ([] as any[]).concat(field.defaultValue) : field.defaultValue
  }

  const options = Array.isArray(field.options)
    ? field.options
    : Array.isArray(field.defaultOptions)
      ? field.defaultOptions
      : []

  if (field.multiple || field.type === 'multi-select') {
    if (options.length > 0) {
      const optionValue = typeof options[0] === 'string' ? options[0] : options[0]?.value
      return optionValue ? [optionValue] : []
    }
    return []
  }

  if ((field.type === 'select' || field.type === 'combobox') && options.length > 0) {
    if (!field.required) return undefined
    return typeof options[0] === 'string' ? options[0] : options[0]?.value
  }

  if (field.type === 'boolean') return false
  if (field.type === 'number') return 0
  if (field.type === 'email' || field.type === 'email-autocomplete') {
    if (!field.required) return undefined
    return 'inbox@placeholder.com'
  }
  if (field.type === 'date') return new Date().toISOString().split('T')[0]
  if (field.type === 'datetime' || field.type === 'time') return new Date().toISOString()
  if (field.type === 'array' || field.type === 'json') return []
  if (field.type === 'text' || field.type === 'textarea' || typeof field.type === 'string') {
    if (!field.required) return undefined
    if (field.placeholder) return field.placeholder
    const label = field.label || field.name
    return `Auto-generated ${label.toLowerCase()}`
  }

  return undefined
}

// Provider-specific normalization helpers

function applyGmailNormalization(result: any, clarificationFieldValues: Record<string, any>, displayOverrides: Record<string, string>) {
  const clarificationFrom = clarificationFieldValues.from
  if (clarificationFrom) {
    result.config.from = Array.isArray(clarificationFrom) ? clarificationFrom.join(', ') : clarificationFrom
  }

  const providedLabelIds = result.config.labelIds || result.config.label_ids
  if (Array.isArray(providedLabelIds) && providedLabelIds.length > 0) {
    result.config.labelIds = providedLabelIds
    const labelDisplay = providedLabelIds
      .map((label: string) => {
        if (!label || typeof label !== 'string') return ''
        if (label.toUpperCase() === 'INBOX') return 'Inbox'
        if (label.toUpperCase() === 'SENT') return 'Sent'
        if (label.toUpperCase() === 'SPAM') return 'Spam'
        if (label.toUpperCase() === 'TRASH') return 'Trash'
        if (label.toUpperCase() === 'DRAFT') return 'Drafts'
        return label
      })
      .filter(Boolean)
      .join(', ')
    if (labelDisplay && !displayOverrides.labelIds) {
      displayOverrides.labelIds = labelDisplay
    }
  }
  if (!Array.isArray(result.config.labelIds) || result.config.labelIds.length === 0) {
    result.config.labelIds = ['INBOX']
    if (!displayOverrides.labelIds) displayOverrides.labelIds = 'Inbox'
  }

  delete result.config.label_ids
  delete result.config.user_id
  delete result.config.type
  delete result.config.include_spam_trash
  delete result.config.fetch_body
  delete result.config.fetch_attachments
  delete result.config.search_query
}

function applySlackNormalization(
  result: any,
  clarificationFieldValues: Record<string, any>,
  displayOverrides: Record<string, string>,
  messageTemplate: string | undefined,
  autoMappingEntries: AutoMappingEntry[]
) {
  const channelClarification =
    clarificationFieldValues.channel ??
    clarificationFieldValues.channelId ??
    clarificationFieldValues.slack_channel

  const aiChannelCandidate = typeof result.config.channel === 'string'
    ? result.config.channel
    : typeof result.config.channel_id === 'string'
      ? result.config.channel_id
      : undefined

  const resolvedChannel = (() => {
    if (channelClarification) {
      return Array.isArray(channelClarification) ? channelClarification[0] : channelClarification
    }
    if (aiChannelCandidate && aiChannelCandidate.trim().length > 0) return aiChannelCandidate.trim()
    return undefined
  })()

  const attachmentFallback = (() => {
    if (Array.isArray(result.config.attachments) && result.config.attachments.length > 0) {
      const attachment = result.config.attachments.find((att: any) => att && typeof att === 'object')
      if (!attachment) return undefined
      if (typeof attachment.text === 'string' && attachment.text.trim().length > 0) return attachment.text
      if (typeof attachment.fallback === 'string' && attachment.fallback.trim().length > 0) return attachment.fallback
    }
    if (typeof result.config.attachments === 'string' && result.config.attachments.trim().length > 0) {
      return result.config.attachments.trim()
    }
    return undefined
  })()

  const aiMessageCandidate = (() => {
    if (typeof result.config.message === 'string' && result.config.message.trim().length > 0) return result.config.message.trim()
    if (typeof result.config.text === 'string' && result.config.text.trim().length > 0) return result.config.text.trim()
    if (typeof attachmentFallback === 'string') return attachmentFallback
    if (typeof messageTemplate === 'string' && messageTemplate.trim().length > 0) return messageTemplate.trim()
    return undefined
  })()

  const slackConfig: Record<string, any> = {}
  const existingChannelDisplay = displayOverrides.channel

  if (resolvedChannel && resolvedChannel !== 'Select a channel') {
    slackConfig.channel = resolvedChannel
    if (!existingChannelDisplay) displayOverrides.channel = resolvedChannel
  }
  if (aiMessageCandidate) slackConfig.message = aiMessageCandidate

  if (!slackConfig.message || slackConfig.message.trim().length === 0) {
    const fallbackTemplate = (typeof messageTemplate === 'string' && messageTemplate.trim().length > 0)
      ? messageTemplate.trim()
      : `📧 New email from {{trigger.data.from}}\nSubject: {{trigger.data.subject}}\n\n{{trigger.data.body}}`
    slackConfig.message = fallbackTemplate
  }

  result.config = slackConfig

  if (aiMessageCandidate) {
    const condensedTemplate = aiMessageCandidate.replace(/\s+/g, ' ').trim()
    if (!displayOverrides.message) {
      displayOverrides.message = condensedTemplate.length > 80
        ? `${condensedTemplate.slice(0, 77)}...`
        : condensedTemplate || 'Auto-generated message template'
    }
  } else if (result.config.message) {
    const condensedTemplate = String(result.config.message).replace(/\s+/g, ' ').trim()
    displayOverrides.message = condensedTemplate.length > 80
      ? `${condensedTemplate.slice(0, 77)}...`
      : condensedTemplate || 'Auto-generated message template'
  }
}

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
