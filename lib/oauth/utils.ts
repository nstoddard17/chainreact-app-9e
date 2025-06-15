import { createClient } from "@supabase/supabase-js"

// Create admin Supabase client with service role key
export function createAdminSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing Supabase environment variables for admin client")
    throw new Error("Missing required Supabase environment variables")
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

// Get OAuth redirect URI for a provider
export function getOAuthRedirectUri(provider: string): string {
  const baseUrl = getAbsoluteBaseUrl()
  return `${baseUrl}/api/integrations/${provider}/callback`
}

// Upsert integration data to Supabase
export async function upsertIntegration(integrationData: any) {
  try {
    const supabase = createAdminSupabaseClient()

    const { data, error } = await supabase
      .from("integrations")
      .upsert(integrationData, {
        onConflict: "user_id,provider",
      })
      .select()

    if (error) {
      console.error("Error upserting integration:", error)
      throw error
    }

    return { success: true, data }
  } catch (error) {
    console.error("Failed to upsert integration:", error)
    return { success: false, error }
  }
}

// Validate OAuth scopes
export function validateScopes(provider: string, grantedScopes: string[]): boolean {
  const requiredScopes = getRequiredScopes(provider)

  if (!requiredScopes || requiredScopes.length === 0) {
    return true // No specific scopes required
  }

  return requiredScopes.every((scope) => grantedScopes.includes(scope))
}

// Get required scopes for each provider
export function getRequiredScopes(provider: string): string[] {
  const scopeMap: Record<string, string[]> = {
    google: ["openid", "email", "profile"],
    "google-calendar": ["https://www.googleapis.com/auth/calendar"],
    "google-drive": ["https://www.googleapis.com/auth/drive"],
    "google-sheets": ["https://www.googleapis.com/auth/spreadsheets"],
    "google-docs": ["https://www.googleapis.com/auth/documents"],
    gmail: ["https://www.googleapis.com/auth/gmail.modify"],
    youtube: ["https://www.googleapis.com/auth/youtube"],
    slack: ["channels:read", "chat:write", "users:read"],
    github: ["repo", "user:email"],
    gitlab: ["read_user", "read_repository"],
    discord: ["identify", "email"],
    twitter: ["tweet.read", "users.read"],
    linkedin: ["r_liteprofile", "r_emailaddress"],
    facebook: ["email", "public_profile"],
    instagram: ["user_profile", "user_media"],
    tiktok: ["user.info.basic"],
    notion: ["read_content"],
    trello: ["read", "write"],
    airtable: ["data.records:read", "data.records:write"],
    dropbox: ["files.content.read", "files.content.write"],
    onedrive: ["Files.Read", "Files.ReadWrite"],
    shopify: ["read_products", "write_products"],
    stripe: ["read_write"],
    paypal: ["openid", "profile"],
    mailchimp: ["read", "write"],
    hubspot: ["contacts", "content"],
    teams: ["User.Read", "Chat.ReadWrite"],
    docker: ["repo:read"],
  }

  return scopeMap[provider] || []
}

// Parse OAuth state parameter
export function parseOAuthState(state: string): any {
  try {
    return JSON.parse(decodeURIComponent(state))
  } catch (error) {
    console.error("Failed to parse OAuth state:", error)
    return {}
  }
}

// Generate OAuth state parameter
export function generateOAuthState(data: any): string {
  try {
    return encodeURIComponent(JSON.stringify(data))
  } catch (error) {
    console.error("Failed to generate OAuth state:", error)
    return ""
  }
}

// Get absolute base URL
export function getAbsoluteBaseUrl(): string {
  // Check for configured URLs first
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")
  }

  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "")
  }

  // Fallback for development
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000"
  }

  // Default fallback
  return "https://your-app.vercel.app"
}

// Validate user session
export async function validateSession(sessionToken?: string): Promise<{ valid: boolean; user?: any }> {
  if (!sessionToken) {
    return { valid: false }
  }

  try {
    const supabase = createAdminSupabaseClient()

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(sessionToken)

    if (error || !user) {
      return { valid: false }
    }

    return { valid: true, user }
  } catch (error) {
    console.error("Session validation error:", error)
    return { valid: false }
  }
}
