import OpenAI from "openai"

import { logger } from '@/lib/utils/logger'

export interface IntentAnalysisResult {
  intent: string
  action: string
  parameters: Record<string, any>
  requiresConfirmation?: boolean
  clarification?: string
  specifiedIntegration?: string
}

export interface Integration {
  id: string
  provider: string
  status: string
  access_token?: string
  refresh_token?: string
  user_id: string
  base_url?: string
}

export class AIIntentAnalysisService {
  private openai: OpenAI

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }

  async analyzeIntent(
    message: string, 
    integrations: Integration[], 
    timeout: number = 8000
  ): Promise<IntentAnalysisResult> {
    logger.debug("🧠 Starting intent analysis for message length:", message.length)

    const systemPrompt = this.buildSystemPrompt(integrations, message)

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      logger.debug("🤖 Making OpenAI API call for intent analysis...")
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: systemPrompt }],
        temperature: 0.1,
        max_tokens: 500,
      }, {
        signal: controller.signal
      })

      clearTimeout(timeoutId)
      logger.debug("✅ OpenAI API call completed")

      const content = response.choices[0].message.content
      if (!content) {
        throw new Error("No response from OpenAI")
      }

      try {
        const result = JSON.parse(content) as IntentAnalysisResult
        logger.debug("✅ Intent analysis completed:", {
          intent: result.intent,
          action: result.action,
          specifiedIntegration: result.specifiedIntegration
        })
        return result
      } catch (parseError) {
        logger.error("❌ Failed to parse OpenAI response:", parseError)
        logger.error("Raw response:", content)
        return this.getFallbackIntent()
      }
    } catch (error: any) {
      logger.error("❌ OpenAI API error:", error)
      
      if (error.name === 'AbortError') {
        throw new Error("Intent analysis timed out")
      } else if (error.message?.includes('401')) {
        throw new Error("OpenAI API key is invalid")
      } else if (error.message?.includes('429')) {
        throw new Error("OpenAI rate limit exceeded")
      }
      
      throw new Error("Failed to analyze intent")
    }
  }

  private buildSystemPrompt(integrations: Integration[], message: string): string {
    const availableIntegrations = integrations.map(i => i.provider).join(", ")

    return `You are an AI assistant that helps users interact with their connected integrations. 
  
Available integrations: ${availableIntegrations}

Analyze the user's message and determine their intent. Return a JSON object with:
- intent: "calendar_query", "calendar_action", "email_query", "email_action", "file_query", "file_action", "social_query", "social_action", "crm_query", "crm_action", "ecommerce_query", "ecommerce_action", "developer_query", "developer_action", "productivity_query", "productivity_action", "communication_query", "communication_action", "workflow_query", "workflow_action", "app_knowledge", "app_help", "integration_query", "integration_action", "general"
- action: specific action to take
- parameters: any relevant parameters from the message
- requiresConfirmation: boolean (true for destructive actions)
- clarification: any questions needed if multiple items match
- specifiedIntegration: the specific integration mentioned in the message (e.g., "mailchimp", "hubspot", "github")

IMPORTANT: If the user specifies a particular integration (e.g., "create a Mailchimp campaign"), use that specific integration. Do not suggest alternatives unless the user asks for them.

Examples:
- "What do I have planned this week?" → calendar_query, get_events, {timeframe: "week"}
- "Cancel the test appointment" → calendar_action, cancel_event, {search: "test"}, requiresConfirmation: true
- "Send an email to john@example.com" → email_action, send_email, {to: "john@example.com"}, requiresConfirmation: true
- "What's in my inbox?" → email_query, get_emails, {folder: "inbox"}
- "Find my presentation document" → file_query, search_files, {query: "presentation"}
- "Share the budget spreadsheet with the team" → file_action, share_file, {file: "budget", action: "share"}, requiresConfirmation: true
- "Post to LinkedIn about our new product" → social_action, post_update, {platform: "linkedin", content: "new product"}, requiresConfirmation: true, specifiedIntegration: "linkedin"
- "Show me my recent tweets" → social_query, get_posts, {platform: "twitter"}, specifiedIntegration: "twitter"
- "Create a new contact in HubSpot" → crm_action, create_contact, {platform: "hubspot"}, requiresConfirmation: true, specifiedIntegration: "hubspot"
- "What are my recent sales?" → crm_query, get_sales, {platform: "hubspot"}, specifiedIntegration: "hubspot"
- "Show me my Shopify orders" → ecommerce_query, get_orders, {platform: "shopify"}, specifiedIntegration: "shopify"
- "Create a new GitHub issue" → developer_action, create_issue, {platform: "github"}, requiresConfirmation: true, specifiedIntegration: "github"
- "What's in my Notion workspace?" → productivity_query, get_content, {platform: "notion"}, specifiedIntegration: "notion"
- "Send a message to the team on Slack" → communication_action, send_message, {platform: "slack"}, requiresConfirmation: true, specifiedIntegration: "slack"
- "Show me my Discord servers" → communication_query, get_servers, {platform: "discord"}, specifiedIntegration: "discord"
- "Create a new Trello card" → productivity_action, create_card, {platform: "trello"}, requiresConfirmation: true, specifiedIntegration: "trello"
- "What's in my Airtable base?" → productivity_query, get_records, {platform: "airtable"}, specifiedIntegration: "airtable"
- "Show me my YouTube videos" → social_query, get_videos, {platform: "youtube"}, specifiedIntegration: "youtube"
- "Post to Instagram" → social_action, post_photo, {platform: "instagram"}, requiresConfirmation: true, specifiedIntegration: "instagram"
- "Create a new GitHub repository" → developer_action, create_repo, {platform: "github"}, requiresConfirmation: true, specifiedIntegration: "github"
- "Show me my GitLab projects" → developer_query, get_projects, {platform: "gitlab"}, specifiedIntegration: "gitlab"
- "What's in my OneDrive?" → file_query, get_files, {platform: "onedrive"}, specifiedIntegration: "onedrive"
- "Upload to Dropbox" → file_action, upload_file, {platform: "dropbox"}, requiresConfirmation: true, specifiedIntegration: "dropbox"
- "Show me my Box files" → file_query, get_files, {platform: "box"}, specifiedIntegration: "box"
- "Create a new Mailchimp campaign" → communication_action, create_campaign, {platform: "mailchimp"}, requiresConfirmation: true, specifiedIntegration: "mailchimp"
- "Show me my Stripe payments" → ecommerce_query, get_payments, {platform: "stripe"}, specifiedIntegration: "stripe"
- "Create a PayPal invoice" → ecommerce_action, create_invoice, {platform: "paypal"}, requiresConfirmation: true, specifiedIntegration: "paypal"
- "Show me my Gumroad sales" → ecommerce_query, get_sales, {platform: "gumroad"}, specifiedIntegration: "gumroad"
- "Create a ManyChat automation" → communication_action, create_automation, {platform: "manychat"}, requiresConfirmation: true, specifiedIntegration: "manychat"
- "Show me my beehiiv subscribers" → communication_query, get_subscribers, {platform: "beehiiv"}, specifiedIntegration: "beehiiv"
- "Create a OneNote page" → productivity_action, create_page, {platform: "microsoft-onenote"}, requiresConfirmation: true, specifiedIntegration: "microsoft-onenote"
- "Show me my Kit products" → ecommerce_query, get_products, {platform: "kit"}, specifiedIntegration: "kit"
- "Create a Blackbaud donor record" → crm_action, create_donor, {platform: "blackbaud"}, requiresConfirmation: true, specifiedIntegration: "blackbaud"
- "Show my workflows" → workflow_query, list_workflows, {}
- "What workflows are active?" → workflow_query, list_workflows, {status: "active"}
- "Activate my email workflow" → workflow_action, activate_workflow, {search: "email"}, requiresConfirmation: true
- "Deactivate the notification workflow" → workflow_action, deactivate_workflow, {search: "notification"}, requiresConfirmation: true
- "Delete the test workflow" → workflow_action, delete_workflow, {search: "test"}, requiresConfirmation: true
- "Duplicate my backup workflow" → workflow_action, duplicate_workflow, {search: "backup"}
- "What is ChainReact?" → app_knowledge, general_info, {topic: "what_is_chainreact"}
- "How do I create a workflow?" → app_help, create_workflow, {topic: "how_to_create_workflow"}
- "What are triggers?" → app_knowledge, explain_concept, {topic: "what_are_triggers"}
- "How do I connect an integration?" → app_help, connect_integration, {topic: "how_to_connect_integration"}
- "What integrations are available?" → app_knowledge, list_available, {topic: "available_integrations"}
- "Help me get started" → app_help, getting_started, {topic: "getting_started"}
- "Show my integrations" → integration_query, list_integrations, {}
- "Is Gmail connected?" → integration_query, integration_status, {provider: "gmail"}
- "What integrations do I have?" → integration_query, list_integrations, {}
- "Connect Gmail" → integration_action, connect_integration, {provider: "gmail"}, specifiedIntegration: "gmail"
- "Disconnect Slack" → integration_action, disconnect_integration, {provider: "slack"}, requiresConfirmation: true, specifiedIntegration: "slack"
- "Reconnect Notion" → integration_action, reconnect_integration, {provider: "notion"}, specifiedIntegration: "notion"

User message: "${message}"`
  }

  private getFallbackIntent(): IntentAnalysisResult {
    return {
      intent: "general",
      action: "chat",
      parameters: {}
    }
  }

  validateIntentResult(intent: IntentAnalysisResult): boolean {
    const validIntents = [
      "calendar_query", "calendar_action", "email_query", "email_action",
      "file_query", "file_action", "social_query", "social_action",
      "crm_query", "crm_action", "ecommerce_query", "ecommerce_action",
      "developer_query", "developer_action", "productivity_query", "productivity_action",
      "communication_query", "communication_action", "workflow_query", "workflow_action",
      "app_knowledge", "app_help", "integration_query", "integration_action", "general"
    ]

    return validIntents.includes(intent.intent) &&
           typeof intent.action === 'string' &&
           typeof intent.parameters === 'object'
  }
}
