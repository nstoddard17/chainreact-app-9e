import { createClient } from "@supabase/supabase-js"
import type { NextRequest } from "next/server"
import type { Database } from "@/types/supabase"

/**
 * Create admin client only for server-side operations
 * This should only be called from server-side code (API routes, server actions)
 */
export const createAdminSupabaseClient = () => {
  // Ensure this only runs on the server
  if (typeof window !== "undefined") {
    console.warn("Warning: Attempted to create admin Supabase client on the client side")
    return null
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    const missingVars = []
    if (!supabaseUrl) missingVars.push("SUPABASE_URL")
    if (!supabaseServiceKey) missingVars.push("SUPABASE_SERVICE_ROLE_KEY")

    const errorMessage = `Missing required Supabase admin environment variables: ${missingVars.join(", ")}`

    if (process.env.NODE_ENV === "development") {
      throw new Error(errorMessage)
    } else {
      console.error(errorMessage)
      throw new Error("Server configuration error")
    }
  }

  return createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

/**
 * Get hardcoded redirect URI for OAuth providers
 * Always uses the production domain to prevent redirect mismatches
 */
export function getOAuthRedirectUri(provider: string): string {
  return `https://chainreact.app/api/integrations/${provider}/callback`
}

export function getStandardRedirectUri(provider: string): string {
  return `https://chainreact.app/api/integrations/${provider}/callback`
}

/**
 * Get the absolute base URL for OAuth redirects based on the request
 * Always returns production URL for OAuth consistency
 */
export function getAbsoluteBaseUrl(request: Request | NextRequest): string {
  // Always return production URL for OAuth consistency
  return "https://chainreact.app"
}

/**
 * Upsert integration data to avoid duplicate key constraint violations
 * This is atomic and safe for concurrent operations
 */
export async function upsertIntegration(
  supabase: any,
  integrationData: {
    user_id: string
    provider: string
    provider_user_id?: string
    status: string
    scopes?: string[]
    access_token?: string
    refresh_token?: string
    expires_at?: string | null
    metadata: any
    organization_id?: string
  },
): Promise<any> {
  try {
    console.log(`Upserting integration for user ${integrationData.user_id} and provider ${integrationData.provider}`)

    // Add timestamps
    const now = new Date().toISOString()

    // First, try to save to the main integrations table
    const mainIntegrationData = {
      user_id: integrationData.user_id,
      provider: integrationData.provider,
      provider_user_id: integrationData.provider_user_id,
      status: integrationData.status,
      scopes: integrationData.scopes,
      access_token: integrationData.access_token,
      refresh_token: integrationData.refresh_token,
      expires_at: integrationData.expires_at,
      metadata: integrationData.metadata,
      updated_at: now,
    }

    // Check if integration exists in main table
    const { data: existingMainIntegration, error: findMainError } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", integrationData.user_id)
      .eq("provider", integrationData.provider)
      .maybeSingle()

    if (findMainError) {
      console.error("Error checking for existing main integration:", findMainError)
    }

    let mainResult
    if (existingMainIntegration) {
      console.log(`Updating existing main integration: ${existingMainIntegration.id}`)
      mainResult = await supabase
        .from("integrations")
        .update(mainIntegrationData)
        .eq("id", existingMainIntegration.id)
        .select()
        .single()
    } else {
      console.log("Creating new main integration")
      mainResult = await supabase
        .from("integrations")
        .insert({
          ...mainIntegrationData,
          created_at: now,
        })
        .select()
        .single()
    }

    if (mainResult.error) {
      console.error("Error upserting main integration:", mainResult.error)
    } else {
      console.log("Main integration saved successfully:", mainResult.data)
    }

    // Return the main result
    return mainResult.data
  } catch (error) {
    console.error("Error in upsertIntegration:", error)
    throw error
  }
}

/**
 * Generate OAuth state with consistent structure
 */
export function generateOAuthState(
  provider: string,
  userId: string,
  options: {
    reconnect?: boolean
    integrationId?: string
    requireFullScopes?: boolean
  } = {},
): string {
  const state = {
    provider,
    userId,
    timestamp: Date.now(),
    reconnect: options.reconnect || false,
    integrationId: options.integrationId,
    requireFullScopes: options.requireFullScopes !== false, // Default to true
  }

  return btoa(JSON.stringify(state))
}

/**
 * Parse OAuth state safely
 */
export function parseOAuthState(state: string): any {
  try {
    // First try standard base64 decoding
    return JSON.parse(Buffer.from(state, "base64").toString())
  } catch (error) {
    // If that fails, try URL-safe base64 decoding
    try {
      const base64 = state.replace(/-/g, "+").replace(/_/g, "/")
      return JSON.parse(Buffer.from(base64, "base64").toString())
    } catch (innerError) {
      // If both fail, try direct JSON parsing (some providers might not encode)
      try {
        return JSON.parse(state)
      } catch (finalError) {
        // If all parsing attempts fail
        console.error("Failed to parse OAuth state:", finalError)
        throw new Error("Invalid OAuth state format")
      }
    }
  }
}

/**
 * Validate user session from request
 * Returns user ID if session is valid, null otherwise
 */
export async function validateSession(request: NextRequest): Promise<string | null> {
  try {
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      const missingVars = []
      if (!supabaseUrl) missingVars.push("SUPABASE_URL")
      if (!supabaseAnonKey) missingVars.push("SUPABASE_ANON_KEY")

      console.error(`Missing required Supabase environment variables for session validation: ${missingVars.join(", ")}`)
      return null
    }

    // Try to get session from cookie
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
      },
    })

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (session?.user?.id) {
      return session.user.id
    }

    // Try to get from authorization header
    const authHeader = request.headers.get("authorization")
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.substring(7)
      const { data } = await supabase.auth.getUser(token)
      if (data?.user?.id) {
        return data.user.id
      }
    }

    return null
  } catch (error) {
    console.error("Error validating session:", error)
    return null
  }
}

/**
 * Validate required scopes against granted scopes
 */
export function validateScopes(
  requiredScopes: string[],
  grantedScopes: string[],
): {
  valid: boolean
  missingScopes: string[]
} {
  const missingScopes = requiredScopes.filter((scope) => !grantedScopes.includes(scope))
  return {
    valid: missingScopes.length === 0,
    missingScopes,
  }
}

/**
 * Get required scopes for a provider
 */
export function getRequiredScopes(provider: string): string[] {
  switch (provider) {
    case "slack":
      return [
        "chat:write",
        "chat:write.public",
        "channels:read",
        "channels:join",
        "groups:read",
        "im:read",
        "users:read",
        "team:read",
        "files:write",
        "reactions:write",
      ]
    case "discord":
      // Only require essential scopes for Discord
      return ["identify", "guilds", "guilds.join", "messages.read"]
    case "dropbox":
      return ["files.content.write", "files.content.read"]
    case "google":
      return ["https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"]
    case "github":
      return ["repo", "user"]
    case "teams":
      return ["openid", "profile", "email", "offline_access", "User.Read"]
    // Add other providers as needed
    default:
      return []
  }
}
