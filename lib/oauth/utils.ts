import { createClient } from "@supabase/supabase-js"

export function createAdminSupabaseClient() {
  if (typeof window !== "undefined") {
    throw new Error("Admin client can only be used server-side")
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    const missingVars = []
    if (!supabaseUrl) missingVars.push("NEXT_PUBLIC_SUPABASE_URL")
    if (!supabaseServiceKey) missingVars.push("SUPABASE_SERVICE_ROLE_KEY")

    console.error(`Missing Supabase environment variables: ${missingVars.join(", ")}`)
    throw new Error(`Missing required Supabase environment variables: ${missingVars.join(", ")}`)
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

// Parse OAuth state parameter
export function parseOAuthState(state: string) {
  try {
    return JSON.parse(atob(state))
  } catch (error) {
    console.error("Failed to parse OAuth state:", error)
    throw new Error("Invalid OAuth state parameter")
  }
}

// Generate OAuth redirect URI
export function getOAuthRedirectUri(provider: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://chainreact.app"
  return `${baseUrl}/api/integrations/${provider}/callback`
}

// Get absolute base URL
export function getAbsoluteBaseUrl(request?: Request): string {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://chainreact.app"
}

// Validate user session
export async function validateSession(request: Request): Promise<string | null> {
  try {
    const authHeader = request.headers.get("authorization")
    if (!authHeader?.startsWith("Bearer ")) {
      return null
    }

    const token = authHeader.substring(7)
    const supabase = createAdminSupabaseClient()
    if (!supabase) {
      return null
    }

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token)
    if (error || !user) {
      return null
    }

    return user.id
  } catch (error) {
    console.error("Session validation error:", error)
    return null
  }
}

// Upsert integration data
export async function upsertIntegration(supabase: any, integrationData: any) {
  const { data, error } = await supabase
    .from("integrations")
    .upsert(integrationData, {
      onConflict: "user_id,provider",
      ignoreDuplicates: false,
    })
    .select()
    .single()

  if (error) {
    console.error("Failed to upsert integration:", error)
    throw new Error(`Failed to save integration: ${error.message}`)
  }

  return data
}

// Validate scopes
export function validateScopes(requiredScopes: string[], grantedScopes: string[]) {
  const missingScopes = requiredScopes.filter((scope) => !grantedScopes.includes(scope))

  return {
    valid: missingScopes.length === 0,
    missingScopes,
    grantedScopes,
  }
}

// Get required scopes for a provider
export function getRequiredScopes(provider: string): string[] {
  const scopeMap: Record<string, string[]> = {
    google: [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/documents",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/youtube.readonly",
    ],
    gmail: [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.readonly",
    ],
    "google-drive": [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/drive.file",
    ],
    "google-calendar": [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/calendar.events",
    ],
    "google-sheets": [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/spreadsheets",
    ],
    "google-docs": [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/documents",
      "https://www.googleapis.com/auth/drive.file",
    ],
    youtube: [
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/youtube.upload",
    ],
    slack: [
      "channels:read",
      "chat:write",
      "users:read",
      "team:read",
      "files:write",
      "channels:history",
      "groups:history",
      "im:history",
      "mpim:history",
    ],
    discord: ["identify", "guilds", "guilds.join", "messages.read"],
    github: ["repo", "user", "workflow"],
    twitter: ["tweet.read", "tweet.write", "users.read", "follows.read", "follows.write"],
    linkedin: ["r_liteprofile", "r_emailaddress", "w_member_social"],
    facebook: ["email", "public_profile", "pages_manage_posts", "pages_read_engagement"],
    instagram: ["instagram_basic", "instagram_content_publish"],
    dropbox: ["files.metadata.write", "files.content.write", "files.content.read"],
    teams: [
      "openid",
      "profile",
      "email",
      "offline_access",
      "https://graph.microsoft.com/User.Read",
      "https://graph.microsoft.com/Chat.ReadWrite",
      "https://graph.microsoft.com/ChannelMessage.Send",
      "https://graph.microsoft.com/Team.ReadBasic.All",
    ],
    onedrive: [
      "openid",
      "profile",
      "email",
      "offline_access",
      "https://graph.microsoft.com/User.Read",
      "https://graph.microsoft.com/Files.ReadWrite.All",
      "https://graph.microsoft.com/Sites.ReadWrite.All",
    ],
    hubspot: ["contacts", "content", "reports", "social", "automation"],
    notion: ["read", "update", "insert"],
    trello: ["read", "write", "account"],
    airtable: ["data.records:read", "data.records:write", "schema.bases:read"],
    shopify: ["read_products", "write_products", "read_orders", "write_orders"],
    stripe: ["read_write"],
    paypal: ["openid", "profile", "email"],
    tiktok: ["user.info.basic", "video.list", "video.upload"],
    mailchimp: ["read", "write"],
    gitlab: ["read_user", "read_repository", "write_repository"],
    docker: ["repo:read", "repo:write"],
  }

  return scopeMap[provider] || []
}

// Generate OAuth state parameter
export function generateOAuthState(data: any): string {
  return btoa(
    JSON.stringify({
      ...data,
      timestamp: Date.now(),
    }),
  )
}

// Validate OAuth callback parameters
export function validateOAuthCallback(code: string, state: string) {
  if (!code) {
    throw new Error("Missing authorization code")
  }

  if (!state) {
    throw new Error("Missing state parameter")
  }

  return parseOAuthState(state)
}

// Create server-side Supabase client
export function createServerSupabaseClient() {
  return createAdminSupabaseClient()
}
