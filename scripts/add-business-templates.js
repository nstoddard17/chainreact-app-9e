import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const templates = [
  {
    name: 'Smart Email Triage - Sales & Support Router',
    description: 'AI automatically categorizes incoming emails and routes them to sales, support, or internal teams with appropriate follow-up actions',
    category: 'Email Automation',
    tags: ['ai-agent', 'gmail', 'slack', 'airtable', 'email-routing'],
    integrations: ['gmail', 'slack', 'airtable'],
    difficulty: 'intermediate',
    estimated_time: '5 mins',
    is_public: true,
    is_predefined: true,
    nodes: [
      {
        id: "gmail-trigger-1",
        type: "custom",
        position: { x: 750, y: 50 },
        data: {
          type: "gmail_trigger_new_email",
          title: "New Email Received",
          description: "Triggers when a new email arrives in your Gmail inbox",
          isTrigger: true,
          config: { labelId: "INBOX" },
          validationState: { missingRequired: [] }
        }
      },
      {
        id: "ai-agent-1",
        type: "custom",
        position: { x: 750, y: 280 },
        data: {
          type: "ai_agent",
          title: "Email Classification Agent",
          description: "Analyzes email content and routes to appropriate team",
          config: {
            model: "gpt-4o-mini",
            temperature: 0.3,
            autoSelectChain: true,
            prompt: "Analyze this email and categorize it as sales inquiry, support request, or internal communication. Route accordingly.",
            chainsLayout: {
              chains: [
                { id: "chain-sales", name: "Sales Inquiry", description: "Handles new sales opportunities", conditions: [{ field: "email.content", operator: "contains", value: "pricing" }] },
                { id: "chain-support", name: "Support Request", description: "Routes to customer support", conditions: [{ field: "email.content", operator: "contains", value: "help" }] },
                { id: "chain-internal", name: "Internal Communication", description: "Team collaboration", conditions: [{ field: "email.from", operator: "contains", value: "@company.com" }] }
              ],
              nodes: [],
              edges: []
            }
          }
        }
      },
      {
        id: "chain-1-airtable",
        type: "custom",
        position: { x: 200, y: 530 },
        data: {
          type: "airtable_action_create_record",
          title: "Log Sales Lead",
          description: "Create a new sales lead record",
          parentChainIndex: 0,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { baseId: "", tableName: "", fields: { "Lead Name": "{{AI_FIELD:lead_name}}", "Email": "{{AI_FIELD:email}}", "Interest": "{{AI_FIELD:interest}}" } },
          validationState: { missingRequired: ["baseId", "tableName"] }
        }
      },
      {
        id: "chain-1-slack",
        type: "custom",
        position: { x: 200, y: 730 },
        data: {
          type: "slack_action_send_message",
          title: "Notify Sales Team",
          description: "Send message to Slack channel",
          parentChainIndex: 0,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { channelId: "", message: "{{AI_FIELD:sales_notification}}" },
          validationState: { missingRequired: ["channelId"] }
        }
      },
      {
        id: "chain-2-airtable",
        type: "custom",
        position: { x: 750, y: 530 },
        data: {
          type: "airtable_action_create_record",
          title: "Create Support Ticket",
          description: "Log support request",
          parentChainIndex: 1,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { baseId: "", tableName: "", fields: { "Ticket ID": "{{AI_FIELD:ticket_id}}", "Customer": "{{AI_FIELD:customer}}", "Issue": "{{AI_FIELD:issue}}" } },
          validationState: { missingRequired: ["baseId", "tableName"] }
        }
      },
      {
        id: "chain-2-slack",
        type: "custom",
        position: { x: 750, y: 730 },
        data: {
          type: "slack_action_send_message",
          title: "Alert Support Team",
          description: "Notify support channel",
          parentChainIndex: 1,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { channelId: "", message: "{{AI_FIELD:support_alert}}" },
          validationState: { missingRequired: ["channelId"] }
        }
      },
      {
        id: "chain-3-notion",
        type: "custom",
        position: { x: 1300, y: 530 },
        data: {
          type: "notion_action_create_page",
          title: "Add to Team Docs",
          description: "Create page in Notion workspace",
          parentChainIndex: 2,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { databaseId: "", title: "{{AI_FIELD:doc_title}}", content: "{{AI_FIELD:content}}" },
          validationState: { missingRequired: ["databaseId"] }
        }
      }
    ],
    connections: [
      { id: "e1", source: "gmail-trigger-1", target: "ai-agent-1" },
      { id: "e2", source: "ai-agent-1", target: "chain-1-airtable" },
      { id: "e3", source: "ai-agent-1", target: "chain-2-airtable" },
      { id: "e4", source: "ai-agent-1", target: "chain-3-notion" },
      { id: "e5", source: "chain-1-airtable", target: "chain-1-slack" },
      { id: "e6", source: "chain-2-airtable", target: "chain-2-slack" }
    ]
  },
  {
    name: 'Lead Qualification & CRM Update',
    description: 'Automatically qualify leads from form submissions, score them, and route to the right sales rep while updating your CRM',
    category: 'Sales Automation',
    tags: ['ai-agent', 'leads', 'crm', 'airtable', 'gmail'],
    integrations: ['airtable', 'gmail', 'slack'],
    difficulty: 'intermediate',
    estimated_time: '4 mins',
    is_public: true,
    is_predefined: true,
    nodes: [
      {
        id: "airtable-trigger-1",
        type: "custom",
        position: { x: 750, y: 50 },
        data: {
          type: "airtable_trigger_new_record",
          title: "New Lead Submission",
          description: "Triggers when a new lead form is submitted",
          isTrigger: true,
          config: { baseId: "", tableName: "" },
          validationState: { missingRequired: ["baseId", "tableName"] }
        }
      },
      {
        id: "ai-agent-1",
        type: "custom",
        position: { x: 750, y: 280 },
        data: {
          type: "ai_agent",
          title: "Lead Qualification Agent",
          description: "Scores and qualifies leads based on criteria",
          config: {
            model: "gpt-4o-mini",
            temperature: 0.2,
            autoSelectChain: true,
            prompt: "Analyze lead data and qualify as hot, warm, or cold based on company size, budget, and urgency.",
            chainsLayout: {
              chains: [
                { id: "chain-hot", name: "Hot Lead", description: "Immediate follow-up required", conditions: [{ field: "lead.budget", operator: "gt", value: "10000" }] },
                { id: "chain-warm", name: "Warm Lead", description: "Schedule demo", conditions: [{ field: "lead.interest", operator: "equals", value: "high" }] },
                { id: "chain-cold", name: "Cold Lead", description: "Nurture campaign", conditions: [{ field: "lead.budget", operator: "lt", value: "5000" }] }
              ],
              nodes: [],
              edges: []
            }
          }
        }
      },
      {
        id: "chain-1-airtable",
        type: "custom",
        position: { x: 200, y: 530 },
        data: {
          type: "airtable_action_update_record",
          title: "Update Lead Score",
          description: "Mark as hot lead with score",
          parentChainIndex: 0,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { baseId: "", tableName: "", recordId: "{{trigger.recordId}}", fields: { "Score": "{{AI_FIELD:score}}", "Status": "Hot" } },
          validationState: { missingRequired: ["baseId", "tableName"] }
        }
      },
      {
        id: "chain-1-gmail",
        type: "custom",
        position: { x: 200, y: 730 },
        data: {
          type: "gmail_action_send_email",
          title: "Send to Senior Sales Rep",
          description: "Immediate outreach email",
          parentChainIndex: 0,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { to: "{{AI_FIELD:senior_rep_email}}", subject: "{{AI_FIELD:subject}}", body: "{{AI_FIELD:body}}" }
        }
      },
      {
        id: "chain-2-airtable",
        type: "custom",
        position: { x: 750, y: 530 },
        data: {
          type: "airtable_action_update_record",
          title: "Update Lead Score",
          description: "Mark as warm lead",
          parentChainIndex: 1,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { baseId: "", tableName: "", recordId: "{{trigger.recordId}}", fields: { "Score": "{{AI_FIELD:score}}", "Status": "Warm" } },
          validationState: { missingRequired: ["baseId", "tableName"] }
        }
      },
      {
        id: "chain-2-gmail",
        type: "custom",
        position: { x: 750, y: 730 },
        data: {
          type: "gmail_action_send_email",
          title: "Schedule Demo Email",
          description: "Send demo invitation",
          parentChainIndex: 1,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { to: "{{AI_FIELD:lead_email}}", subject: "{{AI_FIELD:demo_subject}}", body: "{{AI_FIELD:demo_body}}" }
        }
      },
      {
        id: "chain-3-airtable",
        type: "custom",
        position: { x: 1300, y: 530 },
        data: {
          type: "airtable_action_update_record",
          title: "Update Lead Score",
          description: "Mark as cold lead for nurture",
          parentChainIndex: 2,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { baseId: "", tableName: "", recordId: "{{trigger.recordId}}", fields: { "Score": "{{AI_FIELD:score}}", "Status": "Nurture" } },
          validationState: { missingRequired: ["baseId", "tableName"] }
        }
      }
    ],
    connections: [
      { id: "e1", source: "airtable-trigger-1", target: "ai-agent-1" },
      { id: "e2", source: "ai-agent-1", target: "chain-1-airtable" },
      { id: "e3", source: "ai-agent-1", target: "chain-2-airtable" },
      { id: "e4", source: "ai-agent-1", target: "chain-3-airtable" },
      { id: "e5", source: "chain-1-airtable", target: "chain-1-gmail" },
      { id: "e6", source: "chain-2-airtable", target: "chain-2-gmail" }
    ]
  },
  {
    name: 'Bug Triage & Assignment System',
    description: 'AI analyzes bug reports, assigns severity, and routes to the appropriate engineering team with context',
    category: 'Development',
    tags: ['ai-agent', 'bugs', 'engineering', 'discord', 'notion'],
    integrations: ['discord', 'notion', 'slack'],
    difficulty: 'intermediate',
    estimated_time: '4 mins',
    is_public: true,
    is_predefined: true,
    nodes: [
      {
        id: "discord-trigger-1",
        type: "custom",
        position: { x: 750, y: 50 },
        data: {
          type: "discord_trigger_new_message",
          title: "Bug Report in Discord",
          description: "Monitors #bugs channel",
          isTrigger: true,
          config: { channelId: "", includeBot: false },
          validationState: { missingRequired: ["channelId"] }
        }
      },
      {
        id: "ai-agent-1",
        type: "custom",
        position: { x: 750, y: 280 },
        data: {
          type: "ai_agent",
          title: "Bug Triage Agent",
          description: "Classifies bugs by severity and team",
          config: {
            model: "gpt-4o-mini",
            temperature: 0.1,
            autoSelectChain: true,
            prompt: "Analyze bug report and classify severity (critical/high/medium/low) and assign to frontend, backend, or infrastructure team.",
            chainsLayout: {
              chains: [
                { id: "chain-critical", name: "Critical Bug", description: "Immediate attention required", conditions: [{ field: "bug.severity", operator: "equals", value: "critical" }] },
                { id: "chain-high", name: "High Priority", description: "Fix in next sprint", conditions: [{ field: "bug.severity", operator: "equals", value: "high" }] },
                { id: "chain-standard", name: "Standard Bug", description: "Add to backlog", conditions: [{ field: "bug.severity", operator: "in", value: ["medium", "low"] }] }
              ],
              nodes: [],
              edges: []
            }
          }
        }
      },
      {
        id: "chain-1-notion",
        type: "custom",
        position: { x: 200, y: 530 },
        data: {
          type: "notion_action_create_page",
          title: "Create Critical Bug Page",
          description: "Document in Notion with full context",
          parentChainIndex: 0,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { databaseId: "", title: "{{AI_FIELD:bug_title}}", content: "{{AI_FIELD:bug_details}}" },
          validationState: { missingRequired: ["databaseId"] }
        }
      },
      {
        id: "chain-1-slack",
        type: "custom",
        position: { x: 200, y: 730 },
        data: {
          type: "slack_action_send_message",
          title: "Alert Engineering Team",
          description: "Send urgent Slack notification",
          parentChainIndex: 0,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { channelId: "", message: "{{AI_FIELD:critical_alert}}" },
          validationState: { missingRequired: ["channelId"] }
        }
      },
      {
        id: "chain-2-notion",
        type: "custom",
        position: { x: 750, y: 530 },
        data: {
          type: "notion_action_create_page",
          title: "Create High Priority Bug",
          description: "Add to sprint planning",
          parentChainIndex: 1,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { databaseId: "", title: "{{AI_FIELD:bug_title}}", content: "{{AI_FIELD:bug_details}}" },
          validationState: { missingRequired: ["databaseId"] }
        }
      },
      {
        id: "chain-2-slack",
        type: "custom",
        position: { x: 750, y: 730 },
        data: {
          type: "slack_action_send_message",
          title: "Notify Team Lead",
          description: "Update team about high priority issue",
          parentChainIndex: 1,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { channelId: "", message: "{{AI_FIELD:team_notification}}" },
          validationState: { missingRequired: ["channelId"] }
        }
      },
      {
        id: "chain-3-notion",
        type: "custom",
        position: { x: 1300, y: 530 },
        data: {
          type: "notion_action_create_page",
          title: "Add to Backlog",
          description: "Create standard bug entry",
          parentChainIndex: 2,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { databaseId: "", title: "{{AI_FIELD:bug_title}}", content: "{{AI_FIELD:bug_details}}" },
          validationState: { missingRequired: ["databaseId"] }
        }
      }
    ],
    connections: [
      { id: "e1", source: "discord-trigger-1", target: "ai-agent-1" },
      { id: "e2", source: "ai-agent-1", target: "chain-1-notion" },
      { id: "e3", source: "ai-agent-1", target: "chain-2-notion" },
      { id: "e4", source: "ai-agent-1", target: "chain-3-notion" },
      { id: "e5", source: "chain-1-notion", target: "chain-1-slack" },
      { id: "e6", source: "chain-2-notion", target: "chain-2-slack" }
    ]
  },
  {
    name: 'Social Media Sentiment Router',
    description: 'Monitor social mentions, analyze sentiment with AI, and route positive feedback to marketing, negative to support, neutral to community team',
    category: 'Social Media',
    tags: ['ai-agent', 'social-media', 'sentiment', 'customer-service'],
    integrations: ['discord', 'slack', 'airtable'],
    difficulty: 'intermediate',
    estimated_time: '5 mins',
    is_public: true,
    is_predefined: true,
    nodes: [
      {
        id: "discord-trigger-1",
        type: "custom",
        position: { x: 750, y: 50 },
        data: {
          type: "discord_trigger_new_message",
          title: "Social Mention in Discord",
          description: "Monitors community channel",
          isTrigger: true,
          config: { channelId: "", includeBot: false },
          validationState: { missingRequired: ["channelId"] }
        }
      },
      {
        id: "ai-agent-1",
        type: "custom",
        position: { x: 750, y: 280 },
        data: {
          type: "ai_agent",
          title: "Sentiment Analysis Agent",
          description: "Analyzes message sentiment and intent",
          config: {
            model: "gpt-4o-mini",
            temperature: 0.2,
            autoSelectChain: true,
            prompt: "Analyze the sentiment (positive/negative/neutral) and categorize the message intent.",
            chainsLayout: {
              chains: [
                { id: "chain-positive", name: "Positive Feedback", description: "Happy customers and testimonials", conditions: [{ field: "sentiment", operator: "equals", value: "positive" }] },
                { id: "chain-negative", name: "Negative Feedback", description: "Complaints and issues", conditions: [{ field: "sentiment", operator: "equals", value: "negative" }] },
                { id: "chain-neutral", name: "General Discussion", description: "Questions and neutral comments", conditions: [{ field: "sentiment", operator: "equals", value: "neutral" }] }
              ],
              nodes: [],
              edges: []
            }
          }
        }
      },
      {
        id: "chain-1-airtable",
        type: "custom",
        position: { x: 200, y: 530 },
        data: {
          type: "airtable_action_create_record",
          title: "Save Testimonial",
          description: "Store positive feedback",
          parentChainIndex: 0,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { baseId: "", tableName: "", fields: { "Customer": "{{AI_FIELD:customer}}", "Feedback": "{{AI_FIELD:feedback}}", "Type": "Testimonial" } },
          validationState: { missingRequired: ["baseId", "tableName"] }
        }
      },
      {
        id: "chain-1-slack",
        type: "custom",
        position: { x: 200, y: 730 },
        data: {
          type: "slack_action_send_message",
          title: "Share with Marketing",
          description: "Post to marketing channel",
          parentChainIndex: 0,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { channelId: "", message: "{{AI_FIELD:marketing_message}}" },
          validationState: { missingRequired: ["channelId"] }
        }
      },
      {
        id: "chain-2-airtable",
        type: "custom",
        position: { x: 750, y: 530 },
        data: {
          type: "airtable_action_create_record",
          title: "Create Support Ticket",
          description: "Log complaint",
          parentChainIndex: 1,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { baseId: "", tableName: "", fields: { "Customer": "{{AI_FIELD:customer}}", "Issue": "{{AI_FIELD:issue}}", "Priority": "{{AI_FIELD:priority}}" } },
          validationState: { missingRequired: ["baseId", "tableName"] }
        }
      },
      {
        id: "chain-2-slack",
        type: "custom",
        position: { x: 750, y: 730 },
        data: {
          type: "slack_action_send_message",
          title: "Alert Support Team",
          description: "Urgent support notification",
          parentChainIndex: 1,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { channelId: "", message: "{{AI_FIELD:support_alert}}" },
          validationState: { missingRequired: ["channelId"] }
        }
      },
      {
        id: "chain-3-airtable",
        type: "custom",
        position: { x: 1300, y: 530 },
        data: {
          type: "airtable_action_create_record",
          title: "Log Discussion",
          description: "Track community engagement",
          parentChainIndex: 2,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { baseId: "", tableName: "", fields: { "User": "{{AI_FIELD:user}}", "Topic": "{{AI_FIELD:topic}}", "Type": "Discussion" } },
          validationState: { missingRequired: ["baseId", "tableName"] }
        }
      }
    ],
    connections: [
      { id: "e1", source: "discord-trigger-1", target: "ai-agent-1" },
      { id: "e2", source: "ai-agent-1", target: "chain-1-airtable" },
      { id: "e3", source: "ai-agent-1", target: "chain-2-airtable" },
      { id: "e4", source: "ai-agent-1", target: "chain-3-airtable" },
      { id: "e5", source: "chain-1-airtable", target: "chain-1-slack" },
      { id: "e6", source: "chain-2-airtable", target: "chain-2-slack" }
    ]
  },
  {
    name: 'Content Publishing Workflow',
    description: 'When new content is ready, AI reviews quality, SEO, and routes to appropriate publishing channels while notifying stakeholders',
    category: 'Content Management',
    tags: ['ai-agent', 'content', 'publishing', 'notion', 'slack'],
    integrations: ['notion', 'slack', 'airtable'],
    difficulty: 'intermediate',
    estimated_time: '4 mins',
    is_public: true,
    is_predefined: true,
    nodes: [
      {
        id: "airtable-trigger-1",
        type: "custom",
        position: { x: 750, y: 50 },
        data: {
          type: "airtable_trigger_new_record",
          title: "New Content Submitted",
          description: "Content ready for review",
          isTrigger: true,
          config: { baseId: "", tableName: "" },
          validationState: { missingRequired: ["baseId", "tableName"] }
        }
      },
      {
        id: "ai-agent-1",
        type: "custom",
        position: { x: 750, y: 280 },
        data: {
          type: "ai_agent",
          title: "Content Review Agent",
          description: "Checks quality and routes to channels",
          config: {
            model: "gpt-4o-mini",
            temperature: 0.3,
            autoSelectChain: true,
            prompt: "Review content quality, check SEO optimization, and determine which publishing channels are appropriate (blog, social, newsletter).",
            chainsLayout: {
              chains: [
                { id: "chain-blog", name: "Blog Publishing", description: "Long-form content for blog", conditions: [{ field: "content.type", operator: "equals", value: "blog" }] },
                { id: "chain-social", name: "Social Media", description: "Short-form social posts", conditions: [{ field: "content.type", operator: "equals", value: "social" }] },
                { id: "chain-newsletter", name: "Newsletter", description: "Email newsletter content", conditions: [{ field: "content.type", operator: "equals", value: "newsletter" }] }
              ],
              nodes: [],
              edges: []
            }
          }
        }
      },
      {
        id: "chain-1-notion",
        type: "custom",
        position: { x: 200, y: 530 },
        data: {
          type: "notion_action_create_page",
          title: "Publish to Blog Database",
          description: "Add to published blog posts",
          parentChainIndex: 0,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { databaseId: "", title: "{{AI_FIELD:blog_title}}", content: "{{AI_FIELD:content}}" },
          validationState: { missingRequired: ["databaseId"] }
        }
      },
      {
        id: "chain-1-slack",
        type: "custom",
        position: { x: 200, y: 730 },
        data: {
          type: "slack_action_send_message",
          title: "Notify Marketing Team",
          description: "New blog post published",
          parentChainIndex: 0,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { channelId: "", message: "{{AI_FIELD:blog_notification}}" },
          validationState: { missingRequired: ["channelId"] }
        }
      },
      {
        id: "chain-2-airtable",
        type: "custom",
        position: { x: 750, y: 530 },
        data: {
          type: "airtable_action_create_record",
          title: "Schedule Social Posts",
          description: "Add to social media calendar",
          parentChainIndex: 1,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { baseId: "", tableName: "", fields: { "Post": "{{AI_FIELD:social_post}}", "Scheduled": "{{AI_FIELD:publish_date}}", "Platform": "{{AI_FIELD:platform}}" } },
          validationState: { missingRequired: ["baseId", "tableName"] }
        }
      },
      {
        id: "chain-2-slack",
        type: "custom",
        position: { x: 750, y: 730 },
        data: {
          type: "slack_action_send_message",
          title: "Notify Social Team",
          description: "New posts scheduled",
          parentChainIndex: 1,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { channelId: "", message: "{{AI_FIELD:social_notification}}" },
          validationState: { missingRequired: ["channelId"] }
        }
      },
      {
        id: "chain-3-airtable",
        type: "custom",
        position: { x: 1300, y: 530 },
        data: {
          type: "airtable_action_create_record",
          title: "Add to Newsletter Queue",
          description: "Queue for next newsletter",
          parentChainIndex: 2,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { baseId: "", tableName: "", fields: { "Title": "{{AI_FIELD:newsletter_title}}", "Content": "{{AI_FIELD:content}}", "Status": "Queued" } },
          validationState: { missingRequired: ["baseId", "tableName"] }
        }
      },
      {
        id: "chain-3-slack",
        type: "custom",
        position: { x: 1300, y: 730 },
        data: {
          type: "slack_action_send_message",
          title: "Notify Newsletter Team",
          description: "Content ready for newsletter",
          parentChainIndex: 2,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { channelId: "", message: "{{AI_FIELD:newsletter_notification}}" },
          validationState: { missingRequired: ["channelId"] }
        }
      }
    ],
    connections: [
      { id: "e1", source: "airtable-trigger-1", target: "ai-agent-1" },
      { id: "e2", source: "ai-agent-1", target: "chain-1-notion" },
      { id: "e3", source: "ai-agent-1", target: "chain-2-airtable" },
      { id: "e4", source: "ai-agent-1", target: "chain-3-airtable" },
      { id: "e5", source: "chain-1-notion", target: "chain-1-slack" },
      { id: "e6", source: "chain-2-airtable", target: "chain-2-slack" },
      { id: "e7", source: "chain-3-airtable", target: "chain-3-slack" }
    ]
  },
  {
    name: 'Customer Feedback Analysis & Routing',
    description: 'Analyze customer survey responses, categorize feedback, and route to product, support, or sales teams with actionable insights',
    category: 'Customer Success',
    tags: ['ai-agent', 'feedback', 'surveys', 'customer-experience'],
    integrations: ['airtable', 'slack', 'notion'],
    difficulty: 'intermediate',
    estimated_time: '4 mins',
    is_public: true,
    is_predefined: true,
    nodes: [
      {
        id: "airtable-trigger-1",
        type: "custom",
        position: { x: 750, y: 50 },
        data: {
          type: "airtable_trigger_new_record",
          title: "New Survey Response",
          description: "Customer feedback submitted",
          isTrigger: true,
          config: { baseId: "", tableName: "" },
          validationState: { missingRequired: ["baseId", "tableName"] }
        }
      },
      {
        id: "ai-agent-1",
        type: "custom",
        position: { x: 750, y: 280 },
        data: {
          type: "ai_agent",
          title: "Feedback Analysis Agent",
          description: "Categorizes feedback by type and urgency",
          config: {
            model: "gpt-4o-mini",
            temperature: 0.2,
            autoSelectChain: true,
            prompt: "Analyze customer feedback and categorize as feature request, bug report, or general praise. Determine which team needs to see this.",
            chainsLayout: {
              chains: [
                { id: "chain-product", name: "Product Feature Request", description: "Route to product team", conditions: [{ field: "feedback.category", operator: "equals", value: "feature" }] },
                { id: "chain-support", name: "Bug or Issue", description: "Route to support", conditions: [{ field: "feedback.category", operator: "equals", value: "bug" }] },
                { id: "chain-success", name: "Positive Feedback", description: "Share with team", conditions: [{ field: "feedback.category", operator: "equals", value: "praise" }] }
              ],
              nodes: [],
              edges: []
            }
          }
        }
      },
      {
        id: "chain-1-notion",
        type: "custom",
        position: { x: 200, y: 530 },
        data: {
          type: "notion_action_create_page",
          title: "Add to Product Roadmap",
          description: "Document feature request",
          parentChainIndex: 0,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { databaseId: "", title: "{{AI_FIELD:feature_title}}", content: "{{AI_FIELD:feature_details}}" },
          validationState: { missingRequired: ["databaseId"] }
        }
      },
      {
        id: "chain-1-slack",
        type: "custom",
        position: { x: 200, y: 730 },
        data: {
          type: "slack_action_send_message",
          title: "Notify Product Team",
          description: "New feature request",
          parentChainIndex: 0,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { channelId: "", message: "{{AI_FIELD:product_notification}}" },
          validationState: { missingRequired: ["channelId"] }
        }
      },
      {
        id: "chain-2-airtable",
        type: "custom",
        position: { x: 750, y: 530 },
        data: {
          type: "airtable_action_create_record",
          title: "Create Support Ticket",
          description: "Log bug report",
          parentChainIndex: 1,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { baseId: "", tableName: "", fields: { "Issue": "{{AI_FIELD:issue}}", "Customer": "{{AI_FIELD:customer}}", "Priority": "{{AI_FIELD:priority}}" } },
          validationState: { missingRequired: ["baseId", "tableName"] }
        }
      },
      {
        id: "chain-2-slack",
        type: "custom",
        position: { x: 750, y: 730 },
        data: {
          type: "slack_action_send_message",
          title: "Alert Support Team",
          description: "Customer-reported bug",
          parentChainIndex: 1,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { channelId: "", message: "{{AI_FIELD:support_alert}}" },
          validationState: { missingRequired: ["channelId"] }
        }
      },
      {
        id: "chain-3-airtable",
        type: "custom",
        position: { x: 1300, y: 530 },
        data: {
          type: "airtable_action_update_record",
          title: "Mark as Testimonial",
          description: "Tag positive feedback",
          parentChainIndex: 2,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { baseId: "", tableName: "", recordId: "{{trigger.recordId}}", fields: { "Type": "Testimonial", "Share": "Yes" } },
          validationState: { missingRequired: ["baseId", "tableName"] }
        }
      },
      {
        id: "chain-3-slack",
        type: "custom",
        position: { x: 1300, y: 730 },
        data: {
          type: "slack_action_send_message",
          title: "Share with Team",
          description: "Celebrate customer success",
          parentChainIndex: 2,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { channelId: "", message: "{{AI_FIELD:success_message}}" },
          validationState: { missingRequired: ["channelId"] }
        }
      }
    ],
    connections: [
      { id: "e1", source: "airtable-trigger-1", target: "ai-agent-1" },
      { id: "e2", source: "ai-agent-1", target: "chain-1-notion" },
      { id: "e3", source: "ai-agent-1", target: "chain-2-airtable" },
      { id: "e4", source: "ai-agent-1", target: "chain-3-airtable" },
      { id: "e5", source: "chain-1-notion", target: "chain-1-slack" },
      { id: "e6", source: "chain-2-airtable", target: "chain-2-slack" },
      { id: "e7", source: "chain-3-airtable", target: "chain-3-slack" }
    ]
  },
  {
    name: 'Invoice Processing & Approval',
    description: 'AI extracts invoice data from emails, categorizes expenses, routes for approval, and files in accounting system',
    category: 'Finance & Accounting',
    tags: ['ai-agent', 'invoices', 'finance', 'approval', 'gmail'],
    integrations: ['gmail', 'airtable', 'slack'],
    difficulty: 'advanced',
    estimated_time: '6 mins',
    is_public: true,
    is_predefined: true,
    nodes: [
      {
        id: "gmail-trigger-1",
        type: "custom",
        position: { x: 750, y: 50 },
        data: {
          type: "gmail_trigger_new_email",
          title: "Invoice Email Received",
          description: "Monitors inbox for invoices",
          isTrigger: true,
          config: { labelId: "INBOX" },
          validationState: { missingRequired: [] }
        }
      },
      {
        id: "ai-agent-1",
        type: "custom",
        position: { x: 750, y: 280 },
        data: {
          type: "ai_agent",
          title: "Invoice Processing Agent",
          description: "Extracts data and categorizes expenses",
          config: {
            model: "gpt-4o-mini",
            temperature: 0.1,
            autoSelectChain: true,
            prompt: "Extract invoice details (vendor, amount, category) and determine approval path based on amount and expense category.",
            chainsLayout: {
              chains: [
                { id: "chain-high", name: "High Value Invoice", description: "Requires executive approval", conditions: [{ field: "invoice.amount", operator: "gt", value: "5000" }] },
                { id: "chain-medium", name: "Standard Invoice", description: "Manager approval needed", conditions: [{ field: "invoice.amount", operator: "between", value: ["500", "5000"] }] },
                { id: "chain-low", name: "Auto-Approve", description: "Under threshold for auto-approval", conditions: [{ field: "invoice.amount", operator: "lt", value: "500" }] }
              ],
              nodes: [],
              edges: []
            }
          }
        }
      },
      {
        id: "chain-1-airtable",
        type: "custom",
        position: { x: 200, y: 530 },
        data: {
          type: "airtable_action_create_record",
          title: "Log High Value Invoice",
          description: "Create invoice record",
          parentChainIndex: 0,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { baseId: "", tableName: "", fields: { "Vendor": "{{AI_FIELD:vendor}}", "Amount": "{{AI_FIELD:amount}}", "Status": "Pending Executive Approval" } },
          validationState: { missingRequired: ["baseId", "tableName"] }
        }
      },
      {
        id: "chain-1-slack",
        type: "custom",
        position: { x: 200, y: 730 },
        data: {
          type: "slack_action_send_message",
          title: "Request Executive Approval",
          description: "Notify CFO for approval",
          parentChainIndex: 0,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { channelId: "", message: "{{AI_FIELD:executive_approval_request}}" },
          validationState: { missingRequired: ["channelId"] }
        }
      },
      {
        id: "chain-2-airtable",
        type: "custom",
        position: { x: 750, y: 530 },
        data: {
          type: "airtable_action_create_record",
          title: "Log Standard Invoice",
          description: "Create invoice record",
          parentChainIndex: 1,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { baseId: "", tableName: "", fields: { "Vendor": "{{AI_FIELD:vendor}}", "Amount": "{{AI_FIELD:amount}}", "Status": "Pending Manager Approval" } },
          validationState: { missingRequired: ["baseId", "tableName"] }
        }
      },
      {
        id: "chain-2-slack",
        type: "custom",
        position: { x: 750, y: 730 },
        data: {
          type: "slack_action_send_message",
          title: "Request Manager Approval",
          description: "Notify department manager",
          parentChainIndex: 1,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { channelId: "", message: "{{AI_FIELD:manager_approval_request}}" },
          validationState: { missingRequired: ["channelId"] }
        }
      },
      {
        id: "chain-3-airtable",
        type: "custom",
        position: { x: 1300, y: 530 },
        data: {
          type: "airtable_action_create_record",
          title: "Log & Auto-Approve",
          description: "Create approved invoice record",
          parentChainIndex: 2,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { baseId: "", tableName: "", fields: { "Vendor": "{{AI_FIELD:vendor}}", "Amount": "{{AI_FIELD:amount}}", "Status": "Auto-Approved" } },
          validationState: { missingRequired: ["baseId", "tableName"] }
        }
      },
      {
        id: "chain-3-slack",
        type: "custom",
        position: { x: 1300, y: 730 },
        data: {
          type: "slack_action_send_message",
          title: "Notify Accounting",
          description: "Invoice ready for payment",
          parentChainIndex: 2,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { channelId: "", message: "{{AI_FIELD:accounting_notification}}" },
          validationState: { missingRequired: ["channelId"] }
        }
      }
    ],
    connections: [
      { id: "e1", source: "gmail-trigger-1", target: "ai-agent-1" },
      { id: "e2", source: "ai-agent-1", target: "chain-1-airtable" },
      { id: "e3", source: "ai-agent-1", target: "chain-2-airtable" },
      { id: "e4", source: "ai-agent-1", target: "chain-3-airtable" },
      { id: "e5", source: "chain-1-airtable", target: "chain-1-slack" },
      { id: "e6", source: "chain-2-airtable", target: "chain-2-slack" },
      { id: "e7", source: "chain-3-airtable", target: "chain-3-slack" }
    ]
  },
  {
    name: 'HR Onboarding Automation',
    description: 'When a new employee starts, AI orchestrates account creation, welcome emails, task assignments, and team introductions',
    category: 'Human Resources',
    tags: ['ai-agent', 'hr', 'onboarding', 'employee-management'],
    integrations: ['airtable', 'gmail', 'slack'],
    difficulty: 'intermediate',
    estimated_time: '5 mins',
    is_public: true,
    is_predefined: true,
    nodes: [
      {
        id: "airtable-trigger-1",
        type: "custom",
        position: { x: 750, y: 50 },
        data: {
          type: "airtable_trigger_new_record",
          title: "New Employee Added",
          description: "HR adds new hire to system",
          isTrigger: true,
          config: { baseId: "", tableName: "" },
          validationState: { missingRequired: ["baseId", "tableName"] }
        }
      },
      {
        id: "ai-agent-1",
        type: "custom",
        position: { x: 750, y: 280 },
        data: {
          type: "ai_agent",
          title: "Onboarding Coordinator Agent",
          description: "Orchestrates onboarding based on role and department",
          config: {
            model: "gpt-4o-mini",
            temperature: 0.2,
            autoSelectChain: true,
            prompt: "Based on employee role and department, create personalized onboarding tasks and determine which teams to introduce them to.",
            chainsLayout: {
              chains: [
                { id: "chain-engineering", name: "Engineering Onboarding", description: "Dev environment setup", conditions: [{ field: "employee.department", operator: "equals", value: "engineering" }] },
                { id: "chain-sales", name: "Sales Onboarding", description: "CRM and tools access", conditions: [{ field: "employee.department", operator: "equals", value: "sales" }] },
                { id: "chain-general", name: "General Onboarding", description: "Standard company setup", conditions: [{ field: "employee.department", operator: "not_in", value: ["engineering", "sales"] }] }
              ],
              nodes: [],
              edges: []
            }
          }
        }
      },
      {
        id: "chain-1-airtable",
        type: "custom",
        position: { x: 200, y: 530 },
        data: {
          type: "airtable_action_create_record",
          title: "Create Tech Setup Tasks",
          description: "Dev tools and access",
          parentChainIndex: 0,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { baseId: "", tableName: "", fields: { "Task": "{{AI_FIELD:tech_tasks}}", "Assignee": "IT Team", "Due": "{{AI_FIELD:due_date}}" } },
          validationState: { missingRequired: ["baseId", "tableName"] }
        }
      },
      {
        id: "chain-1-gmail",
        type: "custom",
        position: { x: 200, y: 730 },
        data: {
          type: "gmail_action_send_email",
          title: "Send Engineering Welcome",
          description: "Welcome email with resources",
          parentChainIndex: 0,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { to: "{{AI_FIELD:employee_email}}", subject: "{{AI_FIELD:welcome_subject}}", body: "{{AI_FIELD:eng_welcome_body}}" }
        }
      },
      {
        id: "chain-2-airtable",
        type: "custom",
        position: { x: 750, y: 530 },
        data: {
          type: "airtable_action_create_record",
          title: "Create Sales Training Tasks",
          description: "CRM setup and training schedule",
          parentChainIndex: 1,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { baseId: "", tableName: "", fields: { "Task": "{{AI_FIELD:sales_tasks}}", "Assignee": "Sales Manager", "Due": "{{AI_FIELD:due_date}}" } },
          validationState: { missingRequired: ["baseId", "tableName"] }
        }
      },
      {
        id: "chain-2-gmail",
        type: "custom",
        position: { x: 750, y: 730 },
        data: {
          type: "gmail_action_send_email",
          title: "Send Sales Welcome",
          description: "Welcome with playbook",
          parentChainIndex: 1,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { to: "{{AI_FIELD:employee_email}}", subject: "{{AI_FIELD:welcome_subject}}", body: "{{AI_FIELD:sales_welcome_body}}" }
        }
      },
      {
        id: "chain-3-airtable",
        type: "custom",
        position: { x: 1300, y: 530 },
        data: {
          type: "airtable_action_create_record",
          title: "Create Standard Tasks",
          description: "General onboarding checklist",
          parentChainIndex: 2,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { baseId: "", tableName: "", fields: { "Task": "{{AI_FIELD:general_tasks}}", "Assignee": "HR Team", "Due": "{{AI_FIELD:due_date}}" } },
          validationState: { missingRequired: ["baseId", "tableName"] }
        }
      },
      {
        id: "chain-3-slack",
        type: "custom",
        position: { x: 1300, y: 730 },
        data: {
          type: "slack_action_send_message",
          title: "Announce New Hire",
          description: "Introduce to team channel",
          parentChainIndex: 2,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { channelId: "", message: "{{AI_FIELD:team_introduction}}" },
          validationState: { missingRequired: ["channelId"] }
        }
      }
    ],
    connections: [
      { id: "e1", source: "airtable-trigger-1", target: "ai-agent-1" },
      { id: "e2", source: "ai-agent-1", target: "chain-1-airtable" },
      { id: "e3", source: "ai-agent-1", target: "chain-2-airtable" },
      { id: "e4", source: "ai-agent-1", target: "chain-3-airtable" },
      { id: "e5", source: "chain-1-airtable", target: "chain-1-gmail" },
      { id: "e6", source: "chain-2-airtable", target: "chain-2-gmail" },
      { id: "e7", source: "chain-3-airtable", target: "chain-3-slack" }
    ]
  },
  {
    name: 'Meeting Automation Suite',
    description: 'Schedules meetings based on email requests, creates agendas, sends calendar invites, and prepares meeting materials automatically',
    category: 'Productivity',
    tags: ['ai-agent', 'meetings', 'scheduling', 'calendar'],
    integrations: ['gmail', 'notion', 'slack'],
    difficulty: 'intermediate',
    estimated_time: '4 mins',
    is_public: true,
    is_predefined: true,
    nodes: [
      {
        id: "gmail-trigger-1",
        type: "custom",
        position: { x: 750, y: 50 },
        data: {
          type: "gmail_trigger_new_email",
          title: "Meeting Request Email",
          description: "Detects meeting request keywords",
          isTrigger: true,
          config: { labelId: "INBOX" },
          validationState: { missingRequired: [] }
        }
      },
      {
        id: "ai-agent-1",
        type: "custom",
        position: { x: 750, y: 280 },
        data: {
          type: "ai_agent",
          title: "Meeting Scheduler Agent",
          description: "Determines meeting type and prepares accordingly",
          config: {
            model: "gpt-4o-mini",
            temperature: 0.3,
            autoSelectChain: true,
            prompt: "Analyze meeting request and categorize as client meeting, internal sync, or brainstorming session. Prepare appropriate materials.",
            chainsLayout: {
              chains: [
                { id: "chain-client", name: "Client Meeting", description: "External stakeholder meeting", conditions: [{ field: "email.from", operator: "not_contains", value: "@company.com" }] },
                { id: "chain-internal", name: "Internal Sync", description: "Team status update", conditions: [{ field: "meeting.type", operator: "equals", value: "sync" }] },
                { id: "chain-brainstorm", name: "Brainstorming Session", description: "Creative collaboration", conditions: [{ field: "meeting.type", operator: "equals", value: "brainstorm" }] }
              ],
              nodes: [],
              edges: []
            }
          }
        }
      },
      {
        id: "chain-1-notion",
        type: "custom",
        position: { x: 200, y: 530 },
        data: {
          type: "notion_action_create_page",
          title: "Create Client Meeting Agenda",
          description: "Professional agenda with talking points",
          parentChainIndex: 0,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { databaseId: "", title: "{{AI_FIELD:meeting_title}}", content: "{{AI_FIELD:client_agenda}}" },
          validationState: { missingRequired: ["databaseId"] }
        }
      },
      {
        id: "chain-1-gmail",
        type: "custom",
        position: { x: 200, y: 730 },
        data: {
          type: "gmail_action_send_email",
          title: "Send Calendar Invite",
          description: "Formal meeting invitation",
          parentChainIndex: 0,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { to: "{{AI_FIELD:attendees}}", subject: "{{AI_FIELD:invite_subject}}", body: "{{AI_FIELD:invite_body}}" }
        }
      },
      {
        id: "chain-2-notion",
        type: "custom",
        position: { x: 750, y: 530 },
        data: {
          type: "notion_action_create_page",
          title: "Create Sync Meeting Doc",
          description: "Simple status update template",
          parentChainIndex: 1,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { databaseId: "", title: "{{AI_FIELD:meeting_title}}", content: "{{AI_FIELD:sync_template}}" },
          validationState: { missingRequired: ["databaseId"] }
        }
      },
      {
        id: "chain-2-slack",
        type: "custom",
        position: { x: 750, y: 730 },
        data: {
          type: "slack_action_send_message",
          title: "Quick Meeting Reminder",
          description: "Slack notification to team",
          parentChainIndex: 1,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { channelId: "", message: "{{AI_FIELD:meeting_reminder}}" },
          validationState: { missingRequired: ["channelId"] }
        }
      },
      {
        id: "chain-3-notion",
        type: "custom",
        position: { x: 1300, y: 530 },
        data: {
          type: "notion_action_create_page",
          title: "Create Brainstorm Board",
          description: "Collaborative whiteboard setup",
          parentChainIndex: 2,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { databaseId: "", title: "{{AI_FIELD:meeting_title}}", content: "{{AI_FIELD:brainstorm_template}}" },
          validationState: { missingRequired: ["databaseId"] }
        }
      },
      {
        id: "chain-3-slack",
        type: "custom",
        position: { x: 1300, y: 730 },
        data: {
          type: "slack_action_send_message",
          title: "Share Pre-Work",
          description: "Send prep materials",
          parentChainIndex: 2,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { channelId: "", message: "{{AI_FIELD:prework_message}}" },
          validationState: { missingRequired: ["channelId"] }
        }
      }
    ],
    connections: [
      { id: "e1", source: "gmail-trigger-1", target: "ai-agent-1" },
      { id: "e2", source: "ai-agent-1", target: "chain-1-notion" },
      { id: "e3", source: "ai-agent-1", target: "chain-2-notion" },
      { id: "e4", source: "ai-agent-1", target: "chain-3-notion" },
      { id: "e5", source: "chain-1-notion", target: "chain-1-gmail" },
      { id: "e6", source: "chain-2-notion", target: "chain-2-slack" },
      { id: "e7", source: "chain-3-notion", target: "chain-3-slack" }
    ]
  },
  {
    name: 'Inventory Management & Reordering',
    description: 'Monitors inventory levels, predicts stock-outs, automatically orders from suppliers, and notifies warehouse team',
    category: 'Operations',
    tags: ['ai-agent', 'inventory', 'supply-chain', 'automation'],
    integrations: ['airtable', 'gmail', 'slack'],
    difficulty: 'advanced',
    estimated_time: '5 mins',
    is_public: true,
    is_predefined: true,
    nodes: [
      {
        id: "airtable-trigger-1",
        type: "custom",
        position: { x: 750, y: 50 },
        data: {
          type: "airtable_trigger_record_updated",
          title: "Inventory Level Changed",
          description: "Stock quantity updated",
          isTrigger: true,
          config: { baseId: "", tableName: "" },
          validationState: { missingRequired: ["baseId", "tableName"] }
        }
      },
      {
        id: "ai-agent-1",
        type: "custom",
        position: { x: 750, y: 280 },
        data: {
          type: "ai_agent",
          title: "Inventory Management Agent",
          description: "Predicts needs and manages reordering",
          config: {
            model: "gpt-4o-mini",
            temperature: 0.1,
            autoSelectChain: true,
            prompt: "Analyze stock levels and categorize urgency. Check if immediate order, upcoming order, or monitoring is needed.",
            chainsLayout: {
              chains: [
                { id: "chain-critical", name: "Critical Low Stock", description: "Urgent reorder needed", conditions: [{ field: "stock.level", operator: "lt", value: "10" }] },
                { id: "chain-reorder", name: "Reorder Point", description: "Standard reorder process", conditions: [{ field: "stock.level", operator: "between", value: ["10", "30"] }] },
                { id: "chain-monitor", name: "Monitor Stock", description: "Track trending items", conditions: [{ field: "stock.velocity", operator: "equals", value: "high" }] }
              ],
              nodes: [],
              edges: []
            }
          }
        }
      },
      {
        id: "chain-1-gmail",
        type: "custom",
        position: { x: 200, y: 530 },
        data: {
          type: "gmail_action_send_email",
          title: "Rush Order to Supplier",
          description: "Expedited delivery request",
          parentChainIndex: 0,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { to: "{{AI_FIELD:supplier_email}}", subject: "{{AI_FIELD:rush_order_subject}}", body: "{{AI_FIELD:rush_order_body}}" }
        }
      },
      {
        id: "chain-1-slack",
        type: "custom",
        position: { x: 200, y: 730 },
        data: {
          type: "slack_action_send_message",
          title: "Alert Warehouse Manager",
          description: "Critical stock level warning",
          parentChainIndex: 0,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { channelId: "", message: "{{AI_FIELD:critical_alert}}" },
          validationState: { missingRequired: ["channelId"] }
        }
      },
      {
        id: "chain-2-airtable",
        type: "custom",
        position: { x: 750, y: 530 },
        data: {
          type: "airtable_action_create_record",
          title: "Create Purchase Order",
          description: "Standard reorder quantity",
          parentChainIndex: 1,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { baseId: "", tableName: "", fields: { "Item": "{{AI_FIELD:item}}", "Quantity": "{{AI_FIELD:reorder_qty}}", "Status": "Pending" } },
          validationState: { missingRequired: ["baseId", "tableName"] }
        }
      },
      {
        id: "chain-2-gmail",
        type: "custom",
        position: { x: 750, y: 730 },
        data: {
          type: "gmail_action_send_email",
          title: "Send PO to Supplier",
          description: "Standard purchase order",
          parentChainIndex: 1,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { to: "{{AI_FIELD:supplier_email}}", subject: "{{AI_FIELD:po_subject}}", body: "{{AI_FIELD:po_body}}" }
        }
      },
      {
        id: "chain-3-airtable",
        type: "custom",
        position: { x: 1300, y: 530 },
        data: {
          type: "airtable_action_update_record",
          title: "Flag for Monitoring",
          description: "Track trending item",
          parentChainIndex: 2,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { baseId: "", tableName: "", recordId: "{{trigger.recordId}}", fields: { "Status": "Trending", "Watch": "Yes" } },
          validationState: { missingRequired: ["baseId", "tableName"] }
        }
      },
      {
        id: "chain-3-slack",
        type: "custom",
        position: { x: 1300, y: 730 },
        data: {
          type: "slack_action_send_message",
          title: "Notify Operations Team",
          description: "Share trending data",
          parentChainIndex: 2,
          parentAIAgentId: "ai-agent-1",
          isAIAgentChild: true,
          config: { channelId: "", message: "{{AI_FIELD:trending_notification}}" },
          validationState: { missingRequired: ["channelId"] }
        }
      }
    ],
    connections: [
      { id: "e1", source: "airtable-trigger-1", target: "ai-agent-1" },
      { id: "e2", source: "ai-agent-1", target: "chain-1-gmail" },
      { id: "e3", source: "ai-agent-1", target: "chain-2-airtable" },
      { id: "e4", source: "ai-agent-1", target: "chain-3-airtable" },
      { id: "e5", source: "chain-1-gmail", target: "chain-1-slack" },
      { id: "e6", source: "chain-2-airtable", target: "chain-2-gmail" },
      { id: "e7", source: "chain-3-airtable", target: "chain-3-slack" }
    ]
  }
];

async function insertTemplates() {
  console.log('🚀 Adding 10 business automation templates...\n');

  let successCount = 0;
  let failCount = 0;

  for (const template of templates) {
    try {
      // Delete existing template with same name if it exists
      await supabase
        .from('templates')
        .delete()
        .eq('name', template.name)
        .eq('is_predefined', true);

      // Insert new template
      const { data, error } = await supabase
        .from('templates')
        .insert({
          ...template,
          workflow_json: { nodes: [], edges: [] }
        })
        .select()
        .single();

      if (error) {
        console.error(`❌ Failed to insert "${template.name}":`, error.message);
        failCount++;
      } else {
        console.log(`✅ Inserted: ${template.name}`);
        successCount++;
      }
    } catch (error) {
      console.error(`❌ Error processing "${template.name}":`, error);
      failCount++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Success: ${successCount}`);
  console.log(`   ❌ Failed: ${failCount}`);
  console.log(`\n✨ Template migration complete!`);
}

insertTemplates();
