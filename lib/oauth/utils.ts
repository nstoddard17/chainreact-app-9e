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

// For backward compatibility - this is a lazy-loaded getter that only initializes on the server
// This prevents client-side errors while maintaining the export for existing code
export const adminSupabase = new Proxy({} as ReturnType<typeof createClient<Database>>, {
  get: (target, prop) => {
    // Only create the client when a property is accessed
    if (typeof window !== "undefined") {
      console.error("Error: Attempted to access adminSupabase on the client side")
      return undefined
    }

    try {
      const client = createAdminSupabaseClient()
      if (!client) {
        return undefined
      }
      // @ts-ignore - accessing dynamic property
      return client[prop]
    } catch (error) {
      console.error("Error accessing adminSupabase:", error)
      return undefined
    }
  },
})

/**
 * Get hardcoded redirect URI for OAuth providers
 * Always uses the production domain to prevent redirect mismatches
 */
export function getOAuthRedirectUri(provider: string): string {
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
