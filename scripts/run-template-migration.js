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
          id: "ai-agent-1",
          type: "custom",
          position: { x: 750, y: 220 },
          data: {
            type: "ai_agent",
            title: "AI Customer Service Agent",
            config: {
              model: "gpt-4o-mini",
              temperature: 0.7,
              autoSelectChain: true,
              parallelExecution: false,
              prompt: "Analyze the customer message and route to the appropriate chains based on the content.",
              chainsLayout: {
                chains: [
                  {
                    id: "chain-support-request",
                    name: "Support Request Chain",
                    description: "Handles customer support inquiries",
                    conditions: [
                      {
                        field: "message.content",
                        operator: "contains",
                        value: "help"
                      }
                    ]
                  },
                  {
                    id: "chain-process-feedback",
                    name: "Process Feedback Chain",
                    description: "Processes customer feedback",
                    conditions: [
                      {
                        field: "message.content",
                        operator: "contains",
                        value: "feedback"
                      }
                    ]
                  },
                  {
                    id: "chain-newsletter-signup",
                    name: "Newsletter Signup Chain",
                    description: "Handles newsletter subscriptions",
                    conditions: [
                      {
                        field: "message.content",
                        operator: "contains",
                        value: "newsletter"
                      }
                    ]
                  }
                ],
                nodes: [],
                edges: []
              }
            }
          }
        },
        {
          id: "chain-1-airtable-create",
          type: "custom",
          position: { x: 200, y: 450 },
          data: {
            type: "airtable_action_create_record",
            title: "Create Support Ticket",
            parentChainIndex: 0,
            parentAIAgentId: "ai-agent-1",
            isAIAgentChild: true,
            config: {
              baseId: "",
              tableName: "",
              fields: {
                "Ticket ID": "{{AI_FIELD:ticket_id}}",
                "Customer Email": "{{AI_FIELD:customer_email}}",
                "Issue Description": "{{AI_FIELD:issue_description}}",
                "Priority": "{{AI_FIELD:priority}}",
                "Status": "Open",
                "Created Date": "{{AI_FIELD:created_date}}",
                "Assigned To": "{{AI_FIELD:assigned_to}}"
              }
            },
            validationState: {
              missingRequired: ["baseId", "tableName"]
            }
          }
        },
        {
          id: "chain-1-discord-notify",
          type: "custom",
          position: { x: 200, y: 650 },
          data: {
            type: "discord_action_send_message",
            title: "Notify Support Team",
            parentChainIndex: 0,
            parentAIAgentId: "ai-agent-1",
            isAIAgentChild: true,
            config: {
              webhookUrl: "",
              message: "{{AI_FIELD:support_notification_message}}",
              username: "Support Bot"
            },
            validationState: {
              missingRequired: ["webhookUrl"]
            }
          }
        },
        {
          id: "chain-2-airtable-create",
          type: "custom",
          position: { x: 750, y: 450 },
          data: {
            type: "airtable_action_create_record",
            title: "Store Feedback",
            parentChainIndex: 1,
            parentAIAgentId: "ai-agent-1",
            isAIAgentChild: true,
            config: {
              baseId: "",
              tableName: "",
              fields: {
                "Feedback ID": "{{AI_FIELD:feedback_id}}",
                "Customer Name": "{{AI_FIELD:customer_name}}",
                "Feedback Type": "{{AI_FIELD:feedback_type}}",
                "Feedback Content": "{{AI_FIELD:feedback_content}}",
                "Rating": "{{AI_FIELD:rating}}",
                "Submitted Date": "{{AI_FIELD:submitted_date}}",
                "Response Status": "Pending"
              }
            },
            validationState: {
              missingRequired: ["baseId", "tableName"]
            }
          }
        },
        {
          id: "chain-2-discord-notify",
          type: "custom",
          position: { x: 750, y: 650 },
          data: {
            type: "discord_action_send_message",
            title: "Notify Feedback Team",
            parentChainIndex: 1,
            parentAIAgentId: "ai-agent-1",
            isAIAgentChild: true,
            config: {
              webhookUrl: "",
              message: "{{AI_FIELD:feedback_notification_message}}",
              username: "Feedback Bot"
            },
            validationState: {
              missingRequired: ["webhookUrl"]
            }
          }
        },
        {
          id: "chain-3-airtable-create",
          type: "custom",
          position: { x: 1300, y: 450 },
          data: {
            type: "airtable_action_create_record",
            title: "Add to Newsletter",
            parentChainIndex: 2,
            parentAIAgentId: "ai-agent-1",
            isAIAgentChild: true,
            config: {
              baseId: "",
              tableName: "",
              fields: {
                "Subscriber ID": "{{AI_FIELD:subscriber_id}}",
                "Email": "{{AI_FIELD:subscriber_email}}",
                "Name": "{{AI_FIELD:subscriber_name}}",
                "Signup Date": "{{AI_FIELD:signup_date}}",
                "Preferences": "{{AI_FIELD:preferences}}",
                "Status": "Active",
                "Welcome Email Sent": false
              }
            },
            validationState: {
              missingRequired: ["baseId", "tableName"]
            }
          }
        },
        {
          id: "chain-3-gmail-send",
          type: "custom",
          position: { x: 1300, y: 650 },
          data: {
            type: "gmail_action_send",
            title: "Send Welcome Email",
            parentChainIndex: 2,
            parentAIAgentId: "ai-agent-1",
            isAIAgentChild: true,
            config: {
              to: "{{AI_FIELD:welcome_email_to}}",
              subject: "{{AI_FIELD:welcome_email_subject}}",
              body: "{{AI_FIELD:welcome_email_body}}"
            }
          }
        }
      ],
      connections: [
        {
          id: "main-edge-1",
          source: "discord-trigger-1",
          target: "ai-agent-1"
        },
        {
          id: "ai-agent-to-chain-1",
          source: "ai-agent-1",
          target: "chain-1-airtable-create"
        },
        {
          id: "ai-agent-to-chain-2",
          source: "ai-agent-1",
          target: "chain-2-airtable-create"
        },
        {
          id: "ai-agent-to-chain-3",
          source: "ai-agent-1",
          target: "chain-3-airtable-create"
        },
        {
          id: "chain-1-edge-1",
          source: "chain-1-airtable-create",
          target: "chain-1-discord-notify"
        },
        {
          id: "chain-2-edge-1",
          source: "chain-2-airtable-create",
          target: "chain-2-discord-notify"
        },
        {
          id: "chain-3-edge-1",
          source: "chain-3-airtable-create",
          target: "chain-3-gmail-send"
        }
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