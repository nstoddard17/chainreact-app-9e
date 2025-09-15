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
}

export const predefinedTemplates: PredefinedTemplate[] = [
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
          position: { x: 100, y: 100 },
          data: {
            name: "New Support Request",
            config: {
              channel: "#support"
            }
          }
        },
        {
          id: "action-1",
          type: "ai_agent",
          position: { x: 300, y: 100 },
          data: {
            name: "Categorize Request",
            config: {
              prompt: "Categorize this support request: {{trigger.message}}. Categories: Technical, Billing, General"
            }
          }
        },
        {
          id: "condition-1",
          type: "logic_condition",
          position: { x: 500, y: 100 },
          data: {
            name: "Route by Category",
            config: {
              conditions: [
                { field: "{{action-1.category}}", operator: "equals", value: "Technical" },
                { field: "{{action-1.category}}", operator: "equals", value: "Billing" }
              ]
            }
          }
        },
        {
          id: "action-2",
          type: "slack_action_send_message",
          position: { x: 700, y: 50 },
          data: {
            name: "Route to Tech Team",
            config: {
              channel: "#tech-support",
              message: "New technical issue from {{trigger.user}}: {{trigger.message}}"
            }
          }
        },
        {
          id: "action-3",
          type: "slack_action_send_message",
          position: { x: 700, y: 150 },
          data: {
            name: "Route to Billing",
            config: {
              channel: "#billing-support",
              message: "New billing inquiry from {{trigger.user}}: {{trigger.message}}"
            }
          }
        }
      ],
      edges: [
        { id: "e1", source: "trigger-1", target: "action-1" },
        { id: "e2", source: "action-1", target: "condition-1" },
        { id: "e3", source: "condition-1", target: "action-2", sourceHandle: "true-1" },
        { id: "e4", source: "condition-1", target: "action-3", sourceHandle: "true-2" }
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
    integrations: ["teams"],
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
    }
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
    }
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
          position: { x: 100, y: 100 },
          data: {
            name: "Brand Mention",
            config: {}
          }
        },
        {
          id: "action-1",
          type: "ai_agent",
          position: { x: 300, y: 100 },
          data: {
            name: "Analyze Sentiment",
            config: {
              prompt: "Analyze the sentiment of this tweet: {{trigger.text}}. Return: positive, negative, or neutral"
            }
          }
        },
        {
          id: "condition-1",
          type: "logic_condition",
          position: { x: 500, y: 100 },
          data: {
            name: "Check Sentiment",
            config: {
              conditions: [
                { field: "{{action-1.sentiment}}", operator: "equals", value: "negative" }
              ]
            }
          }
        },
        {
          id: "action-2",
          type: "slack_action_send_message",
          position: { x: 700, y: 50 },
          data: {
            name: "Alert Team",
            config: {
              channel: "#social-alerts",
              message: "⚠️ Negative mention detected: {{trigger.text}} - by @{{trigger.username}}"
            }
          }
        }
      ],
      edges: [
        { id: "e1", source: "trigger-1", target: "action-1" },
        { id: "e2", source: "action-1", target: "condition-1" },
        { id: "e3", source: "condition-1", target: "action-2", sourceHandle: "true" }
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