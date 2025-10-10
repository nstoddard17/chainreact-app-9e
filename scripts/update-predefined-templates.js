import { createClient } from '@supabase/supabase-js'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase environment variables (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const templates = [
  {
    name: 'AI Agent Test Workflow - Customer Service',
    description: 'Classifies Discord support messages with AI, then creates Airtable records, sends notifications, or emails based on the route.',
    category: 'AI Automation',
    tags: ['ai-router', 'ai-message', 'airtable', 'discord', 'gmail'],
    integrations: ['airtable', 'discord', 'gmail'],
    difficulty: 'intermediate',
    estimated_time: '6 mins',
    nodes: [
      {
        id: 'discord-trigger-1',
        type: 'custom',
        position: { x: 80, y: 140 },
        data: {
          type: 'discord_trigger_new_message',
          title: 'New Discord Message',
          description: 'Triggers when a new message is posted in a Discord channel.',
          config: {
            channelId: '',
            includeBot: false
          },
          isTrigger: true,
          validationState: {
            missingRequired: ['channelId']
          }
        }
      },
      {
        id: 'ai-router-helpdesk',
        type: 'custom',
        position: { x: 320, y: 180 },
        data: {
          type: 'ai_router',
          title: 'Route Customer Request',
          description: 'AI routing node that decides which follow-up branch to execute.',
          config: {
            template: 'custom',
            systemPrompt: 'You are a customer support triage bot. Classify the incoming Discord message into one of: support_request, feedback, newsletter_signup, general. Provide a short reason and confidence.',
            model: 'gpt-4o-mini',
            apiSource: 'chainreact',
            memory: 'workflow',
            outputPaths: [
              { id: 'support_request', name: 'Support Request', description: 'Technical help needed', color: '#ef4444', condition: { type: 'ai_decision', minConfidence: 0.6 } },
              { id: 'feedback', name: 'Feedback', description: 'Product feedback or ideas', color: '#3b82f6', condition: { type: 'ai_decision', minConfidence: 0.6 } },
              { id: 'newsletter_signup', name: 'Newsletter Signup', description: 'Signup or marketing interest', color: '#10b981', condition: { type: 'ai_decision', minConfidence: 0.6 } },
              { id: 'general', name: 'General', description: 'Everything else', color: '#6b7280', condition: { type: 'fallback' } }
            ],
            decisionMode: 'single',
            includeReasoning: true,
            temperature: 0.2,
            maxRetries: 1,
            timeout: 30,
            costLimit: 0.5
          }
        }
      },
      {
        id: 'ai-message-support',
        type: 'custom',
        position: { x: 200, y: 520 },
        data: {
          type: 'ai_message',
          title: 'Summarize Support Request',
          description: 'Generates a short summary and acknowledgement for support issues.',
          config: {
            model: 'gpt-4o-mini',
            apiSource: 'chainreact',
            temperature: 0.3,
            contextNodeIds: ['discord-trigger-1'],
            userPrompt: 'Discord support request: {{trigger.message.content}}. Summarize the problem, suggest a priority (Low/Medium/High), and craft a short acknowledgement response.',
            outputFields: 'summary | Problem summary\npriority | Priority level\nresponse_message | Short acknowledgement message',
            includeRawOutput: false,
            memoryNotes: 'Use prior support history if available.'
          }
        }
      },
      {
        id: 'airtable-support-ticket',
        type: 'custom',
        position: { x: 200, y: 680 },
        data: {
          type: 'airtable_action_create_record',
          title: 'Create Support Ticket',
          description: 'Create a new record in the support tickets table.',
          config: {
            baseId: '',
            tableName: '',
            fields: {
              'Ticket Summary': '{{ai-message-support.summary}}',
              'Customer': '{{trigger.message.author.username}}',
              'Priority': '{{ai-message-support.priority}}',
              'Status': 'Open',
              'Channel': 'Discord'
            }
          },
          validationState: {
            missingRequired: ['baseId', 'tableName']
          }
        }
      },
      {
        id: 'discord-support-response',
        type: 'custom',
        position: { x: 200, y: 840 },
        data: {
          type: 'discord_action_send_message',
          title: 'Reply in Discord',
          description: 'Send an acknowledgement back to the user in Discord.',
          config: {
            webhookUrl: '',
            message: '{{ai-message-support.response_message}}',
            username: 'Support Bot'
          },
          validationState: {
            missingRequired: ['webhookUrl']
          }
        }
      },
      {
        id: 'ai-message-feedback',
        type: 'custom',
        position: { x: 750, y: 520 },
        data: {
          type: 'ai_message',
          title: 'Summarize Feedback',
          description: 'Extract feedback insight and sentiment from the message.',
          config: {
            model: 'gpt-4o-mini',
            apiSource: 'chainreact',
            temperature: 0.4,
            contextNodeIds: ['discord-trigger-1'],
            userPrompt: 'Customer feedback message: {{trigger.message.content}}. Extract the main idea and sentiment, and suggest a short acknowledgement.',
            outputFields: 'insight | Feedback insight\nsentiment | Sentiment\nacknowledgement | Acknowledgement message',
            includeRawOutput: false
          }
        }
      },
      {
        id: 'airtable-feedback-log',
        type: 'custom',
        position: { x: 750, y: 680 },
        data: {
          type: 'airtable_action_create_record',
          title: 'Log Feedback',
          description: 'Store product feedback in Airtable.',
          config: {
            baseId: '',
            tableName: '',
            fields: {
              'Feedback Insight': '{{ai-message-feedback.insight}}',
              'Sentiment': '{{ai-message-feedback.sentiment}}',
              'Customer': '{{trigger.message.author.username}}',
              'Source': 'Discord'
            }
          },
          validationState: {
            missingRequired: ['baseId', 'tableName']
          }
        }
      },
      {
        id: 'discord-feedback-response',
        type: 'custom',
        position: { x: 750, y: 840 },
        data: {
          type: 'discord_action_send_message',
          title: 'Acknowledge Feedback',
          description: 'Respond to the user thanking them for feedback.',
          config: {
            webhookUrl: '',
            message: '{{ai-message-feedback.acknowledgement}}',
            username: 'Feedback Bot'
          },
          validationState: {
            missingRequired: ['webhookUrl']
          }
        }
      },
      {
        id: 'ai-message-newsletter',
        type: 'custom',
        position: { x: 1300, y: 520 },
        data: {
          type: 'ai_message',
          title: 'Craft Newsletter Welcome',
          description: 'Prepare a welcome email for newsletter signups.',
          config: {
            model: 'gpt-4o-mini',
            apiSource: 'chainreact',
            temperature: 0.5,
            contextNodeIds: ['discord-trigger-1'],
            userPrompt: 'A Discord user asked about the newsletter: {{trigger.message.content}}. Draft a friendly welcome email body and extract their email if mentioned.',
            outputFields: 'welcome_email | Welcome email body\nextracted_email | Email address if present',
            includeRawOutput: true
          }
        }
      },
      {
        id: 'airtable-newsletter',
        type: 'custom',
        position: { x: 1300, y: 680 },
        data: {
          type: 'airtable_action_create_record',
          title: 'Add Newsletter Subscriber',
          description: 'Store the subscriber details in Airtable.',
          config: {
            baseId: '',
            tableName: '',
            fields: {
              'Name': '{{trigger.message.author.username}}',
              'Email': '{{ai-message-newsletter.extracted_email}}',
              'Source': 'Discord',
              'Status': 'Subscribed'
            }
          },
          validationState: {
            missingRequired: ['baseId', 'tableName']
          }
        }
      },
      {
        id: 'gmail-newsletter-welcome',
        type: 'custom',
        position: { x: 1300, y: 840 },
        data: {
          type: 'gmail_action_send_email',
          title: 'Send Welcome Email',
          description: 'Send a welcome email to the subscriber.',
          config: {
            to: '{{ai-message-newsletter.extracted_email}}',
            subject: 'Welcome to our newsletter!',
            body: '{{ai-message-newsletter.welcome_email}}',
            isHtml: false
          }
        }
      },
      {
        id: 'discord-general-log',
        type: 'custom',
        position: { x: 560, y: 1000 },
        data: {
          type: 'discord_action_send_message',
          title: 'General Log',
          description: 'Log general inquiries in a Discord channel.',
          config: {
            webhookUrl: '',
            message: 'General inquiry from {{trigger.message.author.username}}: {{trigger.message.content}}',
            username: 'Support Bot'
          },
          validationState: {
            missingRequired: ['webhookUrl']
          }
        }
      }
    ],
    connections: [
      { id: 'edge-main', source: 'discord-trigger-1', target: 'ai-router-helpdesk' },
      { id: 'edge-support-1', source: 'ai-router-helpdesk', target: 'ai-message-support', sourceHandle: 'support_request' },
      { id: 'edge-support-2', source: 'ai-message-support', target: 'airtable-support-ticket' },
      { id: 'edge-support-3', source: 'airtable-support-ticket', target: 'discord-support-response' },
      { id: 'edge-feedback-1', source: 'ai-router-helpdesk', target: 'ai-message-feedback', sourceHandle: 'feedback' },
      { id: 'edge-feedback-2', source: 'ai-message-feedback', target: 'airtable-feedback-log' },
      { id: 'edge-feedback-3', source: 'airtable-feedback-log', target: 'discord-feedback-response' },
      { id: 'edge-newsletter-1', source: 'ai-router-helpdesk', target: 'ai-message-newsletter', sourceHandle: 'newsletter_signup' },
      { id: 'edge-newsletter-2', source: 'ai-message-newsletter', target: 'airtable-newsletter' },
      { id: 'edge-newsletter-3', source: 'airtable-newsletter', target: 'gmail-newsletter-welcome' },
      { id: 'edge-general', source: 'ai-router-helpdesk', target: 'discord-general-log', sourceHandle: 'general' }
    ]
  },
  {
    name: 'Slack Customer Support System',
    description: 'Handle customer inquiries in Slack, categorize them, and route to appropriate teams',
    category: 'Customer Service',
    tags: ['slack', 'support', 'routing', 'categorization'],
    integrations: ['slack'],
    difficulty: 'intermediate',
    estimated_time: '15 mins',
    nodes: [
      {
        id: 'trigger-1',
        type: 'custom',
        position: { x: 80, y: 140 },
        data: {
          type: 'slack_trigger_new_message',
          title: 'New Support Request',
          config: {
            channel: '#support'
          },
          isTrigger: true,
          validationState: {
            missingRequired: ['channel']
          }
        }
      },
      {
        id: 'ai-router-slack',
        type: 'custom',
        position: { x: 320, y: 200 },
        data: {
          type: 'ai_router',
          title: 'Classify Support Request',
          config: {
            template: 'custom',
            systemPrompt: 'Classify the Slack message into technical, billing, account_access, or general. Return JSON with category and reasoning.',
            model: 'gpt-4o-mini',
            apiSource: 'chainreact',
            memory: 'workflow',
            outputPaths: [
              { id: 'technical', name: 'Technical', description: 'Send to engineering channel', color: '#3b82f6', condition: { type: 'ai_decision', minConfidence: 0.6 } },
              { id: 'billing', name: 'Billing', description: 'Handle billing questions', color: '#f59e0b', condition: { type: 'ai_decision', minConfidence: 0.6 } },
              { id: 'account', name: 'Account Access', description: 'Account or login help', color: '#10b981', condition: { type: 'ai_decision', minConfidence: 0.6 } },
              { id: 'general', name: 'General', description: 'Catch-all queue', color: '#6b7280', condition: { type: 'fallback' } }
            ],
            decisionMode: 'single',
            includeReasoning: true,
            temperature: 0.2,
            costLimit: 0.25
          }
        }
      },
      {
        id: 'slack-route-tech',
        type: 'custom',
        position: { x: 600, y: 80 },
        data: {
          type: 'slack_action_send_message',
          title: 'Notify Tech Team',
          config: {
            channel: '#tech-support',
            message: '🔧 Technical request from {{trigger.user.name}}: {{trigger.text}}'
          },
          needsConfiguration: true
        }
      },
      {
        id: 'slack-route-billing',
        type: 'custom',
        position: { x: 600, y: 200 },
        data: {
          type: 'slack_action_send_message',
          title: 'Notify Billing Team',
          config: {
            channel: '#billing-support',
            message: '💳 Billing inquiry from {{trigger.user.name}}: {{trigger.text}}'
          },
          needsConfiguration: true
        }
      },
      {
        id: 'slack-route-account',
        type: 'custom',
        position: { x: 600, y: 320 },
        data: {
          type: 'slack_action_send_message',
          title: 'Notify Account Team',
          config: {
            channel: '#account-access',
            message: '🔐 Account access issue for {{trigger.user.name}}: {{trigger.text}}'
          },
          needsConfiguration: true
        }
      },
      {
        id: 'slack-route-general',
        type: 'custom',
        position: { x: 600, y: 440 },
        data: {
          type: 'slack_action_send_message',
          title: 'Log General Inquiry',
          config: {
            channel: '#support-queue',
            message: '📝 General inquiry from {{trigger.user.name}}: {{trigger.text}}'
          },
          needsConfiguration: true
        }
      }
    ],
    connections: [
      { id: 'edge-slack-1', source: 'trigger-1', target: 'ai-router-slack' },
      { id: 'edge-slack-2', source: 'ai-router-slack', target: 'slack-route-tech', sourceHandle: 'technical' },
      { id: 'edge-slack-3', source: 'ai-router-slack', target: 'slack-route-billing', sourceHandle: 'billing' },
      { id: 'edge-slack-4', source: 'ai-router-slack', target: 'slack-route-account', sourceHandle: 'account' },
      { id: 'edge-slack-5', source: 'ai-router-slack', target: 'slack-route-general', sourceHandle: 'general' }
    ]
  },
  {
    name: 'Social Media Engagement Tracker',
    description: 'Track mentions and engagement across social platforms and notify team',
    category: 'Social Media',
    tags: ['monitoring', 'engagement', 'analytics', 'mentions'],
    integrations: ['twitter', 'slack'],
    difficulty: 'intermediate',
    estimated_time: '12 mins',
    nodes: [
      {
        id: 'trigger-1',
        type: 'custom',
        position: { x: 80, y: 180 },
        data: {
          type: 'twitter_trigger_new_mention',
          title: 'Brand Mention',
          config: {},
          isTrigger: true,
          needsConfiguration: true
        }
      },
      {
        id: 'ai-router-sentiment',
        type: 'custom',
        position: { x: 320, y: 200 },
        data: {
          type: 'ai_router',
          title: 'Classify Sentiment',
          config: {
            template: 'custom',
            systemPrompt: 'Classify the tweet sentiment into negative, positive, or neutral. Return JSON with category and reasoning.',
            model: 'gpt-4o-mini',
            apiSource: 'chainreact',
            memory: 'workflow',
            outputPaths: [
              { id: 'negative', name: 'Negative', description: 'Escalate to team', color: '#ef4444', condition: { type: 'ai_decision', minConfidence: 0.55 } },
              { id: 'positive', name: 'Positive', description: 'Share wins', color: '#22c55e', condition: { type: 'ai_decision', minConfidence: 0.55 } },
              { id: 'neutral', name: 'Neutral', description: 'Monitor', color: '#6b7280', condition: { type: 'fallback' } }
            ],
            decisionMode: 'single',
            includeReasoning: true,
            temperature: 0.2,
            costLimit: 0.2
          }
        }
      },
      {
        id: 'slack-negative-alert',
        type: 'custom',
        position: { x: 600, y: 80 },
        data: {
          type: 'slack_action_send_message',
          title: 'Alert Team',
          config: {
            channel: '#social-alerts',
            message: '⚠️ Negative mention detected by @{{trigger.username}}: {{trigger.text}}'
          },
          needsConfiguration: true
        }
      },
      {
        id: 'slack-positive-highlight',
        type: 'custom',
        position: { x: 600, y: 220 },
        data: {
          type: 'slack_action_send_message',
          title: 'Share Positive Mention',
          config: {
            channel: '#social-highlights',
            message: '🎉 Positive shout-out from @{{trigger.username}}: {{trigger.text}}'
          },
          needsConfiguration: true
        }
      },
      {
        id: 'slack-neutral-log',
        type: 'custom',
        position: { x: 600, y: 360 },
        data: {
          type: 'slack_action_send_message',
          title: 'Log Neutral Mention',
          config: {
            channel: '#social-monitoring',
            message: 'ℹ️ Mention to monitor: {{trigger.text}}'
          },
          needsConfiguration: true
        }
      }
    ],
    connections: [
      { id: 'social-edge-1', source: 'trigger-1', target: 'ai-router-sentiment' },
      { id: 'social-edge-2', source: 'ai-router-sentiment', target: 'slack-negative-alert', sourceHandle: 'negative' },
      { id: 'social-edge-3', source: 'ai-router-sentiment', target: 'slack-positive-highlight', sourceHandle: 'positive' },
      { id: 'social-edge-4', source: 'ai-router-sentiment', target: 'slack-neutral-log', sourceHandle: 'neutral' }
    ]
  }
]

async function upsertTemplate(template) {
  const { data: existingTemplates, error: selectError } = await supabase
    .from('templates')
    .select('id')
    .eq('name', template.name)
    .eq('is_predefined', true)

  if (selectError) {
    throw selectError
  }

  if (!existingTemplates || existingTemplates.length === 0) {
    const payload = {
      name: template.name,
      description: template.description,
      category: template.category,
      tags: template.tags,
      integrations: template.integrations,
      difficulty: template.difficulty,
      estimated_time: template.estimated_time,
      is_public: true,
      is_predefined: true,
      nodes: template.nodes,
      connections: template.connections,
      workflow_json: { nodes: [], edges: [] }
    }

    const { error: insertError } = await supabase
      .from('templates')
      .insert(payload)

    if (insertError) {
      throw insertError
    }

    console.log(`✅ Inserted template: ${template.name}`)
  } else {
    const templateId = existingTemplates[0].id

    const payload = {
      description: template.description,
      category: template.category,
      tags: template.tags,
      integrations: template.integrations,
      difficulty: template.difficulty,
      estimated_time: template.estimated_time,
      nodes: template.nodes,
      connections: template.connections,
      workflow_json: { nodes: [], edges: [] }
    }

    const { error: updateError } = await supabase
      .from('templates')
      .update(payload)
      .eq('id', templateId)

    if (updateError) {
      throw updateError
    }

    console.log(`🔁 Updated template: ${template.name}`)
  }
}

async function main() {
  try {
    for (const template of templates) {
      await upsertTemplate(template)
    }
    console.log('\n✨ Template updates complete!')
  } catch (error) {
    console.error('❌ Failed to update templates:', error)
    process.exit(1)
  }
}

main()
