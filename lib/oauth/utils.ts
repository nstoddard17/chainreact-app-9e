import { createClient } from "@supabase/supabase-js"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

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
export function getOAuthRedirectUri(origin: string, provider: string): string {
  const baseUrl = getBaseUrl()
  const redirectUri = `${baseUrl}/api/integrations/${provider}/callback`
  
  console.log("🔍 OAuth Redirect URI Generation:", {
    origin,
    provider,
    baseUrl,
    redirectUri,
    environment: {
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      VERCEL_URL: process.env.VERCEL_URL,
      NODE_ENV: process.env.NODE_ENV
    }
  })
  
  return redirectUri
}

// Get base URL for OAuth flows
export function getOAuthBaseUrl(baseUrl?: string): string {
  return baseUrl || getBaseUrl()
}

// Standard OAuth scopes for each provider
export const OAuthScopes = {
  GITHUB: ["repo", "user", "read:org"] as const,
  GITLAB: ["read_api", "read_user", "read_repository", "write_repository"] as const,
  GOOGLE: [
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/userinfo.email",
  ] as const,
  GOOGLE_DRIVE: [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/userinfo.email",
  ] as const,
  GOOGLE_CALENDAR: [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
  ] as const,
  GOOGLE_DOCS: [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive.file",
  ] as const,
  GOOGLE_SHEETS: [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/spreadsheets",
  ] as const,
  MICROSOFT: ["user.read", "offline_access"] as const,
  DROPBOX: ["account_info.read", "files.content.read", "files.content.write"] as const,
  ONEDRIVE: ["files.readwrite", "offline_access", "user.read"] as const,
  BOX: ["base_preview", "base_upload", "item_upload", "item_download"] as const,
  TWITTER: ["tweet.read", "users.read", "offline.access"] as const,
  LINKEDIN: ["r_liteprofile", "r_emailaddress", "w_member_social"] as const,
  FACEBOOK: ["email", "public_profile"] as const,
  DISCORD: ["identify", "email", "guilds"] as const,
  INSTAGRAM: [
    "user_profile",
    "user_media",
    "instagram_basic",
    "instagram_content_publish"
  ] as const,
  SLACK: ["channels:read", "chat:write", "users:read"] as const,
  NOTION: ["read_user", "read_blocks", "write_blocks"] as const,
  TRELLO: ["read", "write", "account"] as const,
  HUBSPOT: ["contacts", "crm.objects.contacts.read", "crm.objects.contacts.write"] as const,
  PAYPAL: [
    "https://uri.paypal.com/services/payments/payment",
    "https://uri.paypal.com/services/payments/refund",
    "https://uri.paypal.com/services/payments/orders/read",
    "email",
    "openid",
    "profile"
  ] as const,
  STRIPE: ["read_write"] as const,
  TEAMS: ["user.read", "offline_access", "chat.read", "chat.write"] as const,
  MAILCHIMP: [] as const,
  AIRTABLE: [
    "data.records:read",
    "data.records:write",
    "schema.bases:read",
    "schema.bases:write",
  ] as const,
  DOCKER: ["repo:admin", "repo:write", "repo:read"] as const,
  TIKTOK: [
    "user.info.basic",
    "video.upload",
    "video.list",
    "comment.list",
    "comment.create"
  ] as const,
  SHOPIFY: [
    "read_products",
    "write_products",
    "read_orders",
    "write_orders",
    "read_customers",
    "write_customers",
    "read_inventory",
    "write_inventory"
  ] as const,
} as const

// Standard OAuth state interface
export interface OAuthState {
  provider: string
  userId: string
  timestamp: number
  codeVerifier?: string // For PKCE
  redirectUri?: string
  scopes?: string[]
  [key: string]: any // Allow additional provider-specific state
}

// Generate OAuth state
export function generateOAuthState(userId: string, provider: string): string {
  const state = {
    userId,
    provider,
    timestamp: Date.now(),
  }
  return Buffer.from(JSON.stringify(state)).toString("base64")
}

// Parse OAuth state
export function parseOAuthState(state: string): {
  userId: string
  provider: string
  timestamp: number
} {
  try {
    const decoded = Buffer.from(state, "base64").toString()
    const parsed = JSON.parse(decoded)
    return parsed
  } catch (error) {
    throw new Error("Invalid OAuth state")
  }
}

// Validate OAuth state
export function validateOAuthState(
  state: { userId: string; provider: string; timestamp: number },
  expectedProvider: string
): void {
  if (!state.userId || !state.provider || !state.timestamp) {
    throw new Error("Invalid OAuth state format")
  }

  if (state.provider !== expectedProvider) {
    throw new Error("OAuth state provider mismatch")
  }

  // State should be valid for 10 minutes
  const stateAge = Date.now() - state.timestamp
  if (stateAge > 10 * 60 * 1000) {
    throw new Error("OAuth state expired")
  }
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

// Generate PKCE parameters
export async function generatePKCE(): Promise<{ codeVerifier: string; codeChallenge: string }> {
  const codeVerifier = generateRandomString(128)
  const codeChallenge = base64URLEncode(await sha256(codeVerifier))
  return { codeVerifier, codeChallenge }
}

// Helper function to generate random string
function generateRandomString(length: number): string {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  let text = ""
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length))
  }
  return text
}

// Helper function to encode string to base64URL
function base64URLEncode(str: string): string {
  return btoa(str)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "")
}

// Helper function to compute SHA-256 hash
async function sha256(str: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(str)
  const hash = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
}
