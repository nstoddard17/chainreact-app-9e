import { createClient } from "@supabase/supabase-js"

// Create admin Supabase client
export function createAdminSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing Supabase environment variables")
    return null
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

// Generate OAuth redirect URI
export function getOAuthRedirectUri(provider: string, baseUrl?: string): string {
  const base = baseUrl || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
  return `${base}/api/integrations/${provider}/callback`
}

// Upsert integration data
export async function upsertIntegration(supabase: any, integrationData: any) {
  const { data: existing } = await supabase
    .from("integrations")
    .select("id")
    .eq("user_id", integrationData.user_id)
    .eq("provider", integrationData.provider)
    .single()

  if (existing) {
    const { error } = await supabase
      .from("integrations")
      .update({
        ...integrationData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)

    if (error) throw error
  } else {
    const { error } = await supabase.from("integrations").insert(integrationData)

    if (error) throw error
  }
}

// Validate OAuth scopes
export function validateScopes(
  grantedScopes: string[],
  requiredScopes: string[],
): { valid: boolean; missing: string[] } {
  const missing = requiredScopes.filter((scope) => !grantedScopes.includes(scope))
  return {
    valid: missing.length === 0,
    missing,
  }
}

// Get required scopes for a provider
export function getRequiredScopes(provider: string): string[] {
  const scopeMap: Record<string, string[]> = {
    airtable: ["data.records:read", "data.records:write", "schema.bases:read", "schema.bases:write"],
    google: ["openid", "email", "profile"],
    slack: ["channels:read", "chat:write", "users:read"],
    github: ["user:email", "repo"],
    // Add more providers as needed
  }

  return scopeMap[provider] || []
}

// Parse OAuth state parameter
export function parseOAuthState(state: string): any {
  try {
    return JSON.parse(atob(state))
  } catch (error) {
    throw new Error("Invalid state parameter")
  }
}

// Generate OAuth state parameter
export function generateOAuthState(data: any): string {
  return btoa(JSON.stringify(data))
}

// Get absolute base URL
export function getAbsoluteBaseUrl(request?: Request): string {
  if (request) {
    const url = new URL(request.url)
    return `${url.protocol}//${url.host}`
  }

  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
}

// Validate user session
export async function validateSession(supabase: any): Promise<{ user: any; error: any }> {
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()
    return { user, error }
  } catch (error) {
    return { user: null, error }
  }
}
