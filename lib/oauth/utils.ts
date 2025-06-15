import { createClient } from "@supabase/supabase-js"
import type { NextRequest } from "next/server"
import type { Database } from "@/types/supabase"

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
 * Get standardized redirect URI for OAuth providers
 */
export function getOAuthRedirectUri(provider: string, req?: Request): string {
  // Use the production domain for all redirect URIs
  const baseUrl = "https://chainreact.app"
  return `${baseUrl}/api/integrations/${provider}/callback`
}

/**
 * Get base URL for the application
 */
export function getBaseUrl(req?: Request | NextRequest): string {
  // Always use production URL for OAuth redirects to ensure consistency
  return "https://chainreact.app"
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

export function getAbsoluteBaseUrl(request: NextRequest): string {
  // Always return production URL for consistency
  return "https://chainreact.app"
}

export function validateEnvironmentVariables(provider: string): { isValid: boolean; missing: string[] } {
  const missing: string[] = []

  switch (provider.toLowerCase()) {
    case "slack":
      if (!process.env.NEXT_PUBLIC_SLACK_CLIENT_ID) missing.push("NEXT_PUBLIC_SLACK_CLIENT_ID")
      if (!process.env.SLACK_CLIENT_SECRET) missing.push("SLACK_CLIENT_SECRET")
      break
    case "discord":
      if (!process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID) missing.push("NEXT_PUBLIC_DISCORD_CLIENT_ID")
      if (!process.env.DISCORD_CLIENT_SECRET) missing.push("DISCORD_CLIENT_SECRET")
      break
    case "github":
      if (!process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID) missing.push("NEXT_PUBLIC_GITHUB_CLIENT_ID")
      if (!process.env.GITHUB_CLIENT_SECRET) missing.push("GITHUB_CLIENT_SECRET")
      break
    case "google":
    case "gmail":
    case "google-drive":
    case "google-sheets":
    case "google-docs":
    case "google-calendar":
    case "youtube":
      if (!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) missing.push("NEXT_PUBLIC_GOOGLE_CLIENT_ID")
      if (!process.env.GOOGLE_CLIENT_SECRET) missing.push("GOOGLE_CLIENT_SECRET")
      break
    case "notion":
      if (!process.env.NEXT_PUBLIC_NOTION_CLIENT_ID) missing.push("NEXT_PUBLIC_NOTION_CLIENT_ID")
      if (!process.env.NOTION_CLIENT_SECRET) missing.push("NOTION_CLIENT_SECRET")
      break
    case "twitter":
      if (!process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID) missing.push("NEXT_PUBLIC_TWITTER_CLIENT_ID")
      if (!process.env.TWITTER_CLIENT_SECRET) missing.push("TWITTER_CLIENT_SECRET")
      break
    case "linkedin":
      if (!process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_ID) missing.push("NEXT_PUBLIC_LINKEDIN_CLIENT_ID")
      if (!process.env.LINKEDIN_CLIENT_SECRET) missing.push("LINKEDIN_CLIENT_SECRET")
      break
    case "dropbox":
      if (!process.env.NEXT_PUBLIC_DROPBOX_CLIENT_ID) missing.push("NEXT_PUBLIC_DROPBOX_CLIENT_ID")
      if (!process.env.DROPBOX_CLIENT_SECRET) missing.push("DROPBOX_CLIENT_SECRET")
      break
    case "trello":
      if (!process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID) missing.push("NEXT_PUBLIC_TRELLO_CLIENT_ID")
      if (!process.env.TRELLO_CLIENT_SECRET) missing.push("TRELLO_CLIENT_SECRET")
      break
  }

  return {
    isValid: missing.length === 0,
    missing,
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

export function generateRandomState(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

export function createOAuthState(
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
    reconnect: options.reconnect || false,
    integrationId: options.integrationId,
    timestamp: Date.now(),
    nonce: generateRandomState(),
  }

  return btoa(JSON.stringify(state))
}

export function parseOAuthState(stateString: string) {
  try {
    const decoded = atob(stateString)
    const state = JSON.parse(decoded)

    // Validate state structure
    if (!state.provider || !state.userId || !state.timestamp) {
      throw new Error("Invalid state structure")
    }

    // Check if state is not too old (10 minutes)
    const maxAge = 10 * 60 * 1000 // 10 minutes in milliseconds
    if (Date.now() - state.timestamp > maxAge) {
      throw new Error("State has expired")
    }

    return state
  } catch (error) {
    throw new Error("Invalid or expired state parameter")
  }
}

export function buildOAuthUrl(config: {
  authUrl: string
  clientId: string
  redirectUri: string
  scopes: string[]
  state: string
  additionalParams?: Record<string, string>
}): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: config.scopes.join(" "),
    state: config.state,
    ...config.additionalParams,
  })

  return `${config.authUrl}?${params.toString()}`
}

/**
 * Validate user session from request
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
