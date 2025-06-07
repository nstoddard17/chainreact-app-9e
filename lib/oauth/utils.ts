import { createClient } from "@supabase/supabase-js"
import type { NextRequest } from "next/server"
import type { Database } from "@/types/supabase"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

/**
 * Create admin client only for server-side operations
 */
export const createAdminSupabaseClient = () => {
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
    throw new Error(`Missing required Supabase admin environment variables: ${missingVars.join(", ")}`)
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
 */
export function getOAuthRedirectUri(provider: string, req?: Request): string {
  const baseUrl = getBaseUrl(req)
  return `${baseUrl}/api/integrations/${provider}/callback`
}

/**
 * Get the absolute base URL for OAuth redirects based on the request
 * Always returns production URL for OAuth consistency
 */
export function getAbsoluteBaseUrl(request?: Request | NextRequest): string {
  return getBaseUrl(request as Request)
}

/**
 * Upsert integration data safely
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
  },
): Promise<any> {
  try {
    const now = new Date().toISOString()

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

    // Check if integration exists
    const { data: existingIntegration, error: findError } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", integrationData.user_id)
      .eq("provider", integrationData.provider)
      .maybeSingle()

    if (findError) {
      console.error("Error checking for existing integration:", findError)
    }

    let result
    if (existingIntegration) {
      result = await supabase
        .from("integrations")
        .update(mainIntegrationData)
        .eq("id", existingIntegration.id)
        .select()
        .single()
    } else {
      result = await supabase
        .from("integrations")
        .insert({
          ...mainIntegrationData,
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
  } = {},
): string {
  const state = {
    provider,
    userId,
    timestamp: Date.now(),
    reconnect: options.reconnect || false,
    integrationId: options.integrationId,
  }

  return Buffer.from(JSON.stringify(state)).toString("base64")
}

/**
 * Parse OAuth state safely
 */
export function parseOAuthState(state: string): any {
  try {
    return JSON.parse(Buffer.from(state, "base64").toString())
  } catch (error) {
    console.error("Failed to parse OAuth state:", error)
    throw new Error("Invalid OAuth state parameter")
  }
}

/**
 * Get user from request using getUser() instead of getSession()
 */
export async function getUserFromRequest(request: NextRequest): Promise<string | null> {
  try {
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      return null
    }

    const authHeader = request.headers.get("authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return null
    }

    const token = authHeader.substring(7)
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const { data, error } = await supabase.auth.getUser(token)

    if (error || !data?.user?.id) {
      return null
    }

    return data.user.id
  } catch (error) {
    console.error("Error getting user from request:", error)
    return null
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
 * Get required scopes for each provider
 */
export function getRequiredScopes(provider: string): string[] {
  switch (provider.toLowerCase()) {
    case "slack":
      return ["chat:write", "channels:read", "users:read"]
    case "discord":
      return ["identify", "guilds"]
    case "google":
      return ["https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/userinfo.profile"]
    case "github":
      return ["repo", "user"]
    case "trello":
      return ["read", "write"]
    case "notion":
      return ["read_content", "insert_content"]
    case "airtable":
      return ["data.records:read", "data.records:write"]
    case "dropbox":
      return ["files.content.read", "files.content.write"]
    case "hubspot":
      return ["crm.objects.contacts.read", "crm.objects.deals.read"]
    case "linkedin":
      return ["r_liteprofile", "w_member_social"]
    case "facebook":
      return ["pages_manage_posts", "pages_read_engagement"]
    case "teams":
      return ["User.Read", "Chat.ReadWrite"]
    default:
      return []
  }
}
