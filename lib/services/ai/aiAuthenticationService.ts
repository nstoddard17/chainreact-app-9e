import { NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { checkUsageLimit } from "@/lib/usageTracking"

export interface AuthenticatedUser {
  id: string
  email?: string
}

export interface UsageCheckResult {
  allowed: boolean
  limit?: number
  used?: number
}

export class AIAuthenticationService {
  private supabaseAdmin: any

  constructor() {
    this.supabaseAdmin = createAdminClient()
  }

  getSupabaseAdmin() {
    return this.supabaseAdmin
  }

  async authenticateRequest(request: NextRequest): Promise<{ user: AuthenticatedUser | null, error?: string }> {
    console.log("🔐 Authenticating AI assistant request")

    const authHeader = request.headers.get("authorization")
    
    if (!authHeader) {
      return {
        user: null,
        error: "Unauthorized - No auth header provided"
      }
    }

    const token = authHeader.replace("Bearer ", "")
    const { data: { user }, error: authError } = await this.supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      return {
        user: null,
        error: "Unauthorized - Invalid or expired token"
      }
    }

    console.log("✅ User authenticated:", user.id)
    
    return {
      user: {
        id: user.id,
        email: user.email
      }
    }
  }

  async checkAIUsageLimit(userId: string): Promise<{ allowed: boolean, error?: string, details?: any }> {
    console.log("📊 Checking AI usage limits for user:", userId)

    try {
      const usageCheck = await checkUsageLimit(userId, "ai_assistant")
      
      if (!usageCheck.allowed) {
        console.log("❌ AI usage limit exceeded:", usageCheck)
        return {
          allowed: false,
          error: `You've reached your AI assistant usage limit for this month (${usageCheck.limit} messages). Please upgrade your plan for more AI usage.`,
          details: usageCheck
        }
      }

      console.log("✅ AI usage allowed:", usageCheck)
      return {
        allowed: true,
        details: usageCheck
      }
    } catch (error: any) {
      console.error("❌ Error checking AI usage limits:", error)
      return {
        allowed: false,
        error: "Failed to check usage limits. Please try again.",
        details: error
      }
    }
  }

  async validateOpenAIConfiguration(): Promise<{ valid: boolean, error?: string }> {
    if (!process.env.OPENAI_API_KEY) {
      console.error("❌ OpenAI API key is not configured")
      return {
        valid: false,
        error: "AI assistant is not properly configured. Please contact support."
      }
    }

    console.log("✅ OpenAI configuration validated")
    return { valid: true }
  }

  async getIntegrations(userId: string, timeout: number = 10000): Promise<{ integrations: any[], error?: string }> {
    console.log("🔌 Fetching user integrations:", userId)

    try {
      const integrationsPromise = this.supabaseAdmin
        .from("integrations")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "connected")

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Database timeout")), timeout)
      )

      const { data: integrations, error: integrationsError } = await Promise.race([
        integrationsPromise,
        timeoutPromise
      ]) as any

      if (integrationsError) {
        console.error("❌ Error fetching integrations:", integrationsError)
        return {
          integrations: [],
          error: "Failed to fetch your integrations. Please try again."
        }
      }

      console.log("✅ Integrations fetched:", integrations?.map((i: any) => ({ 
        provider: i.provider, 
        hasToken: !!i.access_token 
      })))

      return {
        integrations: integrations || []
      }
    } catch (error: any) {
      console.error("❌ Error in getIntegrations:", error)
      return {
        integrations: [],
        error: error.message.includes("timeout") 
          ? "Request timed out. Please try again."
          : "Failed to fetch integrations. Please try again."
      }
    }
  }
}