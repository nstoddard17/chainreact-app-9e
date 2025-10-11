import { NextRequest } from "next/server"
import { AIAuthenticationService } from "./aiAuthenticationService"
import { AIIntentAnalysisService } from "./aiIntentAnalysisService"
import { AIActionExecutionService } from "./aiActionExecutionService"
import { trackUsage } from "@/lib/usageTracking"

export interface AIAssistantRequest {
  message: string
}

export interface AIAssistantResponse {
  content: string
  metadata: Record<string, any>
  error?: string
}

export class AIAssistantService {
  private authService: AIAuthenticationService
  private intentService: AIIntentAnalysisService
  private actionService: AIActionExecutionService

  constructor() {
    this.authService = new AIAuthenticationService()
    this.intentService = new AIIntentAnalysisService()
    this.actionService = new AIActionExecutionService()
  }

  async processMessage(request: NextRequest): Promise<AIAssistantResponse> {
    console.log("🤖 Starting AI Assistant message processing")

    try {
      // 1. Validate OpenAI configuration
      const configCheck = await this.authService.validateOpenAIConfiguration()
      if (!configCheck.valid) {
        return {
          content: configCheck.error || "AI assistant is not properly configured.",
          metadata: { error: "configuration_error" },
          error: "Configuration error"
        }
      }

      // 2. Parse request body
      const body = await request.json()
      const { message } = body as AIAssistantRequest

      if (!message || typeof message !== 'string') {
        return {
          content: "Please provide a valid message.",
          metadata: { error: "invalid_message" },
          error: "Invalid message format"
        }
      }

      console.log("📝 Processing message:", `${message.substring(0, 100) }...`)

      // 3. Authenticate user
      const authResult = await this.authService.authenticateRequest(request)
      if (!authResult.user) {
        return {
          content: authResult.error?.includes("expired") 
            ? "Your session has expired. Please refresh the page and try again."
            : "Please log in to use the AI assistant.",
          metadata: { error: "authentication_failed" },
          error: "Unauthorized"
        }
      }

      const user = authResult.user
      console.log("✅ User authenticated:", user.id)

      // 4. Check usage limits
      const usageCheck = await this.authService.checkAIUsageLimit(user.id)
      if (!usageCheck.allowed) {
        return {
          content: usageCheck.error || "AI usage limit exceeded.",
          metadata: { error: "usage_limit_exceeded", details: usageCheck.details },
          error: "AI usage limit exceeded"
        }
      }

      // 5. Get user integrations
      const integrationsResult = await this.authService.getIntegrations(user.id)
      if (integrationsResult.error) {
        return {
          content: integrationsResult.error,
          metadata: { error: "integrations_fetch_failed" },
          error: "Database error"
        }
      }

      const integrations = integrationsResult.integrations

      // 6. Analyze intent
      let intent
      try {
        intent = await this.intentService.analyzeIntent(message, integrations, 15000)
        console.log("🧠 Intent analysis completed:", {
          intent: intent.intent,
          action: intent.action,
          specifiedIntegration: intent.specifiedIntegration
        })
      } catch (intentError: any) {
        console.error("❌ Intent analysis failed:", intentError)
        // Fallback to general response
        intent = {
          intent: "general",
          action: "chat",
          parameters: {}
        }
      }

      // 7. Execute action
      let result
      try {
        result = await this.actionService.executeAction(intent, integrations, user.id, this.authService.getSupabaseAdmin())
        console.log("✅ Action execution completed")
      } catch (actionError: any) {
        console.error("❌ Action execution failed:", actionError)
        // Fallback response
        result = this.actionService.getFallbackResponse()
      }

      // 8. Ensure we have a valid result
      if (!result || !result.content) {
        result = this.actionService.getFallbackResponse()
      }

      // 9. Track usage
      try {
        await trackUsage(user.id, "ai_assistant", "assistant_call", 1, {
          intent: intent.intent,
          action: intent.action,
          message_length: message.length
        })
      } catch (trackingError) {
        console.error("❌ Failed to track AI usage:", trackingError)
        // Don't fail the request if tracking fails
      }

      console.log("✅ AI Assistant processing completed successfully")
      return {
        content: result.content,
        metadata: result.metadata
      }

    } catch (error: any) {
      console.error("❌ AI Assistant error:", error)
      
      let errorMessage = "Internal server error"
      let userMessage = "I encountered an unexpected error. Please try again."
      
      if (error.message?.includes("timeout")) {
        errorMessage = error.message
        userMessage = "The request took too long to process. Please try again with a simpler request."
      } else if (error.message?.includes("Unauthorized")) {
        errorMessage = "Authentication error"
        userMessage = "Please log in to use the AI assistant."
      } else if (error.message?.includes("API key")) {
        errorMessage = "Configuration error"
        userMessage = "AI assistant is not properly configured. Please contact support."
      }
      
      return {
        content: userMessage,
        metadata: { error: "processing_failed" },
        error: errorMessage
      }
    }
  }

  async getStatus(): Promise<{ status: string, message: string, openaiConfigured: boolean }> {
    return {
      status: "ok",
      message: "AI Assistant API is running",
      openaiConfigured: !!process.env.OPENAI_API_KEY
    }
  }
}