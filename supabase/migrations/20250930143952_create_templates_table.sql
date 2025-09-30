-- Create templates table that mirrors workflows table structure
CREATE TABLE IF NOT EXISTS public.templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'General',
  tags TEXT[] DEFAULT '{}',
  integrations TEXT[] DEFAULT '{}',
  difficulty TEXT DEFAULT 'intermediate',
  estimated_time TEXT DEFAULT '10 mins',

  -- Workflow data (same structure as workflows table)
  nodes JSONB DEFAULT '[]'::jsonb,
  connections JSONB DEFAULT '[]'::jsonb,

  -- Template metadata
  is_public BOOLEAN DEFAULT true,
  is_predefined BOOLEAN DEFAULT false,
  creator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX templates_category_idx ON public.templates(category);
CREATE INDEX templates_is_public_idx ON public.templates(is_public);
CREATE INDEX templates_is_predefined_idx ON public.templates(is_predefined);
CREATE INDEX templates_creator_id_idx ON public.templates(creator_id);

-- Enable RLS
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Public templates can be viewed by everyone
CREATE POLICY "Public templates are viewable by everyone" ON public.templates
  FOR SELECT
  USING (is_public = true);

-- Users can view their own templates
CREATE POLICY "Users can view own templates" ON public.templates
  FOR SELECT
  USING (auth.uid() = creator_id);

-- Users can create templates
CREATE POLICY "Users can create templates" ON public.templates
  FOR INSERT
  WITH CHECK (auth.uid() = creator_id);

-- Users can update their own templates
CREATE POLICY "Users can update own templates" ON public.templates
  FOR UPDATE
  USING (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);

-- Users can delete their own templates
CREATE POLICY "Users can delete own templates" ON public.templates
  FOR DELETE
  USING (auth.uid() = creator_id);

-- Update trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_templates_updated_at BEFORE UPDATE ON public.templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert the AI Agent test template as predefined template
INSERT INTO public.templates (
  name,
  description,
  category,
  tags,
  integrations,
  difficulty,
  estimated_time,
  is_public,
  is_predefined,
  nodes,
  connections
) VALUES (
  'AI Agent Test Workflow - Customer Service',
  'Complete test workflow with AI Agent handling support requests, feedback, and newsletter signups across Airtable, Discord, and Gmail',
  'AI Agent Testing',
  ARRAY['ai-agent', 'test', 'airtable', 'discord', 'gmail', 'complete'],
  ARRAY['airtable', 'discord', 'gmail'],
  'advanced',
  '5 mins',
  true,
  true,
  '[
    {
      "id": "discord-trigger-1",
      "type": "discord_trigger_new_message",
      "position": { "x": 100, "y": 300 },
      "data": {
        "type": "discord_trigger_new_message",
        "nodeComponent": {
          "type": "discord_trigger_new_message",
          "isTrigger": true
        },
        "title": "New Discord Message",
        "config": {
          "channelId": "",
          "includeBot": false
        },
        "isTrigger": true,
        "validationState": {
          "missingRequired": ["channelId"]
        }
      }
    },
    {
      "id": "ai-agent-1",
      "type": "ai_agent",
      "position": { "x": 400, "y": 300 },
      "data": {
        "type": "ai_agent",
        "title": "AI Customer Service Agent",
        "config": {
          "model": "gpt-4o-mini",
          "temperature": 0.7,
          "autoSelectChain": true,
          "parallelExecution": false,
          "prompt": "Analyze the customer message and route to the appropriate chains based on the content. Look for support requests, feedback, and newsletter signups.",
          "chainsLayout": {
            "chains": [
              {
                "id": "chain-support-request",
                "name": "Support Request Chain",
                "description": "Handles customer support inquiries",
                "conditions": [
                  {
                    "field": "message.content",
                    "operator": "contains",
                    "value": "help"
                  }
                ]
              },
              {
                "id": "chain-process-feedback",
                "name": "Process Feedback Chain",
                "description": "Processes customer feedback",
                "conditions": [
                  {
                    "field": "message.content",
                    "operator": "contains",
                    "value": "feedback"
                  }
                ]
              },
              {
                "id": "chain-newsletter-signup",
                "name": "Newsletter Signup Chain",
                "description": "Handles newsletter subscriptions",
                "conditions": [
                  {
                    "field": "message.content",
                    "operator": "contains",
                    "value": "newsletter"
                  }
                ]
              }
            ],
            "nodes": [],
            "edges": []
          }
        }
      }
    },
    {
      "id": "chain-1-airtable-create",
      "type": "airtable_action_create_record",
      "position": { "x": 700, "y": 100 },
      "data": {
        "type": "airtable_action_create_record",
        "title": "Create Support Ticket",
        "parentChainIndex": 0,
        "parentAIAgentId": "ai-agent-1",
        "isAIAgentChild": true,
        "config": {
          "baseId": "",
          "tableName": "",
          "fields": {
            "Ticket ID": "{{AI_FIELD:ticket_id}}",
            "Customer Email": "{{AI_FIELD:customer_email}}",
            "Issue Description": "{{AI_FIELD:issue_description}}",
            "Priority": "{{AI_FIELD:priority}}",
            "Status": "Open",
            "Created Date": "{{AI_FIELD:created_date}}",
            "Assigned To": "{{AI_FIELD:assigned_to}}"
          }
        },
        "validationState": {
          "missingRequired": ["baseId", "tableName"]
        }
      }
    },
    {
      "id": "chain-1-discord-notify",
      "type": "discord_action_send_message",
      "position": { "x": 1000, "y": 100 },
      "data": {
        "type": "discord_action_send_message",
        "title": "Notify Support Team",
        "parentChainIndex": 0,
        "parentAIAgentId": "ai-agent-1",
        "isAIAgentChild": true,
        "config": {
          "webhookUrl": "",
          "message": "{{AI_FIELD:support_notification_message}}",
          "username": "Support Bot"
        },
        "validationState": {
          "missingRequired": ["webhookUrl"]
        }
      }
    },
    {
      "id": "chain-2-airtable-create",
      "type": "airtable_action_create_record",
      "position": { "x": 700, "y": 300 },
      "data": {
        "type": "airtable_action_create_record",
        "title": "Store Feedback",
        "parentChainIndex": 1,
        "parentAIAgentId": "ai-agent-1",
        "isAIAgentChild": true,
        "config": {
          "baseId": "",
          "tableName": "",
          "fields": {
            "Feedback ID": "{{AI_FIELD:feedback_id}}",
            "Customer Name": "{{AI_FIELD:customer_name}}",
            "Feedback Type": "{{AI_FIELD:feedback_type}}",
            "Feedback Content": "{{AI_FIELD:feedback_content}}",
            "Rating": "{{AI_FIELD:rating}}",
            "Submitted Date": "{{AI_FIELD:submitted_date}}",
            "Response Status": "Pending"
          }
        },
        "validationState": {
          "missingRequired": ["baseId", "tableName"]
        }
      }
    },
    {
      "id": "chain-2-discord-notify",
      "type": "discord_action_send_message",
      "position": { "x": 1000, "y": 300 },
      "data": {
        "type": "discord_action_send_message",
        "title": "Notify Feedback Team",
        "parentChainIndex": 1,
        "parentAIAgentId": "ai-agent-1",
        "isAIAgentChild": true,
        "config": {
          "webhookUrl": "",
          "message": "{{AI_FIELD:feedback_notification_message}}",
          "username": "Feedback Bot"
        },
        "validationState": {
          "missingRequired": ["webhookUrl"]
        }
      }
    },
    {
      "id": "chain-3-airtable-create",
      "type": "airtable_action_create_record",
      "position": { "x": 700, "y": 500 },
      "data": {
        "type": "airtable_action_create_record",
        "title": "Add to Newsletter",
        "parentChainIndex": 2,
        "parentAIAgentId": "ai-agent-1",
        "isAIAgentChild": true,
        "config": {
          "baseId": "",
          "tableName": "",
          "fields": {
            "Subscriber ID": "{{AI_FIELD:subscriber_id}}",
            "Email": "{{AI_FIELD:subscriber_email}}",
            "Name": "{{AI_FIELD:subscriber_name}}",
            "Signup Date": "{{AI_FIELD:signup_date}}",
            "Preferences": "{{AI_FIELD:preferences}}",
            "Status": "Active",
            "Welcome Email Sent": false
          }
        },
        "validationState": {
          "missingRequired": ["baseId", "tableName"]
        }
      }
    },
    {
      "id": "chain-3-gmail-send",
      "type": "gmail_action_send",
      "position": { "x": 1000, "y": 500 },
      "data": {
        "type": "gmail_action_send",
        "title": "Send Welcome Email",
        "parentChainIndex": 2,
        "parentAIAgentId": "ai-agent-1",
        "isAIAgentChild": true,
        "config": {
          "to": "{{AI_FIELD:welcome_email_to}}",
          "subject": "{{AI_FIELD:welcome_email_subject}}",
          "body": "{{AI_FIELD:welcome_email_body}}"
        }
      }
    }
  ]'::jsonb,
  '[
    {
      "id": "main-edge-1",
      "source": "discord-trigger-1",
      "target": "ai-agent-1"
    },
    {
      "id": "chain-1-edge-1",
      "source": "chain-1-airtable-create",
      "target": "chain-1-discord-notify"
    },
    {
      "id": "chain-2-edge-1",
      "source": "chain-2-airtable-create",
      "target": "chain-2-discord-notify"
    },
    {
      "id": "chain-3-edge-1",
      "source": "chain-3-airtable-create",
      "target": "chain-3-gmail-send"
    }
  ]'::jsonb
);