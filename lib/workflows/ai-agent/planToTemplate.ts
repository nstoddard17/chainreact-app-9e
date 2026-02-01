/**
 * Convert planner output to template format
 *
 * This utility transforms the planner's Edit[] output into the format expected
 * by the templates system, stripping user-specific configuration while preserving
 * AI-generated content (messages, prompts, etc.) that define the workflow structure.
 */

import type { Edit, PlannerResult } from "@/src/lib/workflows/builder/agent/planner"
import type { Node, Edge } from "@/src/lib/workflows/builder/schema"
import { createHash } from "crypto"

// Fields that should be preserved in templates (AI-generated content)
const PRESERVE_FIELDS = new Set([
  // Message/content fields
  'message',
  'content',
  'body',
  'text',
  'prompt',
  'systemPrompt',
  'userPrompt',
  // Subject/title fields
  'subject',
  'title',
  'name',
  // Format/type fields (static configuration)
  'targetFormat',
  'sourceFormat',
  'format',
  'type',
  'method',
  // Boolean flags
  'includeHtml',
  'includeAttachments',
  // Static labels
  'labels',
])

// Fields that should NEVER be saved in templates (user-specific)
const STRIP_FIELDS = new Set([
  // Dynamic IDs that require user selection
  'connectionId',
  'integrationId',
  'accountId',
  'userId',
  'teamId',
  'workspaceId',
  // Resource IDs
  'channelId',
  'channel',
  'databaseId',
  'database',
  'pageId',
  'page',
  'baseId',
  'base',
  'tableId',
  'table',
  'spreadsheetId',
  'spreadsheet',
  'sheetId',
  'sheet',
  'folderId',
  'folder',
  'boardId',
  'board',
  'listId',
  'list',
  // API keys and secrets
  'apiKey',
  'secretKey',
  'accessToken',
  'refreshToken',
  'webhookUrl',
  // Email addresses (unless it's a template variable)
  'to',
  'from',
  'cc',
  'bcc',
  'recipients',
])

export interface TemplateNode {
  id: string
  type: 'custom' // React Flow requires type: 'custom'
  position: { x: number; y: number }
  data: {
    type: string // Actual node type (e.g., 'gmail_trigger_new_email')
    label: string
    description?: string
    config: Record<string, any>
    isTrigger?: boolean
    providerId?: string
    previewFields?: Array<{
      name: string
      label: string
      type: string
      example?: string
    }>
  }
}

export interface TemplateConnection {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

export interface TemplateData {
  name: string
  description: string
  category: string
  tags: string[]
  nodes: TemplateNode[]
  connections: TemplateConnection[]
  integrations: string[] // Required integrations
  promptHash: string // Hash of original prompt for deduplication
}

/**
 * Strip user-specific fields from node config while preserving AI-generated content
 */
function stripConfig(config: Record<string, any>): Record<string, any> {
  const stripped: Record<string, any> = {}

  for (const [key, value] of Object.entries(config)) {
    // Skip fields that should never be saved
    if (STRIP_FIELDS.has(key)) {
      continue
    }

    // Skip null/undefined values
    if (value === null || value === undefined) {
      continue
    }

    // Skip empty strings
    if (typeof value === 'string' && value.trim() === '') {
      continue
    }

    // Keep fields that should be preserved
    if (PRESERVE_FIELDS.has(key)) {
      // But check if it contains only template variables (not actual user data)
      if (typeof value === 'string') {
        // Keep if it contains template variables ({{...}}) or is a static value
        // Note: parentheses are critical here for correct operator precedence
        if (value.includes('{{') || (!value.includes('@') && !value.includes('http'))) {
          stripped[key] = value
        }
      } else {
        stripped[key] = value
      }
      continue
    }

    // For nested objects, recursively strip
    if (typeof value === 'object' && !Array.isArray(value)) {
      const strippedNested = stripConfig(value)
      if (Object.keys(strippedNested).length > 0) {
        stripped[key] = strippedNested
      }
      continue
    }

    // For arrays, check if they contain template variables
    if (Array.isArray(value)) {
      const strippedArray = value.filter(item => {
        if (typeof item === 'string') {
          // Note: parentheses are critical here for correct operator precedence
          return item.includes('{{') || (!item.includes('@') && !item.includes('http'))
        }
        return true
      })
      if (strippedArray.length > 0) {
        stripped[key] = strippedArray
      }
    }
  }

  return stripped
}

/**
 * Convert a planner Node to a template node format
 */
function nodeToTemplateNode(node: Node): TemplateNode {
  const position = node.metadata?.position || { x: 400, y: 100 }

  return {
    id: node.id,
    type: 'custom', // React Flow requires this
    position: {
      x: typeof position.x === 'number' ? position.x : 400,
      y: typeof position.y === 'number' ? position.y : 100,
    },
    data: {
      type: node.type,
      label: node.label,
      description: node.description,
      config: stripConfig(node.config || {}),
      isTrigger: node.metadata?.isTrigger as boolean | undefined,
      providerId: node.metadata?.providerId as string | undefined,
      previewFields: node.metadata?.previewFields as TemplateNode['data']['previewFields'],
    },
  }
}

/**
 * Convert a planner Edge to a template connection format
 */
function edgeToTemplateConnection(edge: Edge): TemplateConnection {
  return {
    id: edge.id,
    source: edge.from.nodeId,
    target: edge.to.nodeId,
    sourceHandle: edge.from.portId || 'source',
    targetHandle: edge.to.portId || 'target',
  }
}

/**
 * Extract unique integrations from nodes
 */
function extractIntegrations(nodes: Node[]): string[] {
  const integrations = new Set<string>()

  for (const node of nodes) {
    const providerId = node.metadata?.providerId as string | undefined
    if (providerId && providerId !== 'automation' && providerId !== 'logic') {
      integrations.add(providerId)
    }
  }

  return Array.from(integrations)
}

/**
 * Generate a hash of the prompt for deduplication
 */
function generatePromptHash(prompt: string): string {
  const normalized = prompt
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return createHash('sha256').update(normalized).digest('hex').slice(0, 16)
}

/**
 * Infer category from nodes and prompt
 */
function inferCategory(nodes: Node[], prompt: string): string {
  const normalizedPrompt = prompt.toLowerCase()
  const integrations = extractIntegrations(nodes)

  // Check for AI-related patterns
  if (normalizedPrompt.includes('ai') ||
      normalizedPrompt.includes('summarize') ||
      normalizedPrompt.includes('generate') ||
      nodes.some(n => n.type.includes('ai'))) {
    return 'AI Automation'
  }

  // Check for specific integrations
  if (integrations.includes('gmail') || integrations.includes('outlook')) {
    if (normalizedPrompt.includes('customer') || normalizedPrompt.includes('support')) {
      return 'Customer Service'
    }
    return 'Notifications'
  }

  if (integrations.includes('slack') || integrations.includes('discord')) {
    return 'Notifications'
  }

  if (integrations.includes('airtable') || integrations.includes('notion')) {
    return 'Data Sync'
  }

  if (integrations.includes('hubspot') || integrations.includes('salesforce')) {
    return 'Sales & CRM'
  }

  if (normalizedPrompt.includes('social') ||
      integrations.includes('twitter') ||
      integrations.includes('linkedin')) {
    return 'Social Media'
  }

  // Default
  return 'Productivity'
}

/**
 * Generate tags from nodes and prompt
 */
function generateTags(nodes: Node[], prompt: string): string[] {
  const tags = new Set<string>()
  const integrations = extractIntegrations(nodes)

  // Add integration names as tags
  for (const integration of integrations) {
    tags.add(integration)
  }

  // Add action-based tags
  const normalizedPrompt = prompt.toLowerCase()
  if (normalizedPrompt.includes('email')) tags.add('email')
  if (normalizedPrompt.includes('slack')) tags.add('slack')
  if (normalizedPrompt.includes('ai') || normalizedPrompt.includes('summarize')) tags.add('ai')
  if (normalizedPrompt.includes('webhook')) tags.add('webhook')
  if (normalizedPrompt.includes('schedule')) tags.add('scheduled')
  if (normalizedPrompt.includes('notification')) tags.add('notifications')
  if (normalizedPrompt.includes('sync')) tags.add('sync')

  return Array.from(tags).slice(0, 5) // Limit to 5 tags
}

/**
 * Convert PlannerResult to TemplateData
 *
 * This is the main function to convert a successful plan into a reusable template.
 */
export function plannerResultToTemplate(
  result: PlannerResult,
  originalPrompt: string
): TemplateData | null {
  // Extract nodes and edges from edits
  const nodes: Node[] = []
  const edges: Edge[] = []

  for (const edit of result.edits) {
    if (edit.op === 'addNode') {
      nodes.push(edit.node)
    } else if (edit.op === 'connect') {
      edges.push(edit.edge)
    }
  }

  // Don't create template if there are no nodes
  if (nodes.length === 0) {
    return null
  }

  // Convert to template format
  const templateNodes = nodes.map(nodeToTemplateNode)
  const templateConnections = edges.map(edgeToTemplateConnection)

  return {
    name: result.workflowName || 'AI Generated Workflow',
    description: result.rationale || originalPrompt,
    category: inferCategory(nodes, originalPrompt),
    tags: generateTags(nodes, originalPrompt),
    nodes: templateNodes,
    connections: templateConnections,
    integrations: extractIntegrations(nodes),
    promptHash: generatePromptHash(originalPrompt),
  }
}

/**
 * Check if a template with similar prompt already exists
 */
export async function findExistingTemplate(
  supabase: any,
  promptHash: string
): Promise<{ id: string; name: string } | null> {
  const { data, error } = await supabase
    .from('templates')
    .select('id, name')
    .eq('prompt_hash', promptHash)
    .eq('is_ai_generated', true)
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  return data
}
