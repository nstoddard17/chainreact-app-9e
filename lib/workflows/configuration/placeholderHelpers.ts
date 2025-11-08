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
  fieldLabel?: string
  existingPlaceholder?: string
}

/**
 * Generate a smart placeholder for a configuration field
 * Updated to show format instructions instead of examples
 */
export function generatePlaceholder(options: PlaceholderOptions): string {
  const { fieldName, fieldType, integrationId = '', fieldLabel = '', existingPlaceholder = '' } = options

  // If field already has a good placeholder defined, use it
  if (existingPlaceholder && existingPlaceholder !== '') {
    return existingPlaceholder
  }

  const nameLower = fieldName.toLowerCase()
  const labelLower = fieldLabel.toLowerCase()

  // URLs (check BEFORE dates to avoid "custom" in "customThumbnail" triggering date logic)
  // Check both field name AND label for URL indicators
  if (nameLower.includes('url') || nameLower.includes('link') || nameLower.includes('webhook') ||
      labelLower.includes('url') || labelLower.includes('link') || labelLower.includes('webhook')) {
    if (nameLower.includes('thumbnail') || nameLower.includes('image') || nameLower.includes('avatar') ||
        labelLower.includes('thumbnail') || labelLower.includes('image') || labelLower.includes('avatar')) {
      return 'https://example.com/image.jpg or {{Image URL}}'
    }
    if (nameLower.includes('caption') || labelLower.includes('caption') ||
        nameLower.includes('subtitle') || labelLower.includes('subtitle')) {
      return 'https://example.com/captions.srt or {{Captions URL}}'
    }
    if (nameLower.includes('webhook') || labelLower.includes('webhook')) {
      return 'https://hooks.example.com/webhook or {{Webhook URL}}'
    }
    return 'https://example.com or {{Variable}}'
  }

  // Dates (check after URLs to avoid "custom" in URL fields)
  if (nameLower.includes('date') || nameLower.includes('due') || nameLower.includes('modified') || nameLower.includes('created') || nameLower.includes('custom')) {
    return '2024-01-01 or {{Variable}}'
  }

  // Email fields (more specific check to avoid matching "to" within words like "custom")
  if (nameLower.includes('email') || nameLower.includes('recipient') ||
      (nameLower.includes('to') && (nameLower.startsWith('to') || nameLower.includes(' to') || nameLower.includes('_to')))) {
    if (fieldName.includes('cc') || fieldName.includes('bcc')) {
      return 'user@example.com or {{Email}}'
    }
    return 'user@example.com or {{Email Variable}}'
  }

  // Subject lines
  if (nameLower.includes('subject')) {
    return 'Your subject here or {{Subject Variable}}'
  }

  // Message/Body/Content
  if (nameLower.includes('message') || nameLower.includes('body') || nameLower.includes('content')) {
    if (integrationId.includes('slack')) {
      return 'Type your message or use {{Variables}}'
    }
    if (integrationId.includes('discord')) {
      return 'Type your message or use {{Variables}}'
    }
    if (integrationId.includes('email') || integrationId.includes('gmail') || integrationId.includes('outlook')) {
      return 'Type email body or use {{Variables}}'
    }
    return 'Type your message or use {{Variables}}'
  }

  // Titles
  if (nameLower.includes('title') || nameLower.includes('name')) {
    return 'Enter value'
  }

  // Descriptions
  if (nameLower.includes('description') || nameLower.includes('summary')) {
    return 'Enter description or {{Description Variable}}'
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
    if (nameLower.includes('user')) return '12345 or {{User ID}}'
    if (nameLower.includes('channel')) return 'C1234567890 or {{Channel ID}}'
    if (nameLower.includes('workspace')) return 'W1234567890 or {{Workspace ID}}'
    return '12345 or {{ID Variable}}'
  }

  // Tags/Labels
  if (nameLower.includes('tag') || nameLower.includes('label')) {
    return 'tag1, tag2 or {{Tags Variable}}'
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
      return '19.99 or {{Amount Variable}}'
    }
    if (nameLower.includes('quantity') || nameLower.includes('count')) {
      return '5 or {{Count Variable}}'
    }
    return '100 or {{Number Variable}}'
  }

  // Boolean/Checkbox
  if (fieldType === 'boolean' || fieldType === 'checkbox') {
    return 'Check to enable'
  }

  // File paths (only for TEXT fields that reference file paths, not actual file upload fields)
  // File upload fields use FileUpload component which has its own placeholder
  if (fieldType !== 'file' && fieldType !== 'file-with-toggle' && (nameLower.includes('filepath') || nameLower.includes('file_path') || nameLower.includes('path'))) {
    return '/path/to/file.pdf or {{File Path}}'
  }

  // Phone numbers
  if (nameLower.includes('phone')) {
    return '+1 (555) 123-4567 or {{Phone}}'
  }

  // Default fallback
  return 'Enter value'
}

/**
 * Generate help text for a field based on its name and type
 */
export function generateHelpText(options: PlaceholderOptions): string | undefined {
  const { fieldName, fieldType, integrationId = '', fieldLabel = '' } = options
  const nameLower = fieldName.toLowerCase()
  const labelLower = fieldLabel.toLowerCase()

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
  const { fieldName, fieldType, integrationId = '', fieldLabel = '' } = options
  const nameLower = fieldName.toLowerCase()
  const labelLower = fieldLabel.toLowerCase()

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
