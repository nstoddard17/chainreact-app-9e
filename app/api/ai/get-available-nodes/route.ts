import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/utils/supabase/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'

export const dynamic = 'force-dynamic'

/**
 * GET /api/ai/get-available-nodes
 * Returns all available workflow nodes for AI reference
 * This ensures AI only suggests nodes that actually exist
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()

    // Auth check
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse('Unauthorized', 401)
    }

    // Transform nodes into AI-friendly format
    const nodes = ALL_NODE_COMPONENTS.map(node => ({
      // Core info
      type: node.type,
      name: node.name,
      providerId: node.providerId,
      category: node.category || 'misc',

      // Type flags
      isTrigger: node.isTrigger || false,
      isAction: !node.isTrigger,

      // Description
      description: node.description || `${node.name} node`,

      // Configuration requirements
      requiredFields: node.configFields
        ?.filter(f => f.required)
        .map(f => f.name) || [],

      optionalFields: node.configFields
        ?.filter(f => !f.required)
        .map(f => f.name) || [],

      // Dependencies
      requiresIntegration: node.providerId !== 'logic' && node.providerId !== 'automation',
      integrationProvider: node.providerId,

      // Categorization for AI
      tags: generateNodeTags(node),
      keywords: generateNodeKeywords(node),

      // Usage hints for AI
      commonUseCase: getCommonUseCase(node),
      examplePrompt: getExamplePrompt(node)
    }))

    // Group by category for easier AI parsing
    const categorized = {
      triggers: nodes.filter(n => n.isTrigger),
      actions: nodes.filter(n => n.isAction),

      byProvider: groupBy(nodes, 'providerId'),
      byCategory: groupBy(nodes, 'category'),

      total: nodes.length,
      providers: [...new Set(nodes.map(n => n.providerId))],
      categories: [...new Set(nodes.map(n => n.category))]
    }

    return jsonResponse({
      nodes,
      categorized,
      lastUpdated: new Date().toISOString()
    })

  } catch (error) {
    console.error('Error fetching available nodes:', error)
    return errorResponse('Failed to fetch available nodes', 500)
  }
}

/**
 * Generate tags for AI matching
 */
function generateNodeTags(node: any): string[] {
  const tags: string[] = []

  // Provider tags
  if (node.providerId) {
    tags.push(node.providerId)
  }

  // Action type tags
  const name = node.name.toLowerCase()
  if (name.includes('send')) tags.push('send', 'message', 'communication')
  if (name.includes('create')) tags.push('create', 'new', 'add')
  if (name.includes('update')) tags.push('update', 'modify', 'change')
  if (name.includes('delete')) tags.push('delete', 'remove')
  if (name.includes('get') || name.includes('fetch')) tags.push('retrieve', 'fetch', 'read')
  if (name.includes('search') || name.includes('find')) tags.push('search', 'find', 'query')
  if (name.includes('list')) tags.push('list', 'all', 'multiple')

  // Category tags
  if (node.isTrigger) tags.push('trigger', 'start', 'when')
  if (node.category) tags.push(node.category)

  return [...new Set(tags)]
}

/**
 * Generate keywords for matching user intent
 */
function generateNodeKeywords(node: any): string[] {
  const keywords: string[] = []
  const name = node.name.toLowerCase()
  const type = node.type.toLowerCase()

  // Add words from name
  keywords.push(...name.split(/[\s_-]+/))

  // Add words from type
  keywords.push(...type.split(/[\s_-]+/))

  // Add provider
  if (node.providerId) {
    keywords.push(node.providerId)
  }

  // Common synonyms
  const synonyms: Record<string, string[]> = {
    'email': ['mail', 'message', 'inbox'],
    'slack': ['chat', 'message', 'channel'],
    'sheets': ['spreadsheet', 'table', 'data'],
    'calendar': ['schedule', 'event', 'meeting'],
    'drive': ['storage', 'files', 'documents']
  }

  keywords.forEach(keyword => {
    if (synonyms[keyword]) {
      keywords.push(...synonyms[keyword])
    }
  })

  return [...new Set(keywords)]
}

/**
 * Get common use case for node
 */
function getCommonUseCase(node: any): string {
  const useCases: Record<string, string> = {
    'gmail_new_email': 'Trigger when new email arrives',
    'slack_send_message': 'Send message to Slack channel',
    'sheets_add_row': 'Add row to Google Sheets',
    'notion_create_page': 'Create new Notion page',
    'schedule_trigger': 'Run workflow on schedule',
    'webhook_trigger': 'Trigger via webhook URL',
    // Add more as needed
  }

  return useCases[node.type] || `Use ${node.name} in your workflow`
}

/**
 * Get example prompt that would match this node
 */
function getExamplePrompt(node: any): string {
  const examples: Record<string, string> = {
    'gmail_new_email': 'When I receive a new email',
    'slack_send_message': 'Send a message to Slack',
    'sheets_add_row': 'Add data to a spreadsheet',
    'notion_create_page': 'Create a Notion page',
    'schedule_trigger': 'Every day at 9am',
    'webhook_trigger': 'When webhook is called',
    // Add more as needed
  }

  return examples[node.type] || `Use ${node.name}`
}

/**
 * Utility: Group array by key
 */
function groupBy(array: any[], key: string): Record<string, any[]> {
  return array.reduce((result, item) => {
    const groupKey = item[key] || 'other'
    if (!result[groupKey]) {
      result[groupKey] = []
    }
    result[groupKey].push(item)
    return result
  }, {})
}
