import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  try {
    console.log('🚀 Running AI Agent template migration...');

    // First, delete existing template if it exists
    const { error: deleteError } = await supabase
      .from('templates')
      .delete()
      .eq('name', 'AI Agent Test Workflow - Customer Service')
      .eq('is_predefined', true);

    if (deleteError && deleteError.code !== 'PGRST116') {
      console.error('Error deleting existing template:', deleteError);
    } else {
      console.log('✅ Cleared existing template');
    }

    // Now insert the new template
    const templateData = {
      name: 'AI Agent Test Workflow - Customer Service',
      description: 'Complete test workflow with AI Agent handling support requests, feedback, and newsletter signups across Airtable, Discord, and Gmail',
      category: 'AI Agent Testing',
      tags: ['ai-agent', 'test', 'airtable', 'discord', 'gmail', 'complete'],
      integrations: ['airtable', 'discord', 'gmail'],
      difficulty: 'advanced',
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
            nodeComponent: {
              type: "discord_trigger_new_message",
              isTrigger: true
            },
            title: "New Discord Message",
            description: "Triggers when a new message is posted in a Discord channel.",
            config: {
              channelId: "",
              includeBot: false
            },
            isTrigger: true,
            validationState: {
              missingRequired: ["channelId"]
            }
          }
        },
        {
          id: "ai-router-helpdesk",
          type: "custom",
          position: { x: 320, y: 180 },
          data: {
            type: "ai_router",
            title: "Route Customer Request",
            description: "AI routing node that decides which follow-up branch to execute.",
            config: {
              template: "custom",
              systemPrompt: "You are a customer support triage bot. Classify the incoming Discord message into one of: support_request, feedback, newsletter_signup, general. Provide a short reason and confidence.",
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
            }
          }
        },
        {
          id: "support-summarize",
          type: "custom",
          position: { x: 200, y: 420 },
          data: {
            type: "ai_action_summarize",
            title: "Summarize Support Request",
            description: "Summarize the customer message to capture the core issue.",
            needsConfiguration: true,

            config: {
              inputText: "{{trigger.message.content}}",
              maxLength: 300,
              style: "brief",
              focus: "customer issue, requested assistance, urgency"
            }
          }
        },
        {
          id: "support-prioritize",
          type: "custom",
          position: { x: 200, y: 580 },
          data: {
            type: "ai_action_classify",
            title: "Classify Priority Level",
            description: "Classify the urgency of the support request.",
            needsConfiguration: true,

            config: {
              inputText: "{{trigger.message.content}}",
              categories: ["Low", "Medium", "High"],
              confidence: true
            }
          }
        },
        {
          id: "support-response",
          type: "custom",
          position: { x: 200, y: 740 },
          data: {
            type: "ai_action_generate",
            title: "Draft Support Reply",
            description: "Generate a friendly acknowledgement message with next steps.",
            needsConfiguration: true,

            config: {
              inputData: {
                customer: "{{trigger.message.author.username}}",
                summary: "{{support-summarize.summary}}",
                priority: "{{support-prioritize.classification}}"
              },
              prompt: "Use the structured context provided to craft a clear, helpful response. Address the customer's concern, acknowledge their situation, reference the ticket priority if provided (e.g. {{priority}}), and outline next steps. Maintain a confident and empathetic tone.",
              contentType: "response",
              tone: "friendly",
              length: "short"
            }
          }
        },
        {
          id: "airtable-support-ticket",
          type: "custom",
          position: { x: 200, y: 900 },
          data: {
            type: "airtable_action_create_record",
            title: "Create Support Ticket",
            description: "Create a new record in the support tickets table.",
            config: {
              baseId: "",
              tableName: "",
              fields: {
                "Ticket Summary": "{{support-summarize.summary}}",
                "Customer": "{{trigger.message.author.username}}",
                "Priority": "{{support-prioritize.classification}}",
                "Priority Confidence": "{{support-prioritize.confidence}}",
                "Status": "Open",
                "Channel": "Discord"
              }
            },
            validationState: {
              missingRequired: ["baseId", "tableName"]
            }
          }
        },
        {
          id: "discord-support-response",
          type: "custom",
          position: { x: 200, y: 1060 },
          data: {
            type: "discord_action_send_message",
            title: "Reply in Discord",
            description: "Send an acknowledgement back to the user in Discord.",
            config: {
              webhookUrl: "",
              message: "{{support-response.content}}",
              username: "Support Bot"
            },
            validationState: {
              missingRequired: ["webhookUrl"]
            }
          }
        },
        {
          id: "feedback-summarize",
          type: "custom",
          position: { x: 750, y: 420 },
          data: {
            type: "ai_action_summarize",
            title: "Summarize Feedback",
            description: "Extract the main feedback insight from the message.",
            needsConfiguration: true,

            config: {
              inputText: "{{trigger.message.content}}",
              maxLength: 220,
              style: "brief",
              focus: "product feedback and requested changes"
            }
          }
        },
        {
          id: "feedback-sentiment",
          type: "custom",
          position: { x: 750, y: 580 },
          data: {
            type: "ai_action_sentiment",
            title: "Analyze Sentiment",
            description: "Determine the sentiment of the feedback message.",
            needsConfiguration: true,

            config: {
              inputText: "{{trigger.message.content}}",
              analysisType: "detailed",
              labels: "Positive, Neutral, Negative"
            }
          }
        },
        {
          id: "feedback-response",
          type: "custom",
          position: { x: 750, y: 740 },
          data: {
            type: "ai_action_generate",
            title: "Draft Feedback Reply",
            description: "Generate a thoughtful acknowledgement for the feedback.",
            needsConfiguration: true,

            config: {
              inputData: {
                customer: "{{trigger.message.author.username}}",
                summary: "{{feedback-summarize.summary}}",
                sentiment: "{{feedback-sentiment.sentiment}}"
              },
              contentType: "response",
              tone: "friendly",
              length: "short"
            }
          }
        },
        {
          id: "airtable-feedback-log",
          type: "custom",
          position: { x: 750, y: 900 },
          data: {
            type: "airtable_action_create_record",
            title: "Log Feedback",
            description: "Store product feedback in Airtable.",
            config: {
              baseId: "",
              tableName: "",
              fields: {
                "Feedback Insight": "{{feedback-summarize.summary}}",
                "Feedback Summary": "{{feedback-summarize.summary}}",
                "Sentiment": "{{feedback-sentiment.sentiment}}",
                "Confidence": "{{feedback-sentiment.confidence}}",
                "Customer": "{{trigger.message.author.username}}",
                "Source": "Discord"
              }
            },
            validationState: {
              missingRequired: ["baseId", "tableName"]
            }
          }
        },
        {
          id: "discord-feedback-response",
          type: "custom",
          position: { x: 750, y: 1060 },
          data: {
            type: "discord_action_send_message",
            title: "Acknowledge Feedback",
            description: "Respond to the user thanking them for feedback.",
            config: {
              webhookUrl: "",
              message: "{{feedback-response.content}}",
              username: "Feedback Bot"
            },
            validationState: {
              missingRequired: ["webhookUrl"]
            }
          }
        },
        {
          id: "newsletter-extract",
          type: "custom",
          position: { x: 1300, y: 420 },
          data: {
            type: "ai_action_extract",
            title: "Extract Email Address",
            description: "Pull any email address mentioned in the message.",
            needsConfiguration: true,

            config: {
              inputText: "{{trigger.message.content}}",
              extractionType: "emails",
              returnFormat: "text"
            }
          }
        },
        {
          id: "newsletter-generate",
          type: "custom",
          position: { x: 1300, y: 580 },
          data: {
            type: "ai_action_generate",
            title: "Draft Welcome Email",
            description: "Generate a friendly welcome email summary.",
            needsConfiguration: true,

            config: {
              inputData: {
                subscriber: "{{trigger.message.author.username}}",
                inquiry: "{{trigger.message.content}}"
              },
              contentType: "email",
              tone: "friendly",
              length: "short"
            }
          }
        },
        {
          id: "airtable-newsletter",
          type: "custom",
          position: { x: 1300, y: 740 },
          data: {
            type: "airtable_action_create_record",
            title: "Add Newsletter Subscriber",
            description: "Store the subscriber details in Airtable.",
            config: {
              baseId: "",
              tableName: "",
              fields: {
                "Name": "{{trigger.message.author.username}}",
                "Email": "{{newsletter-extract.extracted}}",
                "Source": "Discord",
                "Status": "Subscribed"
              }
            },
            validationState: {
              missingRequired: ["baseId", "tableName"]
            }
          }
        },
        {
          id: "gmail-newsletter-welcome",
          type: "custom",
          position: { x: 1300, y: 900 },
          data: {
            type: "gmail_action_send_email",
            title: "Send Welcome Email",
            description: "Send a welcome email to the subscriber.",
            config: {
              to: "{{newsletter-extract.extracted}}",
              subject: "Welcome to our newsletter!",
              body: "{{newsletter-generate.content}}",
              isHtml: false
            }
          }
        },
        {
          id: "general-summarize",
          type: "custom",
          position: { x: 560, y: 520 },
          data: {
            type: "ai_action_summarize",
            title: "Summarize General Inquiry",
            description: "Capture a quick summary for unclassified requests.",
            needsConfiguration: true,

            config: {
              inputText: "{{trigger.message.content}}",
              maxLength: 200,
              style: "brief",
              focus: "primary request or question"
            }
          }
        },
        {
          id: "discord-general-log",
          type: "custom",
          position: { x: 560, y: 680 },
          data: {
            type: "discord_action_send_message",
            title: "General Log",
            description: "Log general inquiries in a Discord channel.",
            config: {
              webhookUrl: "",
              message: "General inquiry from {{trigger.message.author.username}}: {{general-summarize.summary}}",
              username: "Support Bot"
            },
            validationState: {
              missingRequired: ["webhookUrl"]
            }
          }
        }
      ],
      connections: [
        { id: "edge-main", source: "discord-trigger-1", target: "ai-router-helpdesk" },
        { id: "edge-support-1", source: "ai-router-helpdesk", target: "support-summarize", sourceHandle: "support_request" },
        { id: "edge-support-2", source: "support-summarize", target: "support-prioritize" },
        { id: "edge-support-3", source: "support-prioritize", target: "support-response" },
        { id: "edge-support-4", source: "support-response", target: "airtable-support-ticket" },
        { id: "edge-support-5", source: "airtable-support-ticket", target: "discord-support-response" },
        { id: "edge-feedback-1", source: "ai-router-helpdesk", target: "feedback-summarize", sourceHandle: "feedback" },
        { id: "edge-feedback-2", source: "feedback-summarize", target: "feedback-sentiment" },
        { id: "edge-feedback-3", source: "feedback-sentiment", target: "feedback-response" },
        { id: "edge-feedback-4", source: "feedback-response", target: "airtable-feedback-log" },
        { id: "edge-feedback-5", source: "airtable-feedback-log", target: "discord-feedback-response" },
        { id: "edge-newsletter-1", source: "ai-router-helpdesk", target: "newsletter-extract", sourceHandle: "newsletter_signup" },
        { id: "edge-newsletter-2", source: "newsletter-extract", target: "newsletter-generate" },
        { id: "edge-newsletter-3", source: "newsletter-generate", target: "airtable-newsletter" },
        { id: "edge-newsletter-4", source: "airtable-newsletter", target: "gmail-newsletter-welcome" },
        { id: "edge-general-1", source: "ai-router-helpdesk", target: "general-summarize", sourceHandle: "general" },
        { id: "edge-general-2", source: "general-summarize", target: "discord-general-log" }
      ],
      workflow_json: {
        nodes: [],
        edges: []
      }
    };

    const { data, error: insertError } = await supabase
      .from('templates')
      .insert(templateData)
      .select()
      .single();

    if (insertError) {
      console.error('❌ Error inserting template:', insertError);
      process.exit(1);
    }

    console.log('✅ Successfully inserted AI Agent template!');
    console.log('📋 Template ID:', data.id);
    console.log('📝 Template name:', data.name);
    console.log('🔢 Nodes:', templateData.nodes.length);
    console.log('🔗 Connections:', templateData.connections.length);

    console.log('\n✨ Template migration complete! You can now:');
    console.log('1. Go to the Templates page');
    console.log('2. Select "AI Agent Testing" category');
    console.log('3. Copy the template to create your workflow');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
