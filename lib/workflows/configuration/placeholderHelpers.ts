/**
 * Placeholder Helpers
 *
 * Generates context-aware, helpful placeholders for configuration fields.
 * Placeholders include examples and hints based on field type and integration.
 */

interface PlaceholderOptions {
  fieldName: string
  fieldType: string
  integrationId?: string
  required?: boolean
}

/**
 * Generate a smart placeholder for a configuration field
 * Updated to show format instructions instead of examples
 */
export function generatePlaceholder(options: PlaceholderOptions): string {
  const { fieldName, fieldType, integrationId = '' } = options
  const nameLower = fieldName.toLowerCase()

  // Email fields
  if (nameLower.includes('email') || nameLower.includes('recipient') || nameLower.includes('to')) {
    if (fieldName.includes('cc') || fieldName.includes('bcc')) {
      return 'Comma-separated email addresses (optional)'
    }
    return 'Enter email address or comma-separated list'
  }

  // Subject lines
  if (nameLower.includes('subject')) {
    return 'Enter email subject'
  }

  // Message/Body/Content
  if (nameLower.includes('message') || nameLower.includes('body') || nameLower.includes('content')) {
    if (integrationId.includes('slack')) {
      return 'Enter message content'
    }
    if (integrationId.includes('discord')) {
      return 'Enter message content'
    }
    if (integrationId.includes('email') || integrationId.includes('gmail') || integrationId.includes('outlook')) {
      return 'Enter email body'
    }
    return 'Enter message content'
  }

  // Titles
  if (nameLower.includes('title') || nameLower.includes('name')) {
    return 'Enter title'
  }

  // Descriptions
  if (nameLower.includes('description') || nameLower.includes('summary')) {
    return 'Enter description'
  }

  // URLs
  if (nameLower.includes('url') || nameLower.includes('link') || nameLower.includes('webhook')) {
    return 'Enter URL (https://...)'
  }

  // Channels/Rooms
  if (nameLower.includes('channel')) {
    if (integrationId.includes('slack')) {
      return 'Select channel'
    }
    if (integrationId.includes('discord')) {
      return 'Enter channel ID'
    }
    return 'Select channel'
  }

  // IDs
  if (nameLower.includes('id') && !nameLower.includes('video')) {
    if (nameLower.includes('user')) return 'Enter user ID'
    if (nameLower.includes('channel')) return 'Enter channel ID'
    if (nameLower.includes('workspace')) return 'Enter workspace ID'
    return 'Enter ID'
  }

  // Dates
  if (nameLower.includes('date') || nameLower.includes('due')) {
    return 'YYYY-MM-DD format'
  }

  // Tags/Labels
  if (nameLower.includes('tag') || nameLower.includes('label')) {
    return 'Comma-separated tags'
  }

  // Priority
  if (nameLower.includes('priority')) {
    return 'Select priority level'
  }

  // Status
  if (nameLower.includes('status')) {
    return 'Select status'
  }

  // Numbers
  if (fieldType === 'number') {
    if (nameLower.includes('amount') || nameLower.includes('price')) {
      return 'Enter amount (e.g., 19.99)'
    }
    if (nameLower.includes('quantity') || nameLower.includes('count')) {
      return 'Enter number'
    }
    return 'Enter number'
  }

  // Boolean/Checkbox
  if (fieldType === 'boolean' || fieldType === 'checkbox') {
    return 'Check to enable'
  }

  // File paths
  if (nameLower.includes('file') || nameLower.includes('path')) {
    return 'Enter file path'
  }

  // Phone numbers
  if (nameLower.includes('phone')) {
    return 'Enter phone number'
  }

  // Default fallback
  return 'Enter value'
}

/**
 * Generate help text for a field based on its name and type
 */
export function generateHelpText(options: PlaceholderOptions): string | undefined {
  const { fieldName, fieldType, integrationId = '' } = options
  const nameLower = fieldName.toLowerCase()

  // Email recipients
  if (nameLower.includes('recipient') || (nameLower.includes('email') && nameLower.includes('to'))) {
    return 'Enter one or more email addresses. Separate multiple addresses with commas.'
  }

  // CC/BCC
  if (nameLower.includes('cc') || nameLower.includes('bcc')) {
    return 'Optional: Add recipients who should receive a copy. Separate multiple addresses with commas.'
  }

  // Subject lines
  if (nameLower.includes('subject')) {
    return 'The subject line that recipients will see'
  }

  // Body/Message
  if (nameLower.includes('body') || (nameLower.includes('message') && !nameLower.includes('id'))) {
    return 'The main content of your message. You can use variables from previous steps to personalize the content.'
  }

  // Channels
  if (nameLower.includes('channel')) {
    if (integrationId.includes('slack')) {
      return 'Select a Slack channel where the message will be posted. Start typing to search.'
    }
    if (integrationId.includes('discord')) {
      return 'Select a Discord channel. You can find the channel ID by right-clicking the channel and selecting "Copy ID".'
    }
    return 'Select the channel where this action will take place'
  }

  // Webhooks
  if (nameLower.includes('webhook')) {
    return 'The webhook URL to send data to. This is provided by the service you want to integrate with.'
  }

  // Tags/Labels
  if (nameLower.includes('tag') || nameLower.includes('label')) {
    return 'Add tags to organize and categorize this item. Separate multiple tags with commas.'
  }

  // Dates
  if (nameLower.includes('date') || nameLower.includes('due')) {
    return 'Enter a date in YYYY-MM-DD format, or use a date variable from a previous step.'
  }

  // URLs
  if (nameLower.includes('url') || nameLower.includes('link')) {
    return 'Enter a full URL starting with http:// or https://'
  }

  // Default: no help text
  return undefined
}

/**
 * Generate example values for field tooltips
 */
export function generateExamples(options: PlaceholderOptions): string[] {
  const { fieldName, fieldType, integrationId = '' } = options
  const nameLower = fieldName.toLowerCase()

  // Email fields
  if (nameLower.includes('email') || nameLower.includes('recipient')) {
    return [
      'john@example.com',
      'team@company.com, admin@company.com',
      '{{Gmail: From Email}}'
    ]
  }

  // Subject lines
  if (nameLower.includes('subject')) {
    return [
      'Welcome to our newsletter',
      'Your order #{{Order ID}} is ready',
      'Meeting notes from {{Current Date}}'
    ]
  }

  // Message content
  if (nameLower.includes('message') || nameLower.includes('body')) {
    if (integrationId.includes('slack')) {
      return [
        'New lead from {{Contact Name}}!',
        'Daily report: {{Report Data}}',
        '@channel Check out this update'
      ]
    }
    return [
      'Hello {{Customer Name}},',
      'Your order status: {{Order Status}}',
      'Thanks for contacting us!'
    ]
  }

  // Channels
  if (nameLower.includes('channel')) {
    if (integrationId.includes('slack')) {
      return ['#general', '#announcements', '#team-updates']
    }
    if (integrationId.includes('discord')) {
      return ['123456789012345678', '{{Channel ID}}']
    }
  }

  // Tags
  if (nameLower.includes('tag') || nameLower.includes('label')) {
    return ['important, urgent', 'bug, high-priority', '{{Issue Type}}, {{Priority}}']
  }

  // Dates
  if (nameLower.includes('date')) {
    return ['2025-01-15', '{{Current Date}}', '{{Task Due Date}}']
  }

  // URLs
  if (nameLower.includes('url') || nameLower.includes('link')) {
    return ['https://example.com/page', '{{Document URL}}', 'https://company.com/{{Page Slug}}']
  }

  // Numbers
  if (fieldType === 'number') {
    return ['100', '{{Item Count}}', '19.99']
  }

  // Default: no examples
  return []
}

/**
 * Get keyboard hint for a field
 */
export function getKeyboardHint(options: PlaceholderOptions): string | undefined {
  const { fieldName, fieldType } = options
  const nameLower = fieldName.toLowerCase()

  // Fields that commonly use variables
  if (
    nameLower.includes('message') ||
    nameLower.includes('body') ||
    nameLower.includes('subject') ||
    nameLower.includes('title') ||
    nameLower.includes('content')
  ) {
    return 'Drag variables from the right panel or click a field to insert'
  }

  // Multi-select fields
  if (fieldType === 'multi-select' || fieldType === 'tags') {
    return 'Press Enter to add each item'
  }

  // Default: no hint
  return undefined
}
