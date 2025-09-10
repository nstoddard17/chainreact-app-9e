import { createClient } from "@/utils/supabaseClient"
import { encrypt, decrypt } from "@/lib/security/encryption"
import type { SupabaseClient } from "@supabase/supabase-js"

interface TokenData {
  access_token: string
  refresh_token?: string
  expires_at?: string
  token_type?: string
}

interface RefreshResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
}

/**
 * Refreshes an OAuth token using provider-specific methods
 * and updates it in the database
 */
export async function refreshIntegrationToken(
  userId: string, 
  provider: string
): Promise<TokenData> {
  const supabase = createClient()
  
  // Get current integration data including refresh token
  const { data: integration, error } = await supabase
    .from("user_integrations")
    .select("*")
    .eq("user_id", userId)
    .eq("provider_id", provider)
    .single()
  
  if (error || !integration) {
    throw new Error(`Integration not found: ${provider}`)
  }
  
  if (!integration.refresh_token) {
    throw new Error(`No refresh token available for ${provider}`)
  }
  
  // Decrypt the refresh token
  const refreshToken = decrypt(integration.refresh_token)
  
  // Get provider-specific refresh handler
  const refreshHandler = getRefreshHandlerForProvider(provider)
  
  // Call provider-specific refresh logic
  const refreshedTokens = await refreshHandler(refreshToken)
  
  // Update tokens in the database
  const tokenData = await updateTokensInDatabase(
    supabase,
    userId,
    provider,
    refreshedTokens
  )
  
  return tokenData
}

/**
 * Gets the appropriate refresh handler for a specific provider
 */
function getRefreshHandlerForProvider(provider: string): (refreshToken: string) => Promise<RefreshResponse> {
  const handlers: Record<string, (refreshToken: string) => Promise<RefreshResponse>> = {
    gmail: refreshGoogleToken,
    google_calendar: refreshGoogleToken,
    google_drive: refreshGoogleToken,
    google_sheets: refreshGoogleToken,
    microsoft_outlook: refreshMicrosoftToken,
    onedrive: refreshMicrosoftToken,
    onenote: refreshMicrosoftToken,
    'microsoft-onenote': refreshMicrosoftToken,
    // Add other providers here
  }
  
  const handler = handlers[provider]
  if (!handler) {
    throw new Error(`No refresh handler available for provider: ${provider}`)
  }
  
  return handler
}

/**
 * Refreshes a Google OAuth token (works for Gmail, Calendar, Drive, etc)
 */
async function refreshGoogleToken(refreshToken: string): Promise<RefreshResponse> {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth credentials not configured")
  }
  
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  })
  
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to refresh Google token: ${error}`)
  }
  
  return response.json()
}

/**
 * Refreshes a Microsoft OAuth token (for Outlook, OneDrive, etc)
 */
async function refreshMicrosoftToken(refreshToken: string): Promise<RefreshResponse> {
  const clientId = process.env.MICROSOFT_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
  
  if (!clientId || !clientSecret) {
    throw new Error("Microsoft OAuth credentials not configured")
  }
  
  const response = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: "https://graph.microsoft.com/.default",
    }),
  })
  
  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to refresh Microsoft token: ${error}`)
  }
  
  return response.json()
}

/**
 * Updates tokens in the database after successful refresh
 */
async function updateTokensInDatabase(
  supabase: SupabaseClient,
  userId: string,
  provider: string,
  tokens: RefreshResponse
): Promise<TokenData> {
  // Calculate new expiration time
  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
    : undefined
  
  // Encrypt tokens
  const encryptedAccessToken = encrypt(tokens.access_token)
  const encryptedRefreshToken = tokens.refresh_token
    ? encrypt(tokens.refresh_token)
    : undefined
  
  // Create update object
  const updateData: Partial<TokenData> = {
    access_token: encryptedAccessToken,
    token_type: tokens.token_type,
    expires_at: expiresAt,
  }
  
  // Only update refresh token if we got a new one
  if (encryptedRefreshToken) {
    updateData.refresh_token = encryptedRefreshToken
  }
  
  // Update the database
  const { data, error } = await supabase
    .from("user_integrations")
    .update(updateData)
    .eq("user_id", userId)
    .eq("provider_id", provider)
    .select()
    .single()
  
  if (error || !data) {
    throw new Error(`Failed to update tokens for ${provider}`)
  }
  
  return data
} 