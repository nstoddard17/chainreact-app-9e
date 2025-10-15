import type {
  AirtableFieldSchema,
  AirtableTableSchema,
  TemplateIntegrationSetup,
} from '@/types/templateSetup'

export interface PredefinedTemplate {
  id: string
  name: string
  description: string
  category: string
  tags: string[]
  integrations: string[]
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  estimatedTime: string // e.g., "5 mins", "15 mins"
  workflow_json: {
    nodes: any[]
    edges: any[]
  }
  airtableSetup?: {
    baseName: string // Suggested base name
    copyUrl?: string
    tables: AirtableTableSchema[]
  }
  integrationSetups?: TemplateIntegrationSetup[]
}

export const predefinedTemplates: PredefinedTemplate[] = [
  // ============== AI AGENT TESTING TEMPLATES ==============

  // AI Agent Complete Test Workflow
  {
    id: "ai-agent-test-workflow",
    name: "AI Agent Test Workflow - Customer Service",
    description: "Classifies Discord support messages with AI, then creates Airtable records, sends notifications, or emails based on the route.",
    category: "AI Automation",
    tags: ["ai-router", "ai-message", "airtable", "discord", "gmail"],
    integrations: ["airtable", "discord", "gmail"],
    difficulty: "intermediate",
    estimatedTime: "6 mins",
    workflow_json: {
      nodes: [
        {
          id: "discord-trigger-1",
          type: "discord_trigger_new_message",
          position: { x: 100, y: 300 },
          data: {
            type: "discord_trigger_new_message",
            title: "New Discord Message",
            config: {
              channelId: "",
              includeBot: false
            },
            isTrigger: true,
            needsConfiguration: true
          }
        },
        {
          id: "ai-router-helpdesk",
          type: "ai_router",
          position: { x: 380, y: 300 },
          data: {
            type: "ai_router",
            title: "Route Customer Request",
            config: {
              template: "custom",
              systemPrompt: "You are a customer support triage bot. Classify the incoming Discord message into one of: support_request, feedback, newsletter_signup. Provide a short reason and confidence.",
              model: "gpt-4o-mini",
              apiSource: "chainreact",
              memory: "workflow",
              outputPaths: [
                { id: "support_request", name: "Support Request", description: "Technical help needed", color: "#ef4444", condition: { type: "ai_decision", minConfidence: 0.6 } },
                { id: "feedback", name: "Feedback", description: "Product feedback or ideas", color: "#3b82f6", condition: { type: "ai_decision", minConfidence: 0.6 } },
                { id: "newsletter_signup", name: "Newsletter Signup", description: "Signup or marketing interest", color: "#10b981", condition: { type: "ai_decision", minConfidence: 0.6 } },
                { id: "general", name: "General", description: "Everything else", color: "#6b7280", condition: { type: "fallback" } }
              ],
              decisionMode: "single",
              includeReasoning: true,
              temperature: 0.2,
              maxRetries: 1,
              timeout: 30,
              costLimit: 0.5
            },
            needsConfiguration: false
          }
        },
        {
          id: "ai-message-support",
          type: "ai_message",
          position: { x: 620, y: 120 },
          data: {
            type: "ai_message",
            title: "Summarize Support Request",
            config: {
              model: "gpt-4o-mini",
              apiSource: "chainreact",
              temperature: 0.3,
              contextNodeIds: ["discord-trigger-1"],
              userPrompt: "Discord support request: {{discord-trigger-1.content}}. Summarize the problem, suggest a priority (Low/Medium/High), and craft a short acknowledgement response.",
              outputFields: "summary | Problem summary\npriority | Priority level\nresponse_message | Short acknowledgement message",
              includeRawOutput: false,
              memoryNotes: "Use prior support history if available."
            },
            needsConfiguration: false
          }
        },
        {
          id: "airtable-support-ticket",
          type: "airtable_action_create_record",
          position: { x: 860, y: 120 },
          data: {
            type: "airtable_action_create_record",
            title: "Create Support Ticket",
            config: {
              baseId: "",
              tableName: "",
              fields: {
                "Ticket Summary": "{{ai-message-support.summary}}",
                "Priority": "{{ai-message-support.priority}}",
                "Status": "Open",
                "Channel": "{{discord-trigger-1.channelName}}"
              }
            },
            needsConfiguration: true
          }
        },
        {
          id: "discord-support-response",
          type: "discord_action_send_message",
          position: { x: 1100, y: 120 },
          data: {
            type: "discord_action_send_message",
            title: "Reply in Discord",
            config: {
              webhookUrl: "",
              message: "{{ai-message-support.response_message}}",
              username: "Support Bot"
            },
            needsConfiguration: true
          }
        },
        {
          id: "ai-message-feedback",
          type: "ai_message",
          position: { x: 620, y: 300 },
          data: {
            type: "ai_message",
            title: "Summarize Feedback",
            config: {
              model: "gpt-4o-mini",
              apiSource: "chainreact",
              temperature: 0.4,
              contextNodeIds: ["discord-trigger-1"],
              userPrompt: "Customer feedback message: {{discord-trigger-1.content}}. Extract the main idea and sentiment, and suggest a short acknowledgement.",
              outputFields: "insight | Feedback insight\nsentiment | Sentiment\nacknowledgement | Acknowledgement message",
              includeRawOutput: false
            },
            needsConfiguration: false
          }
        },
        {
          id: "airtable-feedback-log",
          type: "airtable_action_create_record",
          position: { x: 860, y: 300 },
          data: {
            type: "airtable_action_create_record",
            title: "Log Feedback",
            config: {
              baseId: "",
              tableName: "",
              fields: {
                "Feedback Insight": "{{ai-message-feedback.insight}}",
                "Sentiment": "{{ai-message-feedback.sentiment}}",
                "Source": "Discord"
              }
            },
            needsConfiguration: true
          }
        },
        {
          id: "discord-feedback-response",
          type: "discord_action_send_message",
          position: { x: 1100, y: 300 },
          data: {
            type: "discord_action_send_message",
            title: "Acknowledge Feedback",
            config: {
              webhookUrl: "",
              message: "{{ai-message-feedback.acknowledgement}}",
              username: "Feedback Bot"
            },
            needsConfiguration: true
          }
        },
        {
          id: "ai-message-newsletter",
          type: "ai_message",
          position: { x: 620, y: 480 },
          data: {
            type: "ai_message",
            title: "Craft Newsletter Welcome",
            config: {
              model: "gpt-4o-mini",
              apiSource: "chainreact",
              temperature: 0.5,
              contextNodeIds: ["discord-trigger-1"],
              userPrompt: "A Discord user asked about the newsletter: {{discord-trigger-1.content}}. Draft a friendly welcome email body and extract their email if mentioned.",
              outputFields: "welcome_email | Welcome email body\nextracted_email | Email address if present",
              includeRawOutput: true
            },
            needsConfiguration: false
          }
        },
        {
          id: "airtable-newsletter",
          type: "airtable_action_create_record",
          position: { x: 860, y: 480 },
          data: {
            type: "airtable_action_create_record",
            title: "Add Newsletter Subscriber",
            config: {
              baseId: "",
              tableName: "",
              fields: {
                "Name": "",
                "Email": "{{ai-message-newsletter.extracted_email}}",
                "Source": "Discord",
                "Status": "Subscribed"
              }
            },
            needsConfiguration: true
          }
        },
        {
          id: "gmail-newsletter-welcome",
          type: "gmail_action_send_email",
          position: { x: 1100, y: 480 },
          data: {
            type: "gmail_action_send_email",
            title: "Send Welcome Email",
            config: {
              to: "{{ai-message-newsletter.extracted_email}}",
              subject: "Welcome to our newsletter!",
              body: "{{ai-message-newsletter.welcome_email}}",
              isHtml: false
            },
            needsConfiguration: true
          }
        },
        {
          id: "discord-general-log",
          type: "discord_action_send_message",
          position: { x: 860, y: 620 },
          data: {
            type: "discord_action_send_message",
            title: "General Log",
            config: {
              webhookUrl: "",
              message: "General inquiry from {{discord-trigger-1.authorName}}: {{discord-trigger-1.content}}",
              username: "Support Bot"
            },
            needsConfiguration: true
          }
        }
      ],
      edges: [
        { id: "edge-main-1", source: "discord-trigger-1", target: "ai-router-helpdesk" },
        { id: "edge-support-1", source: "ai-router-helpdesk", target: "ai-message-support", sourceHandle: "support_request" },
        { id: "edge-support-2", source: "ai-message-support", target: "airtable-support-ticket" },
        { id: "edge-support-3", source: "airtable-support-ticket", target: "discord-support-response" },
        { id: "edge-feedback-1", source: "ai-router-helpdesk", target: "ai-message-feedback", sourceHandle: "feedback" },
        { id: "edge-feedback-2", source: "ai-message-feedback", target: "airtable-feedback-log" },
        { id: "edge-feedback-3", source: "airtable-feedback-log", target: "discord-feedback-response" },
        { id: "edge-newsletter-1", source: "ai-router-helpdesk", target: "ai-message-newsletter", sourceHandle: "newsletter_signup" },
        { id: "edge-newsletter-2", source: "ai-message-newsletter", target: "airtable-newsletter" },
        { id: "edge-newsletter-3", source: "airtable-newsletter", target: "gmail-newsletter-welcome" },
        { id: "edge-general-1", source: "ai-router-helpdesk", target: "discord-general-log", sourceHandle: "general" }
      ]
    },
    airtableSetup: {
      baseName: "Customer Service Automation",
      copyUrl: "https://airtable.com/appGadmc5iofbblAF/shrA0WFxEyMspzon5/tbltP3UGYxaQW5y8b/viw9lF6mS4W38LxFv",
      tables: [
        {
          tableName: "Support Tickets",
          description: "Tracks support requests routed by AI",
          fields: [
            {
              name: "Ticket Summary",
              type: "longText",
              description: "AI-generated summary of the support request"
            },
            {
              name: "Priority",
              type: "singleSelect",
              options: ["Low", "Medium", "High"],
              description: "Priority level assigned by AI"
            },
            {
              name: "Status",
              type: "singleSelect",
              options: ["Open", "In Progress", "Resolved", "Closed"],
              description: "Current status of the ticket"
            },
            {
              name: "Channel",
              type: "singleLineText",
              description: "Source channel (e.g., Discord channel name)"
            }
          ]
        },
          {
            tableName: "Feedback Log",
            description: "Captures customer feedback messages",
            fields: [
              {
                name: "Feedback Insight",
                type: "longText",
                description: "AI-extracted main insight from feedback"
              },
              {
                name: "Feedback Summary",
                type: "longText",
                description: "Short summary of the feedback message"
              },
              {
                name: "Customer",
                type: "singleLineText",
                description: "Name or handle of the customer who shared the feedback"
              },
              {
                name: "Sentiment",
                type: "singleSelect",
                options: ["Positive", "Neutral", "Negative"],
                description: "Sentiment analysis (e.g., Positive, Negative, Neutral)"
              },
              {
                name: "Confidence",
                type: "number",
                description: "General AI confidence score for this classification"
              },
              {
                name: "Source",
                type: "singleLineText",
                description: "Origin of feedback (e.g., Discord)"
              }
            ]
          },
        {
          tableName: "Newsletter Subscribers",
          description: "Manages newsletter subscription requests",
          fields: [
            {
              name: "Name",
              type: "singleLineText",
              description: "Subscriber's name"
            },
            {
              name: "Email",
              type: "email",
              description: "Subscriber's email address"
            },
            {
              name: "Source",
              type: "singleLineText",
              description: "Where the signup came from (e.g., Discord)"
            },
            {
              name: "Status",
              type: "singleSelect",
              options: ["Subscribed", "Unsubscribed", "Pending"],
              description: "Current subscription status"
            }
          ]
        }
      ]
    },
    integrationSetups: [
      {
        type: "airtable",
        baseName: "Customer Service Automation",
        copyUrl: "https://airtable.com/appGadmc5iofbblAF/shrA0WFxEyMspzon5/tbltP3UGYxaQW5y8b/viw9lF6mS4W38LxFv",
        instructions: [
          "Click \"Duplicate Template Base\" below to open Airtable, then press Copy Base at the top of the page and choose the workspace that should own it.",
          "Confirm the Support Tickets, Feedback Log, and Newsletter Subscribers tables appear in the copied base.",
          "Import the CSV files below (or rebuild the fields manually) before you run the workflow."
        ],
        tables: [
          {
            tableName: "Support Tickets",
            description: "Tracks support requests routed by AI",
            fields: [
              {
                name: "Ticket Summary",
                type: "longText",
                description: "AI-generated summary of the support request"
              },
              {
                name: "Priority",
                type: "singleSelect",
                options: ["Low", "Medium", "High"],
                description: "Priority level assigned by AI"
              },
              {
                name: "Status",
                type: "singleSelect",
                options: ["Open", "In Progress", "Resolved", "Closed"],
                description: "Current status of the ticket"
              },
              {
                name: "Channel",
                type: "singleLineText",
                description: "Source channel (e.g., Discord channel name)"
              }
            ]
          },
          {
            tableName: "Feedback Log",
            description: "Captures customer feedback messages",
            fields: [
              {
                name: "Feedback Insight",
                type: "longText",
                description: "AI-extracted main insight from feedback"
              },
              {
                name: "Feedback Summary",
                type: "longText",
                description: "Short summary of the feedback message"
              },
              {
                name: "Customer",
                type: "singleLineText",
                description: "Name or handle of the customer who shared the feedback"
              },
              {
                name: "Sentiment",
                type: "singleSelect",
                options: ["Positive", "Neutral", "Negative"],
                description: "Sentiment analysis (e.g., Positive, Negative, Neutral)"
              },
              {
                name: "Confidence",
                type: "number",
                description: "General AI confidence score for this classification"
              },
              {
                name: "Source",
                type: "singleLineText",
                description: "Origin of feedback (e.g., Discord)"
              }
            ]
          },
          {
            tableName: "Newsletter Subscribers",
            description: "Manages newsletter subscription requests",
            fields: [
              {
                name: "Name",
                type: "singleLineText",
                description: "Subscriber's name"
              },
              {
                name: "Email",
                type: "email",
                description: "Subscriber's email address"
              },
              {
                name: "Source",
                type: "singleLineText",
                description: "Where the signup came from (e.g., Discord)"
              },
              {
                name: "Status",
                type: "singleSelect",
                options: ["Subscribed", "Unsubscribed", "Pending"],
                description: "Current subscription status"
              }
            ]
          }
        ]
      }
    ]
  },

  // ============== CUSTOMER SERVICE TEMPLATES ==============

  // Discord Customer Support
  {
    id: "discord-customer-support",
    name: "Discord Customer Support Bot",
    description: "Automatically respond to support requests in Discord, create tickets, and escalate to team members",
    category: "Customer Service",
    tags: ["discord", "support", "automation", "tickets"],
    integrations: ["discord"],
    difficulty: "intermediate",
    estimatedTime: "10 mins",
    workflow_json: {
      nodes: [
        {
          id: "trigger-1",
          type: "discord_trigger_new_message",
          position: { x: 100, y: 100 },
          data: {
            name: "New Discord Message",
            config: {
              channel: "{{DISCORD_CHANNEL_ID}}",
              keywords: ["help", "support", "issue", "problem", "bug"]
            }
          }
        },
        {
          id: "action-1",
          type: "discord_action_send_message",
          position: { x: 300, y: 100 },
          data: {
            name: "Acknowledge Request",
            config: {
              message: "Thank you for reaching out! A support agent will assist you shortly. Ticket #{{RANDOM_ID}} has been created."
            }
          }
        },
        {
          id: "action-2",
          type: "notion_action_create_page",
          position: { x: 500, y: 100 },
          data: {
            name: "Create Support Ticket",
            config: {
              database: "{{NOTION_TICKETS_DB}}",
              properties: {
                title: "Support Request from {{trigger.username}}",
                status: "Open",
                priority: "Medium",
                message: "{{trigger.message}}"
              }
            }
          }
        }
      ],
      edges: [
        { id: "e1", source: "trigger-1", target: "action-1" },
        { id: "e2", source: "action-1", target: "action-2" }
      ]
    }
  },

  // Slack Customer Support
  {
    id: "slack-customer-support",
    name: "Slack Customer Support System",
    description: "Handle customer inquiries in Slack, categorize them, and route to appropriate teams",
    category: "Customer Service",
    tags: ["slack", "support", "routing", "categorization"],
    integrations: ["slack"],
    difficulty: "intermediate",
    estimatedTime: "15 mins",
    workflow_json: {
      nodes: [
        {
          id: "trigger-1",
          type: "slack_trigger_new_message",
          position: { x: 100, y: 120 },
          data: {
            type: "slack_trigger_new_message",
            title: "New Support Request",
            config: {
              channel: "#support"
            },
            isTrigger: true,
            needsConfiguration: true
          }
        },
        {
          id: "ai-router-slack",
          type: "ai_router",
          position: { x: 320, y: 160 },
          data: {
            type: "ai_router",
            title: "Classify Support Request",
            config: {
              template: "custom",
              systemPrompt: "Classify the Slack message into technical, billing, account_access, or general. Return JSON with category and reasoning.",
              model: "gpt-4o-mini",
              apiSource: "chainreact",
              memory: "workflow",
              outputPaths: [
                { id: "technical", name: "Technical", description: "Send to engineering", color: "#3b82f6", condition: { type: "ai_decision", minConfidence: 0.6 } },
                { id: "billing", name: "Billing", description: "Payment or billing issues", color: "#f59e0b", condition: { type: "ai_decision", minConfidence: 0.6 } },
                { id: "account", name: "Account Access", description: "Login or access problem", color: "#10b981", condition: { type: "ai_decision", minConfidence: 0.6 } },
                { id: "general", name: "General", description: "Catch-all", color: "#6b7280", condition: { type: "fallback" } }
              ],
              decisionMode: "single",
              includeReasoning: true,
              temperature: 0.2,
              costLimit: 0.3
            },
            needsConfiguration: false
          }
        },
        {
          id: "slack-route-tech",
          type: "slack_action_send_message",
          position: { x: 560, y: 40 },
          data: {
            type: "slack_action_send_message",
            title: "Notify Tech Team",
            config: {
              channel: "#tech-support",
              message: "🔧 Technical request from {{trigger.user.name}}: {{trigger.text}}"
            },
            needsConfiguration: true
          }
        },
        {
          id: "slack-route-billing",
          type: "slack_action_send_message",
          position: { x: 560, y: 160 },
          data: {
            type: "slack_action_send_message",
            title: "Notify Billing Team",
            config: {
              channel: "#billing-support",
              message: "💳 Billing inquiry from {{trigger.user.name}}: {{trigger.text}}"
            },
            needsConfiguration: true
          }
        },
        {
          id: "slack-route-account",
          type: "slack_action_send_message",
          position: { x: 560, y: 280 },
          data: {
            type: "slack_action_send_message",
            title: "Notify Account Team",
            config: {
              channel: "#account-access",
              message: "🔐 Account access issue for {{trigger.user.name}}: {{trigger.text}}"
            },
            needsConfiguration: true
          }
        },
        {
          id: "slack-route-general",
          type: "slack_action_send_message",
          position: { x: 560, y: 400 },
          data: {
            type: "slack_action_send_message",
            title: "Log General Inquiry",
            config: {
              channel: "#support-queue",
              message: "📝 General inquiry from {{trigger.user.name}}: {{trigger.text}}"
            },
            needsConfiguration: true
          }
        }
      ],
      edges: [
        { id: "e1", source: "trigger-1", target: "ai-router-slack" },
        { id: "e2", source: "ai-router-slack", target: "slack-route-tech", sourceHandle: "technical" },
        { id: "e3", source: "ai-router-slack", target: "slack-route-billing", sourceHandle: "billing" },
        { id: "e4", source: "ai-router-slack", target: "slack-route-account", sourceHandle: "account" },
        { id: "e5", source: "ai-router-slack", target: "slack-route-general", sourceHandle: "general" }
      ]
    }
  },

  // Teams Customer Support
  {
    id: "teams-customer-support",
    name: "Microsoft Teams Support Hub",
    description: "Manage support requests in Teams with automatic ticket creation and status updates",
    category: "Customer Service",
    tags: ["teams", "microsoft", "support", "tickets"],
    integrations: ["teams", "airtable"],
    difficulty: "intermediate",
    estimatedTime: "12 mins",
    workflow_json: {
      nodes: [
        {
          id: "trigger-1",
          type: "teams_trigger_new_message",
          position: { x: 100, y: 100 },
          data: {
            name: "Support Channel Message",
            config: {
              channel: "Support Requests"
            }
          }
        },
        {
          id: "action-1",
          type: "teams_action_send_message",
          position: { x: 300, y: 100 },
          data: {
            name: "Confirm Receipt",
            config: {
              message: "✅ We've received your request and will respond within 2 hours."
            }
          }
        },
        {
          id: "action-2",
          type: "airtable_action_create_record",
          position: { x: 500, y: 100 },
          data: {
            name: "Log Ticket",
            config: {
              table: "Support Tickets",
              fields: {
                "Customer": "{{trigger.user}}",
                "Issue": "{{trigger.message}}",
                "Status": "Open",
                "Created": "{{NOW}}"
              }
            }
          }
        }
      ],
      edges: [
        { id: "e1", source: "trigger-1", target: "action-1" },
        { id: "e2", source: "action-1", target: "action-2" }
      ]
    },
    airtableSetup: {
      baseName: "Teams Support Desk",
      copyUrl: "https://airtable.com/appGadmc5iofbblAF/shrA0WFxEyMspzon5/tbltP3UGYxaQW5y8b/viw9lF6mS4W38LxFv",
      tables: [
        {
          tableName: "Support Tickets",
          description: "Track incoming Microsoft Teams support conversations",
          fields: [
            {
              name: "Customer",
              type: "singleLineText",
              description: "Name of the teammate or customer asking for help"
            },
            {
              name: "Issue",
              type: "longText",
              description: "Full message content captured from Teams"
            },
            {
              name: "Status",
              type: "singleSelect",
              options: ["Open", "In Progress", "Resolved", "Closed"],
              description: "Ticket progress managed by the support team"
            },
            {
              name: "Created",
              type: "date",
              description: "When the ticket was created in Airtable"
            }
          ]
        }
      ]
    },
    integrationSetups: [
      {
        type: "airtable",
        baseName: "Teams Support Desk",
        copyUrl: "https://airtable.com/appGadmc5iofbblAF/shrA0WFxEyMspzon5/tbltP3UGYxaQW5y8b/viw9lF6mS4W38LxFv",
        instructions: [
          "Click \"Duplicate Template Base\" below to open Airtable, then press Copy Base at the top of the page and choose the workspace that should own it.",
          "Confirm the Support Tickets table is in the copied base with the fields listed below.",
          "Import the CSV file below (or rebuild the fields manually) before you run the workflow."
        ],
        tables: [
          {
            tableName: "Support Tickets",
            description: "Track incoming Microsoft Teams support conversations",
            fields: [
              {
                name: "Customer",
                type: "singleLineText",
                description: "Name of the teammate or customer asking for help"
              },
              {
                name: "Issue",
                type: "longText",
                description: "Full message content captured from Teams"
              },
              {
                name: "Status",
                type: "singleSelect",
                options: ["Open", "In Progress", "Resolved", "Closed"],
                description: "Ticket progress managed by the support team"
              },
              {
                name: "Created",
                type: "date",
                description: "When the ticket was created in Airtable"
              }
            ]
          }
        ]
      }
    ]
  },

  // ============== SALES & CRM TEMPLATES ==============

  // Lead Nurturing Pipeline
  {
    id: "lead-nurturing-pipeline",
    name: "Automated Lead Nurturing",
    description: "Automatically nurture leads with personalized email sequences based on their engagement",
    category: "Sales & CRM",
    tags: ["sales", "email", "nurturing", "automation"],
    integrations: ["gmail", "hubspot"],
    difficulty: "advanced",
    estimatedTime: "20 mins",
    workflow_json: {
      nodes: [
        {
          id: "trigger-1",
          type: "hubspot_trigger_new_contact",
          position: { x: 100, y: 100 },
          data: {
            name: "New Lead Added",
            config: {
              list: "New Leads"
            }
          }
        },
        {
          id: "action-1",
          type: "gmail_action_send_email",
          position: { x: 300, y: 100 },
          data: {
            name: "Welcome Email",
            config: {
              to: "{{trigger.email}}",
              subject: "Welcome to {{COMPANY_NAME}}!",
              body: "Hi {{trigger.firstName}}, thank you for your interest..."
            }
          }
        },
        {
          id: "delay-1",
          type: "logic_delay",
          position: { x: 500, y: 100 },
          data: {
            name: "Wait 3 Days",
            config: {
              delay: 259200 // 3 days in seconds
            }
          }
        },
        {
          id: "action-2",
          type: "gmail_action_send_email",
          position: { x: 700, y: 100 },
          data: {
            name: "Follow-up Email",
            config: {
              to: "{{trigger.email}}",
              subject: "Quick question for you",
              body: "Hi {{trigger.firstName}}, I wanted to follow up..."
            }
          }
        }
      ],
      edges: [
        { id: "e1", source: "trigger-1", target: "action-1" },
        { id: "e2", source: "action-1", target: "delay-1" },
        { id: "e3", source: "delay-1", target: "action-2" }
      ]
    }
  },

  // Deal Stage Automation
  {
    id: "deal-stage-automation",
    name: "Deal Stage Automation",
    description: "Automatically update deal stages and notify team members when deals progress",
    category: "Sales & CRM",
    tags: ["crm", "deals", "pipeline", "notifications"],
    integrations: ["hubspot", "slack"],
    difficulty: "intermediate",
    estimatedTime: "15 mins",
    workflow_json: {
      nodes: [
        {
          id: "trigger-1",
          type: "hubspot_trigger_deal_updated",
          position: { x: 100, y: 100 },
          data: {
            name: "Deal Stage Changed",
            config: {
              property: "dealstage"
            }
          }
        },
        {
          id: "condition-1",
          type: "logic_condition",
          position: { x: 300, y: 100 },
          data: {
            name: "Check Stage",
            config: {
              conditions: [
                { field: "{{trigger.dealstage}}", operator: "equals", value: "closedwon" }
              ]
            }
          }
        },
        {
          id: "action-1",
          type: "slack_action_send_message",
          position: { x: 500, y: 50 },
          data: {
            name: "Celebrate Win",
            config: {
              channel: "#sales-wins",
              message: "🎉 Deal closed! {{trigger.dealname}} - ${{trigger.amount}}"
            }
          }
        },
        {
          id: "action-2",
          type: "hubspot_action_create_task",
          position: { x: 500, y: 150 },
          data: {
            name: "Create Onboarding Task",
            config: {
              title: "Start onboarding for {{trigger.dealname}}",
              assignedTo: "{{trigger.owner}}"
            }
          }
        }
      ],
      edges: [
        { id: "e1", source: "trigger-1", target: "condition-1" },
        { id: "e2", source: "condition-1", target: "action-1", sourceHandle: "true" },
        { id: "e3", source: "condition-1", target: "action-2", sourceHandle: "true" }
      ]
    }
  },

  // ============== SOCIAL MEDIA TEMPLATES ==============

  // Cross-Platform Content Publishing
  {
    id: "cross-platform-publishing",
    name: "Cross-Platform Content Publisher",
    description: "Publish content across multiple social media platforms simultaneously",
    category: "Social Media",
    tags: ["social", "publishing", "content", "multi-platform"],
    integrations: ["twitter", "facebook", "linkedin", "instagram"],
    difficulty: "beginner",
    estimatedTime: "8 mins",
    workflow_json: {
      nodes: [
        {
          id: "trigger-1",
          type: "schedule_trigger",
          position: { x: 100, y: 100 },
          data: {
            name: "Daily Post Schedule",
            config: {
              cron: "0 9 * * *" // 9 AM daily
            }
          }
        },
        {
          id: "action-1",
          type: "google_sheets_action_get_row",
          position: { x: 300, y: 100 },
          data: {
            name: "Get Today's Content",
            config: {
              spreadsheet: "{{CONTENT_CALENDAR_ID}}",
              sheet: "Posts",
              row: "{{TODAY_ROW}}"
            }
          }
        },
        {
          id: "action-2",
          type: "twitter_action_post_tweet",
          position: { x: 500, y: 50 },
          data: {
            name: "Post to Twitter",
            config: {
              text: "{{action-1.content}}"
            }
          }
        },
        {
          id: "action-3",
          type: "facebook_action_create_post",
          position: { x: 500, y: 150 },
          data: {
            name: "Post to Facebook",
            config: {
              message: "{{action-1.content}}",
              page: "{{FACEBOOK_PAGE_ID}}"
            }
          }
        },
        {
          id: "action-4",
          type: "linkedin_action_share_update",
          position: { x: 500, y: 250 },
          data: {
            name: "Post to LinkedIn",
            config: {
              text: "{{action-1.content}}"
            }
          }
        }
      ],
      edges: [
        { id: "e1", source: "trigger-1", target: "action-1" },
        { id: "e2", source: "action-1", target: "action-2" },
        { id: "e3", source: "action-1", target: "action-3" },
        { id: "e4", source: "action-1", target: "action-4" }
      ]
    },
    integrationSetups: [
      {
        type: "google_sheets",
        spreadsheetName: "Social Media Content Calendar",
        instructions: [
          "Download the sample CSV file and import it into a new Google Sheet named Social Media Content Calendar.",
          "Ensure the sheet is titled Posts and the header row remains unchanged so the workflow can map fields correctly.",
          "Share the sheet with the Google account connected to ChainReact (if required) and paste the sheet ID in the Google Sheets node configuration."
        ],
        sampleSheets: [
          {
            sheetName: "Posts",
            description: "Required columns with example social content that the workflow will publish",
            downloadUrl: "/setup-resources/google-sheets/cross-platform-content.csv"
          }
        ],
        resources: [
          {
            name: "Import CSV instructions",
            description: "Google Sheets guide on importing CSV files",
            url: "https://support.google.com/docs/answer/40608",
            type: "documentation"
          }
        ]
      }
    ]
  },

  // Social Media Engagement Monitor
  {
    id: "social-engagement-monitor",
    name: "Social Media Engagement Tracker",
    description: "Track mentions and engagement across social platforms and notify team",
    category: "Social Media",
    tags: ["monitoring", "engagement", "analytics", "mentions"],
    integrations: ["twitter", "slack"],
    difficulty: "intermediate",
    estimatedTime: "12 mins",
    workflow_json: {
      nodes: [
        {
          id: "trigger-1",
          type: "twitter_trigger_new_mention",
          position: { x: 100, y: 160 },
          data: {
            type: "twitter_trigger_new_mention",
            title: "Brand Mention",
            config: {},
            isTrigger: true,
            needsConfiguration: true
          }
        },
        {
          id: "ai-router-sentiment",
          type: "ai_router",
          position: { x: 320, y: 180 },
          data: {
            type: "ai_router",
            title: "Classify Sentiment",
            config: {
              template: "custom",
              systemPrompt: "Classify the tweet sentiment into negative, positive, or neutral. Return JSON with category and reasoning.",
              model: "gpt-4o-mini",
              apiSource: "chainreact",
              memory: "workflow",
              outputPaths: [
                { id: "negative", name: "Negative", description: "Escalate to team", color: "#ef4444", condition: { type: "ai_decision", minConfidence: 0.55 } },
                { id: "positive", name: "Positive", description: "Share wins", color: "#22c55e", condition: { type: "ai_decision", minConfidence: 0.55 } },
                { id: "neutral", name: "Neutral", description: "Monitor", color: "#6b7280", condition: { type: "fallback" } }
              ],
              decisionMode: "single",
              includeReasoning: true,
              temperature: 0.2,
              costLimit: 0.2
            },
            needsConfiguration: false
          }
        },
        {
          id: "slack-negative-alert",
          type: "slack_action_send_message",
          position: { x: 560, y: 60 },
          data: {
            type: "slack_action_send_message",
            title: "Alert Team",
            config: {
              channel: "#social-alerts",
              message: "⚠️ Negative mention detected by @{{trigger.username}}: {{trigger.text}}"
            },
            needsConfiguration: true
          }
        },
        {
          id: "slack-positive-highlight",
          type: "slack_action_send_message",
          position: { x: 560, y: 200 },
          data: {
            type: "slack_action_send_message",
            title: "Share Positive Mention",
            config: {
              channel: "#social-highlights",
              message: "🎉 Positive shout-out from @{{trigger.username}}: {{trigger.text}}"
            },
            needsConfiguration: true
          }
        },
        {
          id: "slack-neutral-log",
          type: "slack_action_send_message",
          position: { x: 560, y: 340 },
          data: {
            type: "slack_action_send_message",
            title: "Log Neutral Mention",
            config: {
              channel: "#social-monitoring",
              message: "ℹ️ Mention to monitor: {{trigger.text}}"
            },
            needsConfiguration: true
          }
        }
      ],
      edges: [
        { id: "e1", source: "trigger-1", target: "ai-router-sentiment" },
        { id: "e2", source: "ai-router-sentiment", target: "slack-negative-alert", sourceHandle: "negative" },
        { id: "e3", source: "ai-router-sentiment", target: "slack-positive-highlight", sourceHandle: "positive" },
        { id: "e4", source: "ai-router-sentiment", target: "slack-neutral-log", sourceHandle: "neutral" }
      ]
    }
  },

  // ============== PRODUCTIVITY TEMPLATES ==============

  // Task Management Automation
  {
    id: "task-management-automation",
    name: "Smart Task Manager",
    description: "Automatically create, assign, and track tasks across different platforms",
    category: "Productivity",
    tags: ["tasks", "project management", "automation", "tracking"],
    integrations: ["trello", "slack", "google_calendar"],
    difficulty: "intermediate",
    estimatedTime: "15 mins",
    workflow_json: {
      nodes: [
        {
          id: "trigger-1",
          type: "gmail_trigger_new_email",
          position: { x: 100, y: 100 },
          data: {
            name: "Task Request Email",
            config: {
              subject: "[TASK]"
            }
          }
        },
        {
          id: "action-1",
          type: "trello_action_create_card",
          position: { x: 300, y: 100 },
          data: {
            name: "Create Trello Card",
            config: {
              board: "{{TRELLO_BOARD_ID}}",
              list: "To Do",
              name: "{{trigger.subject}}",
              description: "{{trigger.body}}"
            }
          }
        },
        {
          id: "action-2",
          type: "google_calendar_action_create_event",
          position: { x: 500, y: 100 },
          data: {
            name: "Add to Calendar",
            config: {
              summary: "Work on: {{trigger.subject}}",
              start: "{{TOMORROW_9AM}}",
              duration: 60
            }
          }
        },
        {
          id: "action-3",
          type: "slack_action_send_message",
          position: { x: 700, y: 100 },
          data: {
            name: "Notify Team",
            config: {
              channel: "#tasks",
              message: "New task created: {{trigger.subject}} - assigned to {{trigger.assignee}}"
            }
          }
        }
      ],
      edges: [
        { id: "e1", source: "trigger-1", target: "action-1" },
        { id: "e2", source: "action-1", target: "action-2" },
        { id: "e3", source: "action-2", target: "action-3" }
      ]
    }
  },

  // Meeting Notes Organizer
  {
    id: "meeting-notes-organizer",
    name: "Meeting Notes Automation",
    description: "Automatically organize and distribute meeting notes after calendar events",
    category: "Productivity",
    tags: ["meetings", "notes", "organization", "distribution"],
    integrations: ["google_calendar", "notion", "gmail"],
    difficulty: "intermediate",
    estimatedTime: "10 mins",
    workflow_json: {
      nodes: [
        {
          id: "trigger-1",
          type: "google_calendar_trigger_event_ended",
          position: { x: 100, y: 100 },
          data: {
            name: "Meeting Ended",
            config: {}
          }
        },
        {
          id: "action-1",
          type: "notion_action_create_page",
          position: { x: 300, y: 100 },
          data: {
            name: "Create Notes Page",
            config: {
              database: "{{MEETING_NOTES_DB}}",
              properties: {
                title: "{{trigger.summary}} - {{trigger.date}}",
                attendees: "{{trigger.attendees}}",
                date: "{{trigger.date}}"
              }
            }
          }
        },
        {
          id: "action-2",
          type: "gmail_action_send_email",
          position: { x: 500, y: 100 },
          data: {
            name: "Send Notes Link",
            config: {
              to: "{{trigger.attendees}}",
              subject: "Meeting Notes: {{trigger.summary}}",
              body: "Meeting notes are available here: {{action-1.url}}"
            }
          }
        }
      ],
      edges: [
        { id: "e1", source: "trigger-1", target: "action-1" },
        { id: "e2", source: "action-1", target: "action-2" }
      ]
    }
  },

  // ============== DATA SYNC TEMPLATES ==============

  // CRM to Spreadsheet Sync
  {
    id: "crm-spreadsheet-sync",
    name: "CRM to Spreadsheet Sync",
    description: "Keep Google Sheets synchronized with your CRM data",
    category: "Data Sync",
    tags: ["sync", "crm", "spreadsheet", "data"],
    integrations: ["hubspot", "google_sheets"],
    difficulty: "intermediate",
    estimatedTime: "10 mins",
    workflow_json: {
      nodes: [
        {
          id: "trigger-1",
          type: "schedule_trigger",
          position: { x: 100, y: 100 },
          data: {
            name: "Daily Sync",
            config: {
              cron: "0 0 * * *" // Midnight daily
            }
          }
        },
        {
          id: "action-1",
          type: "hubspot_action_get_contacts",
          position: { x: 300, y: 100 },
          data: {
            name: "Get All Contacts",
            config: {
              limit: 1000
            }
          }
        },
        {
          id: "loop-1",
          type: "logic_loop",
          position: { x: 500, y: 100 },
          data: {
            name: "Process Each Contact",
            config: {
              items: "{{action-1.contacts}}"
            }
          }
        },
        {
          id: "action-2",
          type: "google_sheets_action_update_row",
          position: { x: 700, y: 100 },
          data: {
            name: "Update Sheet",
            config: {
              spreadsheet: "{{SYNC_SHEET_ID}}",
              sheet: "Contacts",
              key: "email",
              data: {
                "Email": "{{loop-1.item.email}}",
                "Name": "{{loop-1.item.name}}",
                "Company": "{{loop-1.item.company}}",
                "Last Updated": "{{NOW}}"
              }
            }
          }
        }
      ],
      edges: [
        { id: "e1", source: "trigger-1", target: "action-1" },
        { id: "e2", source: "action-1", target: "loop-1" },
        { id: "e3", source: "loop-1", target: "action-2", sourceHandle: "loop" }
      ]
    }
  },

  // Database Backup Automation
  {
    id: "database-backup",
    name: "Automated Database Backup",
    description: "Regularly backup your Airtable or Notion databases to Google Drive",
    category: "Data Sync",
    tags: ["backup", "database", "automation", "storage"],
    integrations: ["airtable", "google_drive"],
    difficulty: "advanced",
    estimatedTime: "15 mins",
    workflow_json: {
      nodes: [
        {
          id: "trigger-1",
          type: "schedule_trigger",
          position: { x: 100, y: 100 },
          data: {
            name: "Weekly Backup",
            config: {
              cron: "0 0 * * 0" // Sunday midnight
            }
          }
        },
        {
          id: "action-1",
          type: "airtable_action_export_base",
          position: { x: 300, y: 100 },
          data: {
            name: "Export Airtable",
            config: {
              base: "{{AIRTABLE_BASE_ID}}",
              format: "csv"
            }
          }
        },
        {
          id: "action-2",
          type: "google_drive_action_upload_file",
          position: { x: 500, y: 100 },
          data: {
            name: "Upload to Drive",
            config: {
              folder: "Backups",
              filename: "airtable_backup_{{DATE}}.csv",
              content: "{{action-1.data}}"
            }
          }
        },
        {
          id: "action-3",
          type: "gmail_action_send_email",
          position: { x: 700, y: 100 },
          data: {
            name: "Confirm Backup",
            config: {
              to: "{{ADMIN_EMAIL}}",
              subject: "Backup Completed - {{DATE}}",
              body: "Database backup completed successfully. File: {{action-2.url}}"
            }
          }
        }
      ],
      edges: [
        { id: "e1", source: "trigger-1", target: "action-1" },
        { id: "e2", source: "action-1", target: "action-2" },
        { id: "e3", source: "action-2", target: "action-3" }
      ]
    }
  },

  // ============== E-COMMERCE TEMPLATES ==============

  // Order Processing Automation
  {
    id: "order-processing",
    name: "E-commerce Order Processor",
    description: "Automatically process new orders, update inventory, and notify customers",
    category: "E-commerce",
    tags: ["orders", "shopify", "inventory", "notifications"],
    integrations: ["shopify", "gmail", "slack"],
    difficulty: "intermediate",
    estimatedTime: "12 mins",
    workflow_json: {
      nodes: [
        {
          id: "trigger-1",
          type: "shopify_trigger_new_order",
          position: { x: 100, y: 100 },
          data: {
            name: "New Order",
            config: {}
          }
        },
        {
          id: "action-1",
          type: "gmail_action_send_email",
          position: { x: 300, y: 50 },
          data: {
            name: "Order Confirmation",
            config: {
              to: "{{trigger.customer.email}}",
              subject: "Order #{{trigger.order_number}} Confirmed",
              body: "Thank you for your order! We'll ship it within 24 hours."
            }
          }
        },
        {
          id: "action-2",
          type: "slack_action_send_message",
          position: { x: 300, y: 150 },
          data: {
            name: "Notify Fulfillment",
            config: {
              channel: "#fulfillment",
              message: "New order #{{trigger.order_number}} - {{trigger.total}} - Ship to: {{trigger.shipping_address}}"
            }
          }
        },
        {
          id: "action-3",
          type: "google_sheets_action_add_row",
          position: { x: 300, y: 250 },
          data: {
            name: "Log Order",
            config: {
              spreadsheet: "{{ORDERS_SHEET_ID}}",
              sheet: "Orders",
              values: {
                "Order ID": "{{trigger.order_number}}",
                "Customer": "{{trigger.customer.name}}",
                "Total": "{{trigger.total}}",
                "Date": "{{trigger.created_at}}"
              }
            }
          }
        }
      ],
      edges: [
        { id: "e1", source: "trigger-1", target: "action-1" },
        { id: "e2", source: "trigger-1", target: "action-2" },
        { id: "e3", source: "trigger-1", target: "action-3" }
      ]
    }
  },

  // Abandoned Cart Recovery
  {
    id: "abandoned-cart-recovery",
    name: "Abandoned Cart Recovery",
    description: "Automatically send recovery emails for abandoned shopping carts",
    category: "E-commerce",
    tags: ["cart", "recovery", "email", "sales"],
    integrations: ["shopify", "gmail"],
    difficulty: "intermediate",
    estimatedTime: "10 mins",
    workflow_json: {
      nodes: [
        {
          id: "trigger-1",
          type: "shopify_trigger_abandoned_cart",
          position: { x: 100, y: 100 },
          data: {
            name: "Cart Abandoned",
            config: {
              wait_time: 3600 // 1 hour
            }
          }
        },
        {
          id: "action-1",
          type: "gmail_action_send_email",
          position: { x: 300, y: 100 },
          data: {
            name: "Recovery Email 1",
            config: {
              to: "{{trigger.email}}",
              subject: "You left something in your cart!",
              body: "Hi {{trigger.name}}, you have items waiting in your cart. Complete your purchase with 10% off using code COMEBACK10"
            }
          }
        },
        {
          id: "delay-1",
          type: "logic_delay",
          position: { x: 500, y: 100 },
          data: {
            name: "Wait 24 Hours",
            config: {
              delay: 86400
            }
          }
        },
        {
          id: "action-2",
          type: "gmail_action_send_email",
          position: { x: 700, y: 100 },
          data: {
            name: "Recovery Email 2",
            config: {
              to: "{{trigger.email}}",
              subject: "Last chance for your items!",
              body: "Your cart items are about to expire. Complete your order now with 15% off: SAVE15"
            }
          }
        }
      ],
      edges: [
        { id: "e1", source: "trigger-1", target: "action-1" },
        { id: "e2", source: "action-1", target: "delay-1" },
        { id: "e3", source: "delay-1", target: "action-2" }
      ]
    }
  },

  // ============== NOTIFICATION TEMPLATES ==============

  // Multi-Channel Alert System
  {
    id: "multi-channel-alerts",
    name: "Multi-Channel Alert System",
    description: "Send critical alerts across multiple channels simultaneously",
    category: "Notifications",
    tags: ["alerts", "monitoring", "notifications", "critical"],
    integrations: ["slack", "discord", "teams", "gmail"],
    difficulty: "beginner",
    estimatedTime: "8 mins",
    workflow_json: {
      nodes: [
        {
          id: "trigger-1",
          type: "webhook_trigger",
          position: { x: 100, y: 100 },
          data: {
            name: "Alert Webhook",
            config: {}
          }
        },
        {
          id: "action-1",
          type: "slack_action_send_message",
          position: { x: 300, y: 50 },
          data: {
            name: "Slack Alert",
            config: {
              channel: "#alerts",
              message: "🚨 ALERT: {{trigger.message}}"
            }
          }
        },
        {
          id: "action-2",
          type: "discord_action_send_message",
          position: { x: 300, y: 150 },
          data: {
            name: "Discord Alert",
            config: {
              channel: "alerts",
              message: "🚨 ALERT: {{trigger.message}}"
            }
          }
        },
        {
          id: "action-3",
          type: "teams_action_send_message",
          position: { x: 300, y: 250 },
          data: {
            name: "Teams Alert",
            config: {
              channel: "Alerts",
              message: "🚨 ALERT: {{trigger.message}}"
            }
          }
        },
        {
          id: "action-4",
          type: "gmail_action_send_email",
          position: { x: 300, y: 350 },
          data: {
            name: "Email Alert",
            config: {
              to: "{{ALERT_EMAIL_LIST}}",
              subject: "🚨 Critical Alert",
              body: "Alert Details: {{trigger.message}}"
            }
          }
        }
      ],
      edges: [
        { id: "e1", source: "trigger-1", target: "action-1" },
        { id: "e2", source: "trigger-1", target: "action-2" },
        { id: "e3", source: "trigger-1", target: "action-3" },
        { id: "e4", source: "trigger-1", target: "action-4" }
      ]
    }
  },

  // ============== HR TEMPLATES ==============

  // Employee Onboarding
  {
    id: "employee-onboarding",
    name: "Employee Onboarding Automation",
    description: "Automate the entire employee onboarding process from offer acceptance to first day",
    category: "HR",
    tags: ["hr", "onboarding", "employee", "automation"],
    integrations: ["gmail", "slack", "google_calendar", "notion"],
    difficulty: "advanced",
    estimatedTime: "20 mins",
    workflow_json: {
      nodes: [
        {
          id: "trigger-1",
          type: "gmail_trigger_new_email",
          position: { x: 100, y: 100 },
          data: {
            name: "Offer Accepted",
            config: {
              subject: "[OFFER ACCEPTED]"
            }
          }
        },
        {
          id: "action-1",
          type: "notion_action_create_page",
          position: { x: 300, y: 100 },
          data: {
            name: "Create Employee Record",
            config: {
              database: "{{EMPLOYEES_DB}}",
              properties: {
                name: "{{trigger.employee_name}}",
                email: "{{trigger.employee_email}}",
                start_date: "{{trigger.start_date}}",
                department: "{{trigger.department}}"
              }
            }
          }
        },
        {
          id: "action-2",
          type: "slack_action_invite_user",
          position: { x: 500, y: 50 },
          data: {
            name: "Add to Slack",
            config: {
              email: "{{trigger.employee_email}}",
              channels: ["#general", "#{{trigger.department}}"]
            }
          }
        },
        {
          id: "action-3",
          type: "google_calendar_action_create_event",
          position: { x: 500, y: 150 },
          data: {
            name: "Schedule Orientation",
            config: {
              summary: "Orientation - {{trigger.employee_name}}",
              start: "{{trigger.start_date}} 09:00",
              duration: 120,
              attendees: ["{{trigger.employee_email}}", "{{HR_EMAIL}}"]
            }
          }
        },
        {
          id: "action-4",
          type: "gmail_action_send_email",
          position: { x: 500, y: 250 },
          data: {
            name: "Welcome Email",
            config: {
              to: "{{trigger.employee_email}}",
              subject: "Welcome to the team!",
              body: "Welcome aboard! Your first day is {{trigger.start_date}}. We've scheduled your orientation and added you to our systems."
            }
          }
        }
      ],
      edges: [
        { id: "e1", source: "trigger-1", target: "action-1" },
        { id: "e2", source: "action-1", target: "action-2" },
        { id: "e3", source: "action-1", target: "action-3" },
        { id: "e4", source: "action-1", target: "action-4" }
      ]
    }
  },

  // ============== DEVOPS TEMPLATES ==============

  // Deployment Pipeline
  {
    id: "deployment-pipeline",
    name: "Automated Deployment Pipeline",
    description: "Automate code deployment with notifications and rollback capabilities",
    category: "DevOps",
    tags: ["deployment", "ci/cd", "github", "notifications"],
    integrations: ["github", "slack"],
    difficulty: "advanced",
    estimatedTime: "15 mins",
    workflow_json: {
      nodes: [
        {
          id: "trigger-1",
          type: "github_trigger_push",
          position: { x: 100, y: 100 },
          data: {
            name: "Code Push to Main",
            config: {
              branch: "main"
            }
          }
        },
        {
          id: "action-1",
          type: "github_action_run_workflow",
          position: { x: 300, y: 100 },
          data: {
            name: "Run Tests",
            config: {
              workflow: "test.yml"
            }
          }
        },
        {
          id: "condition-1",
          type: "logic_condition",
          position: { x: 500, y: 100 },
          data: {
            name: "Tests Passed?",
            config: {
              conditions: [
                { field: "{{action-1.status}}", operator: "equals", value: "success" }
              ]
            }
          }
        },
        {
          id: "action-2",
          type: "github_action_create_deployment",
          position: { x: 700, y: 50 },
          data: {
            name: "Deploy to Production",
            config: {
              environment: "production"
            }
          }
        },
        {
          id: "action-3",
          type: "slack_action_send_message",
          position: { x: 700, y: 150 },
          data: {
            name: "Notify Failure",
            config: {
              channel: "#dev-alerts",
              message: "❌ Deployment failed for commit {{trigger.commit_id}}: Tests did not pass"
            }
          }
        }
      ],
      edges: [
        { id: "e1", source: "trigger-1", target: "action-1" },
        { id: "e2", source: "action-1", target: "condition-1" },
        { id: "e3", source: "condition-1", target: "action-2", sourceHandle: "true" },
        { id: "e4", source: "condition-1", target: "action-3", sourceHandle: "false" }
      ]
    }
  },
  {
    id: "ai-message-support-reply",
    name: "AI Message - Support Reply",
    description: "Drafts a helpful reply whenever a new Discord support message arrives and sends it via Gmail.",
    category: "AI Automation",
    tags: ["ai-message", "support", "discord", "gmail"],
    integrations: ["discord", "gmail"],
    difficulty: "beginner",
    estimatedTime: "3 mins",
    workflow_json: {
      nodes: [
        {
          id: "discord-trigger-support",
          type: "discord_trigger_new_message",
          position: { x: 120, y: 260 },
          data: {
            type: "discord_trigger_new_message",
            title: "New Discord Support Message",
            config: {
              channelId: "",
              includeBot: false
            },
            isTrigger: true,
            needsConfiguration: true
          }
        },
        {
          id: "ai-message-1",
          type: "ai_message",
          position: { x: 420, y: 260 },
          data: {
            type: "ai_message",
            title: "Draft Support Reply",
            config: {
              model: "gpt-4o-mini",
              apiSource: "chainreact",
              temperature: 0.4,
              systemPrompt: "You are a helpful, empathetic support specialist. You acknowledge customer frustration, provide clear steps, and keep answers concise.",
              userPrompt: "A customer wrote:\n\"{{trigger.message.content}}\"\n\nWrite a short reply that acknowledges their issue, explains what happens next, and offers further help if needed.",
              outputFields: "reply_subject | Short subject line for email\nreply_body | Friendly support reply\nsummary | One sentence summary of the issue",
              includeRawOutput: true
            },
            needsConfiguration: false
          }
        },
        {
          id: "gmail-send-reply",
          type: "gmail_action_send_email",
          position: { x: 720, y: 260 },
          data: {
            type: "gmail_action_send_email",
            title: "Send Support Reply",
            config: {
              to: "",
              subject: "{{ai-message-1.reply_subject}}",
              body: "{{ai-message-1.reply_body}}",
              isHtml: false
            },
            needsConfiguration: true
          }
        }
      ],
      edges: [
        { id: "edge-support-1", source: "discord-trigger-support", target: "ai-message-1" },
        { id: "edge-support-2", source: "ai-message-1", target: "gmail-send-reply" }
      ]
    }
  },
  {
    id: "ai-helpdesk-triage-router",
    name: "AI Helpdesk Triage Router",
    description: "Classify incoming support emails and notify the right team automatically.",
    category: "AI Automation",
    tags: ["ai-router", "support", "gmail", "slack"],
    integrations: ["gmail", "slack"],
    difficulty: "intermediate",
    estimatedTime: "8 mins",
    workflow_json: {
      nodes: [
        {
          id: "gmail-trigger-support",
          type: "gmail_trigger_new_email",
          position: { x: 120, y: 320 },
          data: {
            type: "gmail_trigger_new_email",
            title: "New Support Email",
            config: {
              labelIds: [],
              includeSpamTrash: false
            },
            isTrigger: true,
            needsConfiguration: true
          }
        },
        {
          id: "ai-router-support",
          type: "ai_router",
          position: { x: 420, y: 320 },
          data: {
            type: "ai_router",
            title: "Route Request",
            config: {
              template: "support_router",
              model: "gpt-4o-mini",
              apiSource: "chainreact",
              memory: "workflow",
              outputPaths: [
                { id: "bug_report", name: "Bug Report", description: "Notify engineering", color: "#ef4444", condition: { type: "ai_decision", minConfidence: 0.7 } },
                { id: "feature_request", name: "Feature Request", description: "Notify product", color: "#3b82f6", condition: { type: "ai_decision", minConfidence: 0.7 } },
                { id: "support_query", name: "Support Query", description: "Send to support", color: "#10b981", condition: { type: "ai_decision", minConfidence: 0.7 } },
                { id: "sales_inquiry", name: "Sales Inquiry", description: "Forward to sales", color: "#f59e0b", condition: { type: "ai_decision", minConfidence: 0.7 } },
                { id: "general", name: "General", description: "Catch-all", color: "#6b7280", condition: { type: "fallback" } }
              ]
            },
            needsConfiguration: false
          }
        },
        {
          id: "slack-notify-bug",
          type: "slack_action_send_message",
          position: { x: 720, y: 140 },
          data: {
            type: "slack_action_send_message",
            title: "Notify Engineering",
            config: {
              channel: "",
              text: "New bug report detected. Subject: {{trigger.email.subject}}"
            },
            needsConfiguration: true
          }
        },
        {
          id: "slack-notify-feature",
          type: "slack_action_send_message",
          position: { x: 720, y: 240 },
          data: {
            type: "slack_action_send_message",
            title: "Notify Product",
            config: {
              channel: "",
              text: "New feature request. Subject: {{trigger.email.subject}}"
            },
            needsConfiguration: true
          }
        },
        {
          id: "slack-notify-support",
          type: "slack_action_send_message",
          position: { x: 720, y: 340 },
          data: {
            type: "slack_action_send_message",
            title: "Support Queue",
            config: {
              channel: "",
              text: "Support question received from {{trigger.email.from}}"
            },
            needsConfiguration: true
          }
        },
        {
          id: "slack-notify-sales",
          type: "slack_action_send_message",
          position: { x: 720, y: 440 },
          data: {
            type: "slack_action_send_message",
            title: "Sales Alert",
            config: {
              channel: "",
              text: "Sales inquiry detected. Subject: {{trigger.email.subject}}"
            },
            needsConfiguration: true
          }
        },
        {
          id: "slack-notify-general",
          type: "slack_action_send_message",
          position: { x: 720, y: 540 },
          data: {
            type: "slack_action_send_message",
            title: "General Inbox",
            config: {
              channel: "",
              text: "General message received. Subject: {{trigger.email.subject}}"
            },
            needsConfiguration: true
          }
        }
      ],
      edges: [
        { id: "edge-support-route", source: "gmail-trigger-support", target: "ai-router-support" },
        { id: "edge-route-bug", source: "ai-router-support", target: "slack-notify-bug", sourceHandle: "bug_report" },
        { id: "edge-route-feature", source: "ai-router-support", target: "slack-notify-feature", sourceHandle: "feature_request" },
        { id: "edge-route-support", source: "ai-router-support", target: "slack-notify-support", sourceHandle: "support_query" },
        { id: "edge-route-sales", source: "ai-router-support", target: "slack-notify-sales", sourceHandle: "sales_inquiry" },
        { id: "edge-route-general", source: "ai-router-support", target: "slack-notify-general", sourceHandle: "general" }
      ]
    }
  },
  {
    id: "newsletter-content-generator",
    name: "Newsletter Content Generator",
    description: "Turn a drafted Google Doc into a Mailchimp campaign with AI-generated subject and preview text.",
    category: "AI Automation",
    tags: ["ai-message", "google-docs", "mailchimp", "newsletter"],
    integrations: ["google-docs", "mailchimp"],
    difficulty: "intermediate",
    estimatedTime: "7 mins",
    workflow_json: {
      nodes: [
        {
          id: "gdocs-trigger-newsletter",
          type: "google_docs_trigger_document_updated",
          position: { x: 120, y: 300 },
          data: {
            type: "google_docs_trigger_document_updated",
            title: "Newsletter Draft Updated",
            config: {
              folderId: ""
            },
            isTrigger: true,
            needsConfiguration: true
          }
        },
        {
          id: "ai-message-newsletter",
          type: "ai_message",
          position: { x: 420, y: 300 },
          data: {
            type: "ai_message",
            title: "Generate Campaign Copy",
            config: {
              model: "gpt-4o-mini",
              apiSource: "chainreact",
              temperature: 0.3,
              systemPrompt: "You are a marketing copywriter. Create compelling newsletter subject lines and preview text.",
              userPrompt: "Draft newsletter content:\n{{trigger.document.content}}\n\nProduce final copy.",
              outputFields: "campaign_subject | Concise subject line\ncampaign_preview | Preview text\nhtml_body | HTML body content",
              includeRawOutput: true
            },
            needsConfiguration: false
          }
        },
        {
          id: "mailchimp-create-campaign",
          type: "mailchimp_action_create_campaign",
          position: { x: 720, y: 260 },
          data: {
            type: "mailchimp_action_create_campaign",
            title: "Create Mailchimp Campaign",
            config: {
              audienceId: "",
              subjectLine: "{{ai-message-newsletter.campaign_subject}}",
              previewText: "{{ai-message-newsletter.campaign_preview}}",
              fromName: "",
              replyTo: ""
            },
            needsConfiguration: true
          }
        },
        {
          id: "mailchimp-send-campaign",
          type: "mailchimp_action_send_campaign",
          position: { x: 960, y: 260 },
          data: {
            type: "mailchimp_action_send_campaign",
            title: "Send Campaign",
            config: {
              campaignId: "{{mailchimp-create-campaign.campaignId}}",
              scheduleTime: ""
            },
            needsConfiguration: true
          }
        }
      ],
      edges: [
        { id: "edge-newsletter-1", source: "gdocs-trigger-newsletter", target: "ai-message-newsletter" },
        { id: "edge-newsletter-2", source: "ai-message-newsletter", target: "mailchimp-create-campaign" },
        { id: "edge-newsletter-3", source: "mailchimp-create-campaign", target: "mailchimp-send-campaign" }
      ]
    }
  },
  {
    id: "customer-follow-up-sequencer",
    name: "Customer Follow-up Sequencer",
    description: "Send a thank-you email and two automated follow-ups after a successful payment.",
    category: "Sales & CRM",
    tags: ["ai-message", "stripe", "gmail", "slack"],
    integrations: ["stripe", "gmail", "slack"],
    difficulty: "intermediate",
    estimatedTime: "10 mins",
    workflow_json: {
      nodes: [
        {
          id: "stripe-trigger-payment",
          type: "stripe_trigger_payment_succeeded",
          position: { x: 100, y: 260 },
          data: {
            type: "stripe_trigger_payment_succeeded",
            title: "Payment Succeeded",
            config: {
              descriptionKeywords: []
            },
            isTrigger: true,
            needsConfiguration: true
          }
        },
        {
          id: "ai-message-followup",
          type: "ai_message",
          position: { x: 360, y: 260 },
          data: {
            type: "ai_message",
            title: "Draft Follow-up Emails",
            config: {
              model: "gpt-4o-mini",
              apiSource: "chainreact",
              temperature: 0.5,
              systemPrompt: "You are a customer success manager writing friendly follow-up emails.",
              userPrompt: "Payment details: {{trigger.payment}}. Customer email: {{trigger.customer.email}}. Draft thank-you and two follow-up messages.",
              outputFields: "first_subject | Immediate thank-you subject\nfirst_body | Immediate thank-you body\nsecond_subject | Follow-up subject (after 2 days)\nsecond_body | Follow-up body (after 2 days)\nthird_subject | Final follow-up subject (after 5 days)\nthird_body | Final follow-up body (after 5 days)",
              includeRawOutput: true
            },
            needsConfiguration: false
          }
        },
        {
          id: "gmail-send-thankyou",
          type: "gmail_action_send_email",
          position: { x: 600, y: 200 },
          data: {
            type: "gmail_action_send_email",
            title: "Send Thank You",
            config: {
              to: "{{trigger.customer.email}}",
              subject: "{{ai-message-followup.first_subject}}",
              body: "{{ai-message-followup.first_body}}",
              isHtml: false
            },
            needsConfiguration: true
          }
        },
        {
          id: "delay-two-days",
          type: "delay",
          position: { x: 840, y: 200 },
          data: {
            type: "delay",
            title: "Wait 2 Days",
            config: {
              waitType: "duration",
              duration: 2,
              unit: "days"
            },
            needsConfiguration: false
          }
        },
        {
          id: "gmail-followup-1",
          type: "gmail_action_send_email",
          position: { x: 1080, y: 200 },
          data: {
            type: "gmail_action_send_email",
            title: "Follow-up Email",
            config: {
              to: "{{trigger.customer.email}}",
              subject: "{{ai-message-followup.second_subject}}",
              body: "{{ai-message-followup.second_body}}",
              isHtml: false
            },
            needsConfiguration: true
          }
        },
        {
          id: "delay-five-days",
          type: "delay",
          position: { x: 1320, y: 200 },
          data: {
            type: "delay",
            title: "Wait 3 More Days",
            config: {
              waitType: "duration",
              duration: 3,
              unit: "days"
            },
            needsConfiguration: false
          }
        },
        {
          id: "gmail-followup-2",
          type: "gmail_action_send_email",
          position: { x: 1560, y: 200 },
          data: {
            type: "gmail_action_send_email",
            title: "Final Follow-up",
            config: {
              to: "{{trigger.customer.email}}",
              subject: "{{ai-message-followup.third_subject}}",
              body: "{{ai-message-followup.third_body}}",
              isHtml: false
            },
            needsConfiguration: true
          }
        },
        {
          id: "slack-notify-success",
          type: "slack_action_send_message",
          position: { x: 1080, y: 360 },
          data: {
            type: "slack_action_send_message",
            title: "Notify Success Team",
            config: {
              channel: "",
              text: "Follow-up sequence started for {{trigger.customer.email}}"
            },
            needsConfiguration: true
          }
        }
      ],
      edges: [
        { id: "edge-followup-1", source: "stripe-trigger-payment", target: "ai-message-followup" },
        { id: "edge-followup-2", source: "ai-message-followup", target: "gmail-send-thankyou" },
        { id: "edge-followup-3", source: "gmail-send-thankyou", target: "delay-two-days" },
        { id: "edge-followup-4", source: "delay-two-days", target: "gmail-followup-1" },
        { id: "edge-followup-5", source: "gmail-followup-1", target: "delay-five-days" },
        { id: "edge-followup-6", source: "delay-five-days", target: "gmail-followup-2" },
        { id: "edge-followup-7", source: "ai-message-followup", target: "slack-notify-success" }
      ]
    }
  },
  {
    id: "sales-demo-scheduler",
    name: "Sales Demo Scheduler",
    description: "Respond to new HubSpot leads with a personalized email and schedule a demo meeting.",
    category: "Sales & CRM",
    tags: ["ai-message", "hubspot", "gmail", "google-calendar", "slack"],
    integrations: ["hubspot", "gmail", "google-calendar", "slack"],
    difficulty: "intermediate",
    estimatedTime: "9 mins",
    workflow_json: {
      nodes: [
        {
          id: "hubspot-trigger-lead",
          type: "hubspot_trigger_contact_created",
          position: { x: 120, y: 280 },
          data: {
            type: "hubspot_trigger_contact_created",
            title: "New HubSpot Lead",
            config: {
              pipelineId: ""
            },
            isTrigger: true,
            needsConfiguration: true
          }
        },
        {
          id: "ai-message-demo",
          type: "ai_message",
          position: { x: 400, y: 280 },
          data: {
            type: "ai_message",
            title: "Draft Demo Invite",
            config: {
              model: "gpt-4o-mini",
              apiSource: "chainreact",
              temperature: 0.4,
              systemPrompt: "You are a sales rep who writes concise demo invitations.",
              userPrompt: "Lead details: {{trigger.contact}}. Draft an email inviting them to a demo and include a short summary for Slack.",
              outputFields: "email_subject | Email subject line\nemail_body | Email body text\nslack_summary | One sentence summary",
              includeRawOutput: true
            },
            needsConfiguration: false
          }
        },
        {
          id: "gmail-send-demo",
          type: "gmail_action_send_email",
          position: { x: 660, y: 220 },
          data: {
            type: "gmail_action_send_email",
            title: "Send Demo Invite",
            config: {
              to: "{{trigger.contact.email}}",
              subject: "{{ai-message-demo.email_subject}}",
              body: "{{ai-message-demo.email_body}}",
              isHtml: false
            },
            needsConfiguration: true
          }
        },
        {
          id: "calendar-create-demo",
          type: "google_calendar_action_create_event",
          position: { x: 920, y: 220 },
          data: {
            type: "google_calendar_action_create_event",
            title: "Schedule Demo",
            config: {
              calendarId: "",
              summary: "Demo with {{trigger.contact.firstname}} {{trigger.contact.lastname}}",
              description: "Requested demo. Email reference: {{ai-message-demo.email_body}}",
              startTime: "",
              endTime: ""
            },
            needsConfiguration: true
          }
        },
        {
          id: "slack-notify-demo",
          type: "slack_action_send_message",
          position: { x: 660, y: 360 },
          data: {
            type: "slack_action_send_message",
            title: "Alert Sales Channel",
            config: {
              channel: "",
              text: "New demo scheduled: {{ai-message-demo.slack_summary}}"
            },
            needsConfiguration: true
          }
        }
      ],
      edges: [
        { id: "edge-demo-1", source: "hubspot-trigger-lead", target: "ai-message-demo" },
        { id: "edge-demo-2", source: "ai-message-demo", target: "gmail-send-demo" },
        { id: "edge-demo-3", source: "gmail-send-demo", target: "calendar-create-demo" },
        { id: "edge-demo-4", source: "ai-message-demo", target: "slack-notify-demo" }
      ]
    }
  },
  {
    id: "incident-postmortem-builder",
    name: "Incident Postmortem Builder",
    description: "Summarize resolved incidents and document a postmortem in Notion automatically.",
    category: "DevOps",
    tags: ["ai-message", "slack", "notion"],
    integrations: ["slack", "notion"],
    difficulty: "intermediate",
    estimatedTime: "6 mins",
    workflow_json: {
      nodes: [
        {
          id: "slack-trigger-incident",
          type: "slack_trigger_message_channels",
          position: { x: 120, y: 280 },
          data: {
            type: "slack_trigger_message_channels",
            title: "Incident Resolved Message",
            config: {
              channel: ""
            },
            isTrigger: true,
            needsConfiguration: true
          }
        },
        {
          id: "ai-message-postmortem",
          type: "ai_message",
          position: { x: 400, y: 280 },
          data: {
            type: "ai_message",
            title: "Summarize Incident",
            config: {
              model: "gpt-4o-mini",
              apiSource: "chainreact",
              temperature: 0.4,
              systemPrompt: "You are an SRE generating structured postmortem summaries.",
              userPrompt: "Incident update: {{trigger.message.text}}. Create a summary, timeline, and follow-up actions.",
              outputFields: "summary | High-level summary\ntimeline | Timeline bullet list\nactions | Follow-up actions",
              includeRawOutput: true
            },
            needsConfiguration: false
          }
        },
        {
          id: "notion-create-postmortem",
          type: "notion_action_create_page",
          position: { x: 680, y: 220 },
          data: {
            type: "notion_action_create_page",
            title: "Create Postmortem Page",
            config: {
              parentId: "",
              title: "Postmortem - {{trigger.message.user.name}} - {{trigger.message.ts}}",
              content: "## Summary\n{{ai-message-postmortem.summary}}\n\n## Timeline\n{{ai-message-postmortem.timeline}}\n\n## Follow-up Actions\n{{ai-message-postmortem.actions}}"
            },
            needsConfiguration: true
          }
        },
        {
          id: "slack-notify-postmortem",
          type: "slack_action_send_message",
          position: { x: 680, y: 360 },
          data: {
            type: "slack_action_send_message",
            title: "Share Postmortem",
            config: {
              channel: "",
              text: "Postmortem summary created in Notion."
            },
            needsConfiguration: true
          }
        }
      ],
      edges: [
        { id: "edge-postmortem-1", source: "slack-trigger-incident", target: "ai-message-postmortem" },
        { id: "edge-postmortem-2", source: "ai-message-postmortem", target: "notion-create-postmortem" },
        { id: "edge-postmortem-3", source: "notion-create-postmortem", target: "slack-notify-postmortem" }
      ]
    }
  }
]

// Helper function to get templates by category
export function getTemplatesByCategory(category: string): PredefinedTemplate[] {
  if (category === "all") return predefinedTemplates
  return predefinedTemplates.filter(t => t.category === category)
}

// Helper function to get templates by integration
export function getTemplatesByIntegration(integration: string): PredefinedTemplate[] {
  return predefinedTemplates.filter(t => t.integrations.includes(integration))
}

// Helper function to search templates
export function getTemplateById(id: string): PredefinedTemplate | undefined {
  return predefinedTemplates.find(t => t.id === id)
}

export function searchTemplates(query: string): PredefinedTemplate[] {
  const lowerQuery = query.toLowerCase()
  return predefinedTemplates.filter(t => 
    t.name.toLowerCase().includes(lowerQuery) ||
    t.description.toLowerCase().includes(lowerQuery) ||
    t.tags.some(tag => tag.toLowerCase().includes(lowerQuery)) ||
    t.integrations.some(int => int.toLowerCase().includes(lowerQuery))
  )
}

// Get unique categories
export const templateCategories = Array.from(new Set(predefinedTemplates.map(t => t.category))).sort()

// Get unique integrations
export const templateIntegrations = Array.from(new Set(predefinedTemplates.flatMap(t => t.integrations))).sort()
