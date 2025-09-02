/**
 * Trigger-based Variable System
 * 
 * Provides context-specific variables based on trigger type
 * These variables appear in the variable menu under AI Agent section
 */

export interface TriggerVariable {
  id: string
  label: string
  path: string
  description?: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  example?: any
}

export interface TriggerVariableCategory {
  id: string
  name: string
  icon?: string
  variables: TriggerVariable[]
}

/**
 * Comprehensive trigger variable definitions
 * These are exposed in the variable menu when AI Agent is in the workflow
 */
export const TRIGGER_VARIABLES: Record<string, TriggerVariableCategory> = {
  // Email triggers
  'gmail_trigger_new_email': {
    id: 'gmail',
    name: 'Gmail',
    icon: '📧',
    variables: [
      { id: 'from', label: 'Sender Email', path: 'trigger.email.from', type: 'string', example: 'john@example.com' },
      { id: 'sender_name', label: 'Sender Name', path: 'trigger.email.sender_name', type: 'string', example: 'John Doe' },
      { id: 'to', label: 'Recipient Email', path: 'trigger.email.to', type: 'string' },
      { id: 'subject', label: 'Email Subject', path: 'trigger.email.subject', type: 'string' },
      { id: 'body', label: 'Email Body', path: 'trigger.email.body', type: 'string' },
      { id: 'body_plain', label: 'Plain Text Body', path: 'trigger.email.body_plain', type: 'string' },
      { id: 'date', label: 'Date Received', path: 'trigger.email.date', type: 'string' },
      { id: 'message_id', label: 'Message ID', path: 'trigger.email.message_id', type: 'string' },
      { id: 'thread_id', label: 'Thread ID', path: 'trigger.email.thread_id', type: 'string' },
      { id: 'labels', label: 'Labels', path: 'trigger.email.labels', type: 'array' },
      { id: 'has_attachments', label: 'Has Attachments', path: 'trigger.email.has_attachments', type: 'boolean' },
      { id: 'attachments', label: 'Attachments', path: 'trigger.email.attachments', type: 'array' }
    ]
  },

  // Discord triggers
  'discord_trigger_message': {
    id: 'discord',
    name: 'Discord',
    icon: '💬',
    variables: [
      { id: 'content', label: 'Message Content', path: 'trigger.discord.content', type: 'string' },
      { id: 'username', label: 'Username', path: 'trigger.discord.author.username', type: 'string' },
      { id: 'user_id', label: 'User ID', path: 'trigger.discord.author.id', type: 'string' },
      { id: 'discriminator', label: 'User Tag', path: 'trigger.discord.author.discriminator', type: 'string' },
      { id: 'channel_name', label: 'Channel Name', path: 'trigger.discord.channel.name', type: 'string' },
      { id: 'channel_id', label: 'Channel ID', path: 'trigger.discord.channel.id', type: 'string' },
      { id: 'server_name', label: 'Server Name', path: 'trigger.discord.guild.name', type: 'string' },
      { id: 'server_id', label: 'Server ID', path: 'trigger.discord.guild.id', type: 'string' },
      { id: 'timestamp', label: 'Timestamp', path: 'trigger.discord.timestamp', type: 'string' },
      { id: 'message_id', label: 'Message ID', path: 'trigger.discord.id', type: 'string' },
      { id: 'mentions', label: 'Mentions', path: 'trigger.discord.mentions', type: 'array' },
      { id: 'embeds', label: 'Embeds', path: 'trigger.discord.embeds', type: 'array' }
    ]
  },

  // Slack triggers
  'slack_trigger_message': {
    id: 'slack',
    name: 'Slack',
    icon: '💼',
    variables: [
      { id: 'text', label: 'Message Text', path: 'trigger.slack.text', type: 'string' },
      { id: 'user', label: 'User ID', path: 'trigger.slack.user', type: 'string' },
      { id: 'username', label: 'Username', path: 'trigger.slack.username', type: 'string' },
      { id: 'channel', label: 'Channel ID', path: 'trigger.slack.channel', type: 'string' },
      { id: 'channel_name', label: 'Channel Name', path: 'trigger.slack.channel_name', type: 'string' },
      { id: 'ts', label: 'Timestamp', path: 'trigger.slack.ts', type: 'string' },
      { id: 'thread_ts', label: 'Thread Timestamp', path: 'trigger.slack.thread_ts', type: 'string' },
      { id: 'team', label: 'Team ID', path: 'trigger.slack.team', type: 'string' },
      { id: 'blocks', label: 'Message Blocks', path: 'trigger.slack.blocks', type: 'array' }
    ]
  },

  // Webhook triggers
  'webhook_trigger': {
    id: 'webhook',
    name: 'Webhook',
    icon: '🔗',
    variables: [
      { id: 'body', label: 'Request Body', path: 'trigger.webhook.body', type: 'object' },
      { id: 'headers', label: 'Headers', path: 'trigger.webhook.headers', type: 'object' },
      { id: 'method', label: 'HTTP Method', path: 'trigger.webhook.method', type: 'string' },
      { id: 'query', label: 'Query Parameters', path: 'trigger.webhook.query', type: 'object' },
      { id: 'url', label: 'URL', path: 'trigger.webhook.url', type: 'string' },
      { id: 'ip', label: 'IP Address', path: 'trigger.webhook.ip', type: 'string' }
    ]
  },

  // Form submission triggers
  'form_trigger': {
    id: 'form',
    name: 'Form',
    icon: '📝',
    variables: [
      { id: 'form_id', label: 'Form ID', path: 'trigger.form.id', type: 'string' },
      { id: 'form_name', label: 'Form Name', path: 'trigger.form.name', type: 'string' },
      { id: 'fields', label: 'All Fields', path: 'trigger.form.fields', type: 'object' },
      { id: 'submitted_at', label: 'Submission Time', path: 'trigger.form.submitted_at', type: 'string' },
      { id: 'user_email', label: 'Submitter Email', path: 'trigger.form.user_email', type: 'string' },
      { id: 'user_name', label: 'Submitter Name', path: 'trigger.form.user_name', type: 'string' }
    ]
  },

  // Calendar triggers
  'google_calendar_trigger': {
    id: 'calendar',
    name: 'Google Calendar',
    icon: '📅',
    variables: [
      { id: 'event_title', label: 'Event Title', path: 'trigger.calendar.summary', type: 'string' },
      { id: 'description', label: 'Description', path: 'trigger.calendar.description', type: 'string' },
      { id: 'start_time', label: 'Start Time', path: 'trigger.calendar.start', type: 'string' },
      { id: 'end_time', label: 'End Time', path: 'trigger.calendar.end', type: 'string' },
      { id: 'location', label: 'Location', path: 'trigger.calendar.location', type: 'string' },
      { id: 'attendees', label: 'Attendees', path: 'trigger.calendar.attendees', type: 'array' },
      { id: 'organizer', label: 'Organizer', path: 'trigger.calendar.organizer', type: 'object' },
      { id: 'meeting_link', label: 'Meeting Link', path: 'trigger.calendar.hangoutLink', type: 'string' }
    ]
  },

  // GitHub triggers
  'github_trigger': {
    id: 'github',
    name: 'GitHub',
    icon: '🐙',
    variables: [
      { id: 'action', label: 'Action', path: 'trigger.github.action', type: 'string' },
      { id: 'repository', label: 'Repository', path: 'trigger.github.repository.full_name', type: 'string' },
      { id: 'sender', label: 'User', path: 'trigger.github.sender.login', type: 'string' },
      { id: 'issue_title', label: 'Issue Title', path: 'trigger.github.issue.title', type: 'string' },
      { id: 'issue_body', label: 'Issue Body', path: 'trigger.github.issue.body', type: 'string' },
      { id: 'issue_number', label: 'Issue Number', path: 'trigger.github.issue.number', type: 'number' },
      { id: 'pr_title', label: 'PR Title', path: 'trigger.github.pull_request.title', type: 'string' },
      { id: 'pr_body', label: 'PR Body', path: 'trigger.github.pull_request.body', type: 'string' },
      { id: 'branch', label: 'Branch', path: 'trigger.github.ref', type: 'string' }
    ]
  },

  // Shopify triggers
  'shopify_trigger': {
    id: 'shopify',
    name: 'Shopify',
    icon: '🛍️',
    variables: [
      { id: 'order_id', label: 'Order ID', path: 'trigger.shopify.id', type: 'string' },
      { id: 'order_number', label: 'Order Number', path: 'trigger.shopify.order_number', type: 'string' },
      { id: 'customer_email', label: 'Customer Email', path: 'trigger.shopify.email', type: 'string' },
      { id: 'customer_name', label: 'Customer Name', path: 'trigger.shopify.customer.name', type: 'string' },
      { id: 'total_price', label: 'Total Price', path: 'trigger.shopify.total_price', type: 'number' },
      { id: 'currency', label: 'Currency', path: 'trigger.shopify.currency', type: 'string' },
      { id: 'line_items', label: 'Line Items', path: 'trigger.shopify.line_items', type: 'array' },
      { id: 'shipping_address', label: 'Shipping Address', path: 'trigger.shopify.shipping_address', type: 'object' },
      { id: 'fulfillment_status', label: 'Fulfillment Status', path: 'trigger.shopify.fulfillment_status', type: 'string' }
    ]
  }
}

/**
 * Get variables for all previous nodes in workflow
 */
export function getWorkflowVariables(
  nodes: any[],
  currentNodeId: string
): TriggerVariableCategory[] {
  const categories: TriggerVariableCategory[] = []
  
  // Find all nodes before current node
  const previousNodes = nodes.filter(n => {
    // Logic to determine if node comes before current node
    // This would need proper workflow traversal
    return n.id !== currentNodeId
  })
  
  previousNodes.forEach(node => {
    if (node.data?.type) {
      // Add trigger variables
      if (TRIGGER_VARIABLES[node.data.type]) {
        categories.push({
          ...TRIGGER_VARIABLES[node.data.type],
          name: `${node.data.title || TRIGGER_VARIABLES[node.data.type].name} (${node.id})`
        })
      }
      
      // Add action output variables
      const actionVariables = getActionOutputVariables(node.data.type, node.id)
      if (actionVariables) {
        categories.push(actionVariables)
      }
    }
  })
  
  return categories
}

/**
 * Get output variables from action nodes
 */
function getActionOutputVariables(
  actionType: string,
  nodeId: string
): TriggerVariableCategory | null {
  // Define output variables for common actions
  const ACTION_OUTPUTS: Record<string, TriggerVariable[]> = {
    'airtable_create_record': [
      { id: 'record_id', label: 'Record ID', path: `node.${nodeId}.output.id`, type: 'string' },
      { id: 'created_time', label: 'Created Time', path: `node.${nodeId}.output.createdTime`, type: 'string' },
      { id: 'fields', label: 'Record Fields', path: `node.${nodeId}.output.fields`, type: 'object' }
    ],
    'gmail_send_email': [
      { id: 'message_id', label: 'Message ID', path: `node.${nodeId}.output.id`, type: 'string' },
      { id: 'thread_id', label: 'Thread ID', path: `node.${nodeId}.output.threadId`, type: 'string' }
    ],
    'slack_post_message': [
      { id: 'ts', label: 'Message Timestamp', path: `node.${nodeId}.output.ts`, type: 'string' },
      { id: 'channel', label: 'Channel', path: `node.${nodeId}.output.channel`, type: 'string' }
    ],
    'openai_completion': [
      { id: 'response', label: 'AI Response', path: `node.${nodeId}.output.text`, type: 'string' },
      { id: 'tokens', label: 'Tokens Used', path: `node.${nodeId}.output.usage.total_tokens`, type: 'number' }
    ]
  }
  
  const outputs = ACTION_OUTPUTS[actionType]
  if (!outputs) return null
  
  return {
    id: `node_${nodeId}`,
    name: `Previous: ${actionType.replace(/_/g, ' ')}`,
    icon: '⚙️',
    variables: outputs
  }
}

/**
 * Format variable for insertion into text
 */
export function formatVariable(variable: TriggerVariable): string {
  return `{{${variable.path}}}`
}

/**
 * Parse variables from text
 */
export function parseVariables(text: string): string[] {
  const pattern = /\{\{([^}]+)\}\}/g
  const matches = []
  let match
  
  while ((match = pattern.exec(text)) !== null) {
    matches.push(match[1])
  }
  
  return matches
}

/**
 * Resolve variable value from context
 */
export function resolveVariable(
  path: string,
  context: Record<string, any>
): any {
  // Split path like "trigger.email.from" into parts
  const parts = path.split('.')
  let value = context
  
  for (const part of parts) {
    if (value && typeof value === 'object') {
      value = value[part]
    } else {
      return undefined
    }
  }
  
  return value
}