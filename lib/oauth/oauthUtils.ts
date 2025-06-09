import { createClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"

export interface OAuthConfig {
  provider: string
  clientId: string
  clientSecret: string
  redirectUri: string
  tokenUrl: string
  authUrl: string
  scopes: string[]
  defaultScopes?: string[]
}

export interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  scope?: string
}

export async function generateAuthUrl(provider: string, scopes: string[] = []) {
  const config = getOAuthConfig(provider)
  if (!config) {
    throw new Error(`Provider ${provider} not supported`)
  }

  const state = generateState()

  // Store state in cookies for verification
  cookies().set(`oauth_state_${provider}`, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 10, // 10 minutes
    path: "/",
  })

  const scopesToUse = scopes.length > 0 ? scopes : config.defaultScopes || config.scopes

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: scopesToUse.join(" "),
    state,
  })

  return `${config.authUrl}?${params.toString()}`
}

export async function handleCallback(provider: string, code: string, state: string) {
  // Verify state
  const savedState = cookies().get(`oauth_state_${provider}`)?.value
  if (!savedState || savedState !== state) {
    throw new Error("Invalid state parameter")
  }

  // Clear state cookie
  cookies().set(`oauth_state_${provider}`, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/",
  })

  const config = getOAuthConfig(provider)
  if (!config) {
    throw new Error(`Provider ${provider} not supported`)
  }

  // Exchange code for tokens
  const tokenResponse = await exchangeCodeForTokens(code, config)

  // Save tokens to database
  await saveTokens(provider, tokenResponse)

  return tokenResponse
}

async function exchangeCodeForTokens(code: string, config: OAuthConfig): Promise<TokenResponse> {
  const params = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  })

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to exchange code for tokens: ${error}`)
  }

  return response.json()
}

async function saveTokens(provider: string, tokenResponse: TokenResponse) {
  const supabase = createClient()
  const user = await supabase.auth.getUser()

  if (!user.data.user) {
    throw new Error("User not authenticated")
  }

  const userId = user.data.user.id
  const expiresAt = tokenResponse.expires_in
    ? new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString()
    : null

  // Check if integration already exists
  const { data: existingIntegration } = await supabase
    .from("integrations")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", provider)
    .single()

  if (existingIntegration) {
    // Update existing integration
    await supabase
      .from("integrations")
      .update({
        access_token: tokenResponse.access_token,
        refresh_token: tokenResponse.refresh_token || null,
        expires_at: expiresAt,
        status: "connected",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingIntegration.id)
  } else {
    // Create new integration
    await supabase.from("integrations").insert({
      user_id: userId,
      provider,
      access_token: tokenResponse.access_token,
      refresh_token: tokenResponse.refresh_token || null,
      expires_at: expiresAt,
      status: "connected",
    })
  }

  // Log the token update
  await supabase.from("token_audit_log").insert({
    user_id: userId,
    provider,
    action: existingIntegration ? "token_refreshed" : "integration_connected",
    status: "success",
    details: { scopes: tokenResponse.scope?.split(" ") || [] },
  })
}

function generateState() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

function getOAuthConfig(provider: string): OAuthConfig | null {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

  const configs: Record<string, OAuthConfig> = {
    google: {
      provider: "google",
      clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirectUri: `${baseUrl}/api/integrations/google/callback`,
      tokenUrl: "https://oauth2.googleapis.com/token",
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      scopes: ["profile", "email"],
      defaultScopes: ["profile", "email"],
    },
    github: {
      provider: "github",
      clientId: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID || "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
      redirectUri: `${baseUrl}/api/integrations/github/callback`,
      tokenUrl: "https://github.com/login/oauth/access_token",
      authUrl: "https://github.com/login/oauth/authorize",
      scopes: ["repo", "user"],
      defaultScopes: ["repo", "user"],
    },
    // Add other providers as needed
  }

  return configs[provider] || null
}
