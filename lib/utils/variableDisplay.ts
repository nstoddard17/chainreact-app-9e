import { parseVariableReference } from "../workflows/variableReferences"

interface NodeInfo {
  id: string
  title: string
  type: string
  providerId?: string
  outputSchema?: Array<{
    name: string
    label: string
    type: string
  }>
}

/**
 * Convert a node ID variable reference to a human-readable display format
 * @param value The value that may contain variable references
 * @param nodes Array of workflow nodes with their metadata
 * @returns Object with display value and actual value
 */
export function formatVariableForDisplay(
  value: string,
  nodes?: NodeInfo[]
): { display: string; actual: string } {
  if (!value || typeof value !== 'string') {
    return { display: value || '', actual: value || '' }
  }

  // Check if the value contains variable references
  if (!value.includes('{{') || !value.includes('}}')) {
    return { display: value, actual: value }
  }

  let displayValue = value

  const matches = value.matchAll(/\{\{([^}]+)\}\}/g)

  for (const match of matches) {
    const [fullMatch] = match
    const parsed = parseVariableReference(fullMatch)
    if (!parsed) continue

    if (parsed.kind === 'node' && parsed.nodeId) {
      const node = nodes?.find(n => n.id === parsed.nodeId)
      if (node) {
        const providerName = node.providerId
          ? formatProviderName(node.providerId)
          : getProviderFromNodeType(node.type)

        const nodeTitle = sanitizeForDisplay(node.title || getNodeTypeLabel(node.type))
        const fieldPathText = parsed.fieldPath.length > 0
          ? parsed.fieldPath.join('.')
          : ''

        const segments = [nodeTitle]
        if (fieldPathText) {
          segments.push(fieldPathText)
        }
        const humanReadable = providerName
          ? `${providerName}.${segments.join('.')}`
          : segments.join('.')

        displayValue = displayValue.replace(fullMatch, `{{${humanReadable}}}`)
      }
    }
  }

  return { display: displayValue, actual: value }
}

/**
 * Format provider ID to human-readable name with underscores
 * e.g., "google-calendar" -> "Google_Calendar"
 */
function formatProviderName(providerId: string): string {
  if (!providerId) return ''
  return providerId
    .replace(/[_-]/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('_')
}

/**
 * Extract provider from node type string
 * e.g., "google_calendar_action_list_events" -> "Google_Calendar"
 */
function getProviderFromNodeType(nodeType: string): string {
  if (!nodeType) return ''

  // Common patterns to extract provider
  const providerPatterns: Record<string, string> = {
    'google_calendar': 'Google_Calendar',
    'google-calendar': 'Google_Calendar',
    'google_drive': 'Google_Drive',
    'google-drive': 'Google_Drive',
    'google_sheets': 'Google_Sheets',
    'google-sheets': 'Google_Sheets',
    'gmail': 'Gmail',
    'slack': 'Slack',
    'discord': 'Discord',
    'notion': 'Notion',
    'airtable': 'Airtable',
    'trello': 'Trello',
    'hubspot': 'HubSpot',
    'shopify': 'Shopify',
    'stripe': 'Stripe',
    'ai_agent': 'AI',
    'ai_router': 'AI',
    'http_request': 'HTTP',
    'webhook': 'Webhook',
    'filter': 'Logic',
    'delay': 'Logic',
    'loop': 'Logic',
    'manual': 'Manual',
  }

  for (const [pattern, provider] of Object.entries(providerPatterns)) {
    if (nodeType.toLowerCase().includes(pattern)) {
      return provider
    }
  }

  return ''
}

/**
 * Sanitize a string for display in variable format
 * Replaces spaces with underscores, removes special characters
 */
function sanitizeForDisplay(str: string): string {
  if (!str) return ''
  return str
    .replace(/\s+/g, '_')           // Replace spaces with underscores
    .replace(/[^a-zA-Z0-9_]/g, '')  // Remove special characters except underscores
}

/**
 * Get a human-readable label for a node type
 */
function getNodeTypeLabel(nodeType: string): string {
  const typeLabels: Record<string, string> = {
    'google-drive:get_file': 'Get File',
    'google-drive:upload_file': 'Upload',
    'google-drive:create_folder': 'Create Folder',
    'google-drive:create_file': 'Upload File',
    'gmail_action_send_email': 'Send Email',
    'gmail_trigger_new_email': 'New Email',
    'slack_send_message': 'Send Message',
    'notion_create_page': 'Create Page',
    'airtable_create_record': 'Create Record',
    'google-sheets_add_row': 'Add Row',
    'ai_agent': 'AI Agent',
    'filter': 'Filter',
    'delay': 'Delay',
    'webhook': 'Webhook',
    'manual': 'Manual Trigger',
  }

  // Try exact match first
  if (typeLabels[nodeType]) {
    return typeLabels[nodeType]
  }

  // Extract action name from type (e.g., "google_calendar_action_list_events" -> "List Events")
  const parts = nodeType.split(/[_-]/)
  const actionIndex = parts.findIndex(p => p === 'action' || p === 'trigger')
  if (actionIndex !== -1 && actionIndex < parts.length - 1) {
    return parts
      .slice(actionIndex + 1)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  return nodeType.replace(/_/g, ' ').replace(/[-:]/g, ' ')
}

/**
 * Check if a value contains variable references
 */
export function containsVariables(value: string): boolean {
  return typeof value === 'string' && value.includes('{{') && value.includes('}}')
}

/**
 * Extract all variable references from a value
 */
export function extractVariables(value: string): string[] {
  if (!containsVariables(value)) return []
  
  const variables: string[] = []
  const pattern = /\{\{([^}]+)\}\}/g
  let match
  
  while ((match = pattern.exec(value)) !== null) {
    variables.push(match[0])
  }
  
  return variables
}
