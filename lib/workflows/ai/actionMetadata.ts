/**
 * Action Metadata and Examples System
 * 
 * Rich metadata for action discovery and AI understanding
 */

export interface ActionExample {
  intent: string // What the user wants to do
  scenario: string // Context/situation
  userQuery: string // Example user request
  configuration: Record<string, any> // How to configure the action
  explanation?: string // Why this configuration
}

export interface ActionMetadata {
  id: string
  name: string
  category: 'communication' | 'database' | 'productivity' | 'social' | 'developer' | 'analytics' | 'ai'
  provider: string
  description: string
  
  // For semantic search
  tags: string[]
  keywords: string[]
  
  // When to use this action
  useCases: string[]
  triggers: string[] // What typically triggers this action
  
  // When NOT to use this action
  avoidWhen: string[]
  
  // Examples of usage
  examples: {
    support?: ActionExample[]
    notifications?: ActionExample[]
    dataProcessing?: ActionExample[]
    automation?: ActionExample[]
    custom?: ActionExample[]
  }
  
  // Capabilities
  capabilities: string[]
  limitations: string[]
  
  // Common patterns
  commonPatterns: {
    pattern: string
    configuration: Record<string, any>
  }[]
  
  // Semantic embedding for similarity search (will be computed)
  embedding?: number[]
}

/**
 * Comprehensive action metadata database
 */
export const ACTION_METADATA: Record<string, ActionMetadata> = {
  // ============= COMMUNICATION ACTIONS =============
  
  'gmail_send_email': {
    id: 'gmail_send_email',
    name: 'Send Email',
    category: 'communication',
    provider: 'gmail',
    description: 'Send an email through Gmail with rich formatting and attachments',
    
    tags: ['email', 'notify', 'alert', 'message', 'send', 'gmail', 'communication'],
    keywords: ['mail', 'letter', 'notify', 'inform', 'tell', 'send message', 'email someone'],
    
    useCases: [
      'Sending notifications to users',
      'Sending confirmation emails',
      'Forwarding important messages',
      'Sending reports and summaries',
      'Customer communication',
      'Team notifications'
    ],
    
    triggers: [
      'when someone fills out a form',
      'when an error occurs',
      'when a payment is received',
      'when a task is completed',
      'when someone requests information'
    ],
    
    avoidWhen: [
      'Need instant messaging (use Slack/Discord)',
      'Bulk marketing emails (use marketing tools)',
      'Internal team chat (use Slack)',
      'Time-sensitive alerts (use SMS)'
    ],
    
    examples: {
      support: [
        {
          intent: 'Reply to customer inquiry',
          scenario: 'Customer asks about product features',
          userQuery: 'Send a reply email to the customer explaining our features',
          configuration: {
            to: '{{trigger.email.from}}',
            subject: 'Re: {{trigger.email.subject}}',
            body: `Dear {{trigger.email.sender_name}},

Thank you for your inquiry about our product features.

{{AI:generate_feature_explanation}}

If you have any other questions, please don't hesitate to ask.

Best regards,
The Support Team`
          }
        },
        {
          intent: 'Send bug report acknowledgment',
          scenario: 'User reports a bug via Discord',
          userQuery: 'Email the development team about this bug report',
          configuration: {
            to: 'dev-team@company.com',
            subject: '[BUG] {{trigger.discord.content | summarize}}',
            body: `New bug report from Discord:

User: {{trigger.discord.username}}
Channel: {{trigger.discord.channel_name}}

Issue:
{{trigger.discord.content}}

Priority: {{AI:assess_priority}}

Please investigate.`
          }
        }
      ],
      notifications: [
        {
          intent: 'Alert admin about system error',
          scenario: 'Workflow encounters an error',
          userQuery: 'Notify administrator about the error',
          configuration: {
            to: 'admin@company.com',
            subject: '🚨 System Error Alert',
            body: `An error occurred in workflow: {{workflow.name}}

Error: {{error.message}}
Time: {{error.timestamp}}
Node: {{error.node}}

Please check the system logs.`
          }
        },
        {
          intent: 'Send order confirmation',
          scenario: 'Customer completes purchase',
          userQuery: 'Send order confirmation to customer',
          configuration: {
            to: '{{trigger.shopify.email}}',
            subject: 'Order Confirmation #{{trigger.shopify.order_number}}',
            body: `Thank you for your order!

Order Details:
{{AI:format_order_details}}

Your order will be shipped within 2-3 business days.`
          }
        }
      ]
    },
    
    capabilities: [
      'HTML formatting',
      'Plain text',
      'Attachments',
      'CC/BCC',
      'Reply to threads',
      'Custom headers'
    ],
    
    limitations: [
      'Max 25MB attachments',
      'Rate limits apply',
      'Requires Gmail account'
    ],
    
    commonPatterns: [
      {
        pattern: 'Thank you email',
        configuration: {
          subject: 'Thank you for {{context}}',
          body: 'Dear {{name}},\n\nThank you for {{action}}.\n\nBest regards'
        }
      }
    ]
  },

  'slack_post_message': {
    id: 'slack_post_message',
    name: 'Post Slack Message',
    category: 'communication',
    provider: 'slack',
    description: 'Send a message to a Slack channel or user',
    
    tags: ['slack', 'message', 'chat', 'team', 'instant', 'notification'],
    keywords: ['slack', 'tell team', 'notify channel', 'message group', 'team chat'],
    
    useCases: [
      'Team notifications',
      'Real-time alerts',
      'Status updates',
      'Quick questions',
      'Team coordination'
    ],
    
    triggers: [
      'when build completes',
      'when customer needs help',
      'when task is assigned',
      'when deadline approaches'
    ],
    
    avoidWhen: [
      'Formal communication needed (use email)',
      'External customers (use email)',
      'Long-form content (use documents)',
      'Sensitive information (use secure channels)'
    ],
    
    examples: {
      notifications: [
        {
          intent: 'Notify team about new bug',
          scenario: 'Bug reported in GitHub',
          userQuery: 'Alert the dev team in Slack about this bug',
          configuration: {
            channel: '#dev-team',
            text: `🐛 New bug reported by {{trigger.github.sender}}

**{{trigger.github.issue.title}}**

{{trigger.github.issue.body | summarize}}

GitHub Issue: #{{trigger.github.issue.number}}`
          }
        },
        {
          intent: 'Share daily summary',
          scenario: 'End of day summary',
          userQuery: 'Post daily summary to team channel',
          configuration: {
            channel: '#general',
            text: `📊 Daily Summary

{{AI:generate_daily_summary}}

Great work today, team! 🎉`
          }
        }
      ]
    },
    
    capabilities: [
      'Rich formatting (markdown)',
      'Threads',
      'Mentions (@user)',
      'Emojis',
      'Attachments',
      'Interactive blocks'
    ],
    
    limitations: [
      'Message length limits',
      'Rate limiting',
      'Workspace access required'
    ],
    
    commonPatterns: [
      {
        pattern: 'Alert message',
        configuration: {
          text: '🚨 {{alert_type}}: {{message}}'
        }
      }
    ]
  },

  'discord_send_message': {
    id: 'discord_send_message',
    name: 'Send Discord Message',
    category: 'communication',
    provider: 'discord',
    description: 'Send a message to a Discord channel',
    
    tags: ['discord', 'message', 'chat', 'community', 'gaming'],
    keywords: ['discord', 'message server', 'notify community', 'chat'],
    
    useCases: [
      'Community announcements',
      'Gaming notifications',
      'Support responses',
      'Event reminders'
    ],
    
    triggers: [
      'when someone joins server',
      'when event starts',
      'when question is asked'
    ],
    
    avoidWhen: [
      'Professional business communication (use Slack/email)',
      'Formal documentation (use documents)',
      'Sensitive data (use secure channels)'
    ],
    
    examples: {
      support: [
        {
          intent: 'Welcome new member',
          scenario: 'User joins Discord server',
          userQuery: 'Welcome the new member',
          configuration: {
            channel: '#welcome',
            content: `Welcome to the server, {{trigger.discord.member.username}}! 👋

Please read the rules in #rules and introduce yourself in #introductions.

Enjoy your stay!`
          }
        }
      ]
    },
    
    capabilities: [
      'Rich embeds',
      'Mentions',
      'Reactions',
      'File attachments',
      'Voice channel integration'
    ],
    
    limitations: [
      '2000 character limit',
      'Rate limiting',
      'Bot permissions required'
    ],
    
    commonPatterns: []
  },

  // ============= DATABASE ACTIONS =============
  
  'airtable_create_record': {
    id: 'airtable_create_record',
    name: 'Create Airtable Record',
    category: 'database',
    provider: 'airtable',
    description: 'Create a new record in an Airtable base',
    
    tags: ['database', 'record', 'create', 'add', 'insert', 'airtable', 'table'],
    keywords: ['add to database', 'create record', 'log data', 'save information', 'store data'],
    
    useCases: [
      'Logging form submissions',
      'Tracking orders',
      'Managing contacts',
      'Recording events',
      'Inventory management'
    ],
    
    triggers: [
      'when form is submitted',
      'when payment received',
      'when user signs up',
      'when order placed'
    ],
    
    avoidWhen: [
      'Need real-time sync (use dedicated database)',
      'Complex queries needed (use SQL database)',
      'High volume transactions (use specialized database)'
    ],
    
    examples: {
      dataProcessing: [
        {
          intent: 'Log customer inquiry',
          scenario: 'Email received from customer',
          userQuery: 'Add this inquiry to our CRM',
          configuration: {
            base: 'CRM',
            table: 'Inquiries',
            fields: {
              'Email': '{{trigger.email.from}}',
              'Name': '{{trigger.email.sender_name}}',
              'Subject': '{{trigger.email.subject}}',
              'Message': '{{trigger.email.body}}',
              'Status': 'New',
              'Priority': '{{AI:assess_priority}}',
              'Category': '{{AI:categorize_inquiry}}',
              'Date': '{{trigger.email.date}}'
            }
          }
        },
        {
          intent: 'Track bug report',
          scenario: 'Bug reported via Discord',
          userQuery: 'Log this bug in our tracking system',
          configuration: {
            base: 'Development',
            table: 'Bugs',
            fields: {
              'Title': '{{AI:generate_bug_title}}',
              'Description': '{{trigger.discord.content}}',
              'Reporter': '{{trigger.discord.username}}',
              'Status': 'Open',
              'Priority': '{{AI:assess_bug_priority}}',
              'Category': '{{AI:categorize_bug}}'
            }
          }
        }
      ]
    },
    
    capabilities: [
      'Multiple field types',
      'Attachments',
      'Linked records',
      'Formula fields',
      'Lookups'
    ],
    
    limitations: [
      'API rate limits',
      'Base size limits',
      'Attachment size limits'
    ],
    
    commonPatterns: [
      {
        pattern: 'Contact form submission',
        configuration: {
          fields: {
            'Name': '{{form.name}}',
            'Email': '{{form.email}}',
            'Message': '{{form.message}}',
            'Date': '{{current_date}}'
          }
        }
      }
    ]
  },

  'google_sheets_append': {
    id: 'google_sheets_append',
    name: 'Add Row to Google Sheets',
    category: 'database',
    provider: 'google',
    description: 'Append a new row to a Google Sheets spreadsheet',
    
    tags: ['spreadsheet', 'sheets', 'google', 'row', 'data', 'append'],
    keywords: ['add to spreadsheet', 'log to sheets', 'excel', 'spreadsheet'],
    
    useCases: [
      'Simple data logging',
      'Report generation',
      'Data collection',
      'Basic CRM'
    ],
    
    triggers: [
      'when data needs logging',
      'when report is generated',
      'when form submitted'
    ],
    
    avoidWhen: [
      'Complex relationships needed',
      'Real-time collaboration required',
      'Large datasets'
    ],
    
    examples: {
      dataProcessing: [
        {
          intent: 'Log daily metrics',
          scenario: 'End of day metrics collection',
          userQuery: 'Add today\'s metrics to the spreadsheet',
          configuration: {
            spreadsheetId: '{{config.metrics_sheet_id}}',
            range: 'Sheet1',
            values: [
              '{{current_date}}',
              '{{AI:calculate_daily_revenue}}',
              '{{AI:count_new_users}}',
              '{{AI:average_response_time}}'
            ]
          }
        }
      ]
    },
    
    capabilities: [
      'Simple data entry',
      'Formula support',
      'Multiple sheets',
      'Basic formatting'
    ],
    
    limitations: [
      'API quotas',
      'Cell limits',
      'No complex queries'
    ],
    
    commonPatterns: []
  },

  // ============= AI ACTIONS =============
  
  'openai_completion': {
    id: 'openai_completion',
    name: 'OpenAI Completion',
    category: 'ai',
    provider: 'openai',
    description: 'Generate text using OpenAI GPT models',
    
    tags: ['ai', 'generate', 'text', 'gpt', 'completion', 'write'],
    keywords: ['generate text', 'ai write', 'create content', 'gpt', 'summarize', 'translate'],
    
    useCases: [
      'Content generation',
      'Summarization',
      'Translation',
      'Data extraction',
      'Classification'
    ],
    
    triggers: [
      'when content needs processing',
      'when summary required',
      'when translation needed'
    ],
    
    avoidWhen: [
      'Sensitive data processing',
      'Guaranteed accuracy required',
      'Real-time response critical'
    ],
    
    examples: {
      automation: [
        {
          intent: 'Summarize long email',
          scenario: 'Long customer email received',
          userQuery: 'Summarize this email',
          configuration: {
            prompt: 'Summarize the following email in 2-3 sentences:\n\n{{trigger.email.body}}',
            model: 'gpt-4-turbo',
            temperature: 0.3,
            max_tokens: 150
          }
        },
        {
          intent: 'Generate response',
          scenario: 'Customer asks question',
          userQuery: 'Generate a helpful response',
          configuration: {
            prompt: `Generate a helpful response to this question:
            
Question: {{trigger.discord.content}}

Context: {{AI:gather_relevant_context}}

Response should be friendly and informative.`,
            model: 'gpt-4-turbo',
            temperature: 0.7
          }
        }
      ]
    },
    
    capabilities: [
      'Multiple models',
      'Custom prompts',
      'Temperature control',
      'Token limits',
      'JSON mode'
    ],
    
    limitations: [
      'Token limits',
      'Cost per use',
      'Rate limits'
    ],
    
    commonPatterns: []
  }
}

/**
 * Get all actions for a specific category
 */
export function getActionsByCategory(category: ActionMetadata['category']): ActionMetadata[] {
  return Object.values(ACTION_METADATA).filter(action => action.category === category)
}

/**
 * Get all actions for a specific provider
 */
export function getActionsByProvider(provider: string): ActionMetadata[] {
  return Object.values(ACTION_METADATA).filter(action => action.provider === provider)
}

/**
 * Search actions by tags
 */
export function searchActionsByTags(tags: string[]): ActionMetadata[] {
  return Object.values(ACTION_METADATA).filter(action => 
    tags.some(tag => action.tags.includes(tag.toLowerCase()))
  )
}

/**
 * Get examples for specific use case
 */
export function getExamplesForUseCase(
  actionId: string,
  useCase: keyof ActionMetadata['examples']
): ActionExample[] {
  const action = ACTION_METADATA[actionId]
  if (!action) return []
  return action.examples[useCase] || []
}