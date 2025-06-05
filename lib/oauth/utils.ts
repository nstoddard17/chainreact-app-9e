import { createClient } from "@supabase/supabase-js"
import type { NextRequest } from "next/server"
import type { Database } from "@/types/supabase"

// Create a server-side Supabase client for admin operations
export const createAdminSupabaseClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing Supabase admin environment variables:", {
      SUPABASE_URL: !!supabaseUrl,
      SUPABASE_SERVICE_ROLE_KEY: !!supabaseServiceKey,
    })
    throw new Error("Supabase admin environment variables are required")
  }

  return createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

// Export the admin client instance for backward compatibility
export const adminSupabase = createAdminSupabaseClient()

/**
 * Get the absolute base URL for OAuth redirects based on the request
 */
export function getAbsoluteBaseUrl(request: Request | NextRequest): string {
  // Try to get from request URL first
  try {
    const url = new URL(request.url)
    return `${url.protocol}//${url.host}`
  } catch (error) {
    console.error("Error parsing request URL:", error)
  }

  // Fallback to environment variable
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }

  // Final fallback for production
  return "https://chainreact.app"
}

/**
 * Get the correct base URL for OAuth redirects based on environment
 */
export function getOAuthBaseUrl(): string {
  // In production, always use the production domain
  if (process.env.NODE_ENV === "production") {
    return "https://chainreact.app"
  }

  // For development, check if we have a custom URL set
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }

  // Default to localhost for development
  return "http://localhost:3000"
}

/**
 * Generate a consistent redirect URI for OAuth providers
 */
export function getOAuthRedirectUri(baseUrl: string, provider: string): string {
  return `${baseUrl}/api/integrations/${provider}/callback`
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

    // Map to your database structure
    const dataWithTimestamps = {
      user_id: integrationData.user_id,
      provider: integrationData.provider,
      integration_name: integrationData.provider, // Use provider as integration_name
      status: integrationData.status,
      configuration: {
        scopes: integrationData.scopes,
        provider_user_id: integrationData.provider_user_id,
      },
      credentials: {
        access_token: integrationData.access_token,
        refresh_token: integrationData.refresh_token,
        expires_at: integrationData.expires_at,
      },
      metadata: integrationData.metadata,
      organization_id: integrationData.organization_id,
      updated_at: now,
      last_sync_at: now,
    }

    // Check if integration exists using advanced_integrations table
    const { data: existingIntegration, error: findError } = await supabase
      .from("advanced_integrations")
      .select("id")
      .eq("user_id", integrationData.user_id)
      .eq("provider", integrationData.provider)
      .maybeSingle()

    if (findError) {
      console.error("Error checking for existing integration:", findError)
      throw findError
    }

    let result

    if (existingIntegration) {
      console.log(`Updating existing integration: ${existingIntegration.id}`)
      // Update existing integration
      result = await supabase
        .from("advanced_integrations")
        .update(dataWithTimestamps)
        .eq("id", existingIntegration.id)
        .select()
        .single()
    } else {
      console.log("Creating new integration")
      // Insert new integration
      result = await supabase
        .from("advanced_integrations")
        .insert({
          ...dataWithTimestamps,
          created_at: now,
        })
        .select()
        .single()
    }

    if (result.error) {
      console.error("Error upserting integration:", result.error)
      throw result.error
    }

    return result.data
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
    return JSON.parse(atob(state))
  } catch (error) {
    console.error("Invalid OAuth state parameter:", error)
    throw new Error("Invalid OAuth state parameter")
  }
}

/**
 * Validate user session from request
 * Returns user ID if session is valid, null otherwise
 */
export async function validateSession(request: NextRequest): Promise<string | null> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error("Missing Supabase environment variables for session validation")
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
      return ["bot", "applications.commands", "identify", "guilds"]
    case "dropbox":
      return ["files.content.write", "files.content.read"]
    case "google":
      return ["https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"]
    case "github":
      return ["repo", "user"]
    // Add other providers as needed
    default:
      return []
  }
}
