/**
 * Utility functions for displaying variable references in a human-readable format
 */

interface NodeInfo {
  id: string
  title: string
  type: string
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

  // Find all variable references in the format {{node-id.output.field}}
  const variablePattern = /\{\{(node-[\w-]+|trigger-[\w-]+)\.(output)\.([^}]+)\}\}/g
  const matches = value.matchAll(variablePattern)

  for (const match of matches) {
    const [fullMatch, nodeId, outputPrefix, fieldPath] = match
    
    // Find the node metadata
    const node = nodes?.find(n => n.id === nodeId)
    
    if (node) {
      // Find the field in the output schema
      const fieldName = fieldPath.split('.')[0] // Get the first part of the path
      const outputField = node.outputSchema?.find(f => f.name === fieldName)
      
      // Create a human-readable label
      let humanReadable = ''
      
      // Use node title and field label
      const nodeTitle = node.title || getNodeTypeLabel(node.type)
      const fieldLabel = outputField?.label || fieldName
      
      // Format based on the field type
      if (outputField?.type === 'object' || fieldPath.includes('.')) {
        // For complex objects, show the full path
        humanReadable = `${nodeTitle} → ${fieldLabel}`
      } else {
        humanReadable = `${nodeTitle}: ${fieldLabel}`
      }
      
      // Replace only in display value, keep actual value unchanged
      displayValue = displayValue.replace(fullMatch, `{{${humanReadable}}}`)
    } else {
      // If we can't find the node, at least make it more readable
      const fieldName = fieldPath.split('.')[0]
      displayValue = displayValue.replace(fullMatch, `{{Previous Node: ${fieldName}}}`)
    }
  }

  return { display: displayValue, actual: value }
}

/**
 * Get a human-readable label for a node type
 */
function getNodeTypeLabel(nodeType: string): string {
  const typeLabels: Record<string, string> = {
    'google-drive:get_file': 'Google Drive: Get File',
    'google-drive:upload_file': 'Google Drive: Upload',
    'google-drive:create_folder': 'Google Drive: Create Folder',
    'google-drive:create_file': 'Google Drive: Upload File',
    'gmail_action_send_email': 'Gmail: Send Email',
    'gmail_trigger_new_email': 'Gmail Trigger',
    'slack_send_message': 'Slack',
    'notion_create_page': 'Notion',
    'airtable_create_record': 'Airtable',
    'google-sheets_add_row': 'Google Sheets',
    'ai_agent': 'AI Agent',
    'filter': 'Filter',
    'delay': 'Delay',
    'webhook': 'Webhook',
    'manual': 'Manual Trigger',
  }

  return typeLabels[nodeType] || nodeType.replace(/_/g, ' ').replace(/[-:]/g, ' ')
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