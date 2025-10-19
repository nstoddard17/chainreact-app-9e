import { IntentAnalysisResult, Integration } from "./aiIntentAnalysisService"
import { CalendarActionHandler } from "./handlers/calendarActionHandler"
import { EmailActionHandler } from "./handlers/emailActionHandler"
import { FileActionHandler } from "./handlers/fileActionHandler"
import { SocialActionHandler } from "./handlers/socialActionHandler"
import { CRMActionHandler } from "./handlers/crmActionHandler"
import { EcommerceActionHandler } from "./handlers/ecommerceActionHandler"
import { DeveloperActionHandler } from "./handlers/developerActionHandler"
import { ProductivityActionHandler } from "./handlers/productivityActionHandler"
import { CommunicationActionHandler } from "./handlers/communicationActionHandler"
import { WorkflowManagementHandler } from "./handlers/workflowManagementHandler"
import { AppKnowledgeHandler } from "./handlers/appKnowledgeHandler"
import { IntegrationManagementHandler } from "./handlers/integrationManagementHandler"

import { logger } from '@/lib/utils/logger'

export interface ActionExecutionResult {
  content: string
  metadata: Record<string, any>
}

export class AIActionExecutionService {
  private calendarHandler: CalendarActionHandler
  private emailHandler: EmailActionHandler
  private fileHandler: FileActionHandler
  private socialHandler: SocialActionHandler
  private crmHandler: CRMActionHandler
  private ecommerceHandler: EcommerceActionHandler
  private developerHandler: DeveloperActionHandler
  private productivityHandler: ProductivityActionHandler
  private communicationHandler: CommunicationActionHandler
  private workflowHandler: WorkflowManagementHandler
  private appKnowledgeHandler: AppKnowledgeHandler
  private integrationHandler: IntegrationManagementHandler

  constructor() {
    this.calendarHandler = new CalendarActionHandler()
    this.emailHandler = new EmailActionHandler()
    this.fileHandler = new FileActionHandler()
    this.socialHandler = new SocialActionHandler()
    this.crmHandler = new CRMActionHandler()
    this.ecommerceHandler = new EcommerceActionHandler()
    this.developerHandler = new DeveloperActionHandler()
    this.productivityHandler = new ProductivityActionHandler()
    this.communicationHandler = new CommunicationActionHandler()
    this.workflowHandler = new WorkflowManagementHandler()
    this.appKnowledgeHandler = new AppKnowledgeHandler()
    this.integrationHandler = new IntegrationManagementHandler()
  }

  async executeAction(
    intent: IntentAnalysisResult,
    integrations: Integration[],
    userId: string,
    supabaseAdmin: any,
    timeout: number = 25000
  ): Promise<ActionExecutionResult> {
    logger.debug("🎯 Starting action execution:", {
      intent: intent.intent,
      action: intent.action,
      specifiedIntegration: intent.specifiedIntegration
    })

    // Check if a specific integration was requested but not connected
    if (intent.specifiedIntegration) {
      const requestedIntegration = integrations.find(i => i.provider === intent.specifiedIntegration)
      if (!requestedIntegration) {
        return {
          content: `I see you want to use ${intent.specifiedIntegration}, but it's not currently connected. You can connect it by visiting the [Integrations page](/integrations) and clicking "Connect" next to ${intent.specifiedIntegration}.`,
          metadata: {
            type: "integration_not_connected",
            integration: intent.specifiedIntegration,
            action: intent.action
          }
        }
      }
    }

    try {
      const actionPromise = this.routeToHandler(intent, integrations, userId, supabaseAdmin)
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error("Action execution timeout")), timeout)
      )

      const result = await Promise.race([actionPromise, timeoutPromise])
      
      logger.debug("✅ Action execution completed successfully")
      return result
    } catch (error: any) {
      logger.error("❌ Action execution failed:", error)
      
      if (error.message?.includes("timeout")) {
        return {
          content: "The request took too long to process. Please try again with a simpler request.",
          metadata: { error: "timeout" }
        }
      }
      
      return {
        content: "I'm having trouble processing your request right now. Please try again in a moment.",
        metadata: { error: error.message || "unknown_error" }
      }
    }
  }

  private async routeToHandler(
    intent: IntentAnalysisResult,
    integrations: Integration[],
    userId: string,
    supabaseAdmin: any
  ): Promise<ActionExecutionResult> {
    switch (intent.intent) {
      case "calendar_query":
        return await this.calendarHandler.handleQuery(intent, integrations, userId, supabaseAdmin)
      case "calendar_action":
        return await this.calendarHandler.handleAction(intent, integrations, userId, supabaseAdmin)
      case "email_query":
        return await this.emailHandler.handleQuery(intent, integrations, userId, supabaseAdmin)
      case "email_action":
        return await this.emailHandler.handleAction(intent, integrations, userId, supabaseAdmin)
      case "file_query":
        return await this.fileHandler.handleQuery(intent, integrations, userId, supabaseAdmin)
      case "file_action":
        return await this.fileHandler.handleAction(intent, integrations, userId, supabaseAdmin)
      case "social_query":
        return await this.socialHandler.handleQuery(intent, integrations, userId, supabaseAdmin)
      case "social_action":
        return await this.socialHandler.handleAction(intent, integrations, userId, supabaseAdmin)
      case "crm_query":
        return await this.crmHandler.handleQuery(intent, integrations, userId, supabaseAdmin)
      case "crm_action":
        return await this.crmHandler.handleAction(intent, integrations, userId, supabaseAdmin)
      case "ecommerce_query":
        return await this.ecommerceHandler.handleQuery(intent, integrations, userId, supabaseAdmin)
      case "ecommerce_action":
        return await this.ecommerceHandler.handleAction(intent, integrations, userId, supabaseAdmin)
      case "developer_query":
        return await this.developerHandler.handleQuery(intent, integrations, userId, supabaseAdmin)
      case "developer_action":
        return await this.developerHandler.handleAction(intent, integrations, userId, supabaseAdmin)
      case "productivity_query":
        return await this.productivityHandler.handleQuery(intent, integrations, userId, supabaseAdmin)
      case "productivity_action":
        return await this.productivityHandler.handleAction(intent, integrations, userId, supabaseAdmin)
      case "communication_query":
        return await this.communicationHandler.handleQuery(intent, integrations, userId, supabaseAdmin)
      case "communication_action":
        return await this.communicationHandler.handleAction(intent, integrations, userId, supabaseAdmin)
      case "workflow_query":
        return await this.workflowHandler.handleQuery(intent, integrations, userId, supabaseAdmin)
      case "workflow_action":
        return await this.workflowHandler.handleAction(intent, integrations, userId, supabaseAdmin)
      case "app_knowledge":
      case "app_help":
        return await this.appKnowledgeHandler.handleQuery(intent, integrations, userId, supabaseAdmin)
      case "integration_query":
        return await this.integrationHandler.handleQuery(intent, integrations, userId, supabaseAdmin)
      case "integration_action":
        return await this.integrationHandler.handleAction(intent, integrations, userId, supabaseAdmin)
      case "general":
      case "chat":
      default:
        return this.getGeneralResponse()
    }
  }

  private getGeneralResponse(): ActionExecutionResult {
    return {
      content: `I can help you with:

**Your Integrations**
- View and manage your connected apps (Gmail, Slack, Notion, etc.)
- Connect new integrations
- Check integration status

**Your Workflows**
- List, activate, and deactivate workflows
- Check workflow status
- Get workflow information

**Your Data**
- Query calendars, emails, files, and more
- Search across all your connected apps
- View productivity data (Notion, Airtable, Trello)

**App Knowledge**
- Learn how to use ChainReact
- Get help with features
- Troubleshooting tips

What would you like to do?`,
      metadata: { type: "general_help" }
    }
  }

  getFallbackResponse(): ActionExecutionResult {
    return {
      content: "I can help you with your integrations, workflows, and data across all your connected apps. What would you like to know or do?",
      metadata: { type: "fallback" }
    }
  }
}