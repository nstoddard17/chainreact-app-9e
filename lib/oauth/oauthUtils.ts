import { cookies } from "next/headers"
import { createAdminSupabaseClient, parseOAuthState, upsertIntegration } from "./utils"

export interface OAuthConfig {
  provider: string
  clientId: string
  clientSecret: string
  scopes: string[]
  authUrl: string
  tokenUrl: string
  userInfoUrl?: string
}

export interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  scope?: string
}

export interface OAuthState {
  provider: string
  userId: string
  reconnect?: boolean
  integrationId?: string
  timestamp: number
}

export interface CallbackResult {
  success: boolean
  error?: string
  message?: string
}

export async function generateAuthUrl(
  provider: string,
  scopes: string[],
  userId: string,
  options: {
    reconnect?: boolean
    integrationId?: string
  } = {},
): Promise<string> {
  try {
    // Generate secure state
    const { generateOAuthState, getOAuthRedirectUri } = await import("./utils")
    const state = generateOAuthState(provider, userId, options)

    // Store state in secure cookie
    const cookieStore = cookies()
    cookieStore.set(`oauth_state_${provider}`, state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes
    })

    // Get redirect URI
    const redirectUri = getOAuthRedirectUri(provider)

    // Provider-specific auth URL generation
    switch (provider.toLowerCase()) {
      case "slack":
        return generateSlackAuthUrl(scopes, state, redirectUri)
      case "discord":
        return generateDiscordAuthUrl(scopes, state, redirectUri)
      case "github":
        return generateGitHubAuthUrl(scopes, state, redirectUri)
      case "google":
      case "gmail":
      case "google-drive":
      case "google-sheets":
      case "google-docs":
      case "google-calendar":
      case "youtube":
        return generateGoogleAuthUrl(provider, scopes, state, redirectUri)
      case "notion":
        return generateNotionAuthUrl(scopes, state, redirectUri)
      case "twitter":
        return generateTwitterAuthUrl(scopes, state, redirectUri)
      case "linkedin":
        return generateLinkedInAuthUrl(scopes, state, redirectUri)
      case "dropbox":
        return generateDropboxAuthUrl(scopes, state, redirectUri)
      case "trello":
        return generateTrelloAuthUrl(scopes, state, redirectUri)
      default:
        throw new Error(`Unsupported OAuth provider: ${provider}`)
    }
  } catch (error) {
    console.error(`Error generating auth URL for ${provider}:`, error)
    throw error
  }
}

export async function handleCallback(provider: string, code: string, state: string): Promise<CallbackResult> {
  try {
    console.log(`Handling OAuth callback for ${provider}`)

    // Verify state parameter
    const cookieStore = cookies()
    const storedState = cookieStore.get(`oauth_state_${provider}`)?.value

    if (!storedState || storedState !== state) {
      throw new Error("Invalid or expired state parameter")
    }

    // Clear the state cookie
    cookieStore.set(`oauth_state_${provider}`, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 0,
    })

    // Parse state to get user information
    const stateData = parseOAuthState(state)
    const userId = stateData.userId

    if (!userId) {
      throw new Error("User ID not found in state")
    }

    // Get provider handler
    const handler = getProviderHandler(provider)
    if (!handler) {
      throw new Error(`No handler found for provider: ${provider}`)
    }

    // Exchange code for tokens
    const tokenData = await handler.exchangeCodeForToken(code)

    // Get user info from provider
    const userInfo = await handler.getUserInfo(tokenData.access_token)

    // Prepare integration data
    const integrationData = {
      user_id: userId,
      provider,
      provider_user_id: userInfo.id || userInfo.user_id || userInfo.sub || userInfo.login,
      status: "connected" as const,
      scopes: tokenData.scope ? tokenData.scope.split(/[, ]/).filter(Boolean) : [],
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      expires_at: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null,
      metadata: {
        ...userInfo,
        connected_at: new Date().toISOString(),
        token_type: tokenData.token_type || "Bearer",
      },
    }

    // Save to database
    const supabase = createAdminSupabaseClient()
    await upsertIntegration(supabase, integrationData)

    // Log successful connection
    await supabase.from("token_audit_log").insert({
      user_id: userId,
      provider,
      action: stateData.reconnect ? "reconnected" : "connected",
      status: "success",
      details: {
        scopes: integrationData.scopes,
        provider_user_id: integrationData.provider_user_id,
      },
    })

    return {
      success: true,
      message: `${provider} connected successfully`,
    }
  } catch (error: any) {
    console.error(`Error handling ${provider} callback:`, error)

    // Log failed connection attempt
    try {
      const stateData = parseOAuthState(state)
      if (stateData.userId) {
        const supabase = createAdminSupabaseClient()
        await supabase.from("token_audit_log").insert({
          user_id: stateData.userId,
          provider,
          action: "connection_failed",
          status: "error",
          details: {
            error: error.message,
            timestamp: new Date().toISOString(),
          },
        })
      }
    } catch (logError) {
      console.error("Failed to log error:", logError)
    }

    return {
      success: false,
      error: error.message || `Failed to connect ${provider}`,
    }
  }
}

// Server-side only function to get provider credentials
function getProviderCredentials(provider: string) {
  switch (provider.toLowerCase()) {
    case "slack":
      return {
        clientId: process.env.NEXT_PUBLIC_SLACK_CLIENT_ID,
        clientSecret: process.env.SLACK_CLIENT_SECRET,
      }
    case "discord":
      return {
        clientId: process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID,
        clientSecret: process.env.DISCORD_CLIENT_SECRET,
      }
    case "github":
      return {
        clientId: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
      }
    case "google":
    case "gmail":
    case "google-drive":
    case "google-sheets":
    case "google-docs":
    case "google-calendar":
    case "youtube":
      return {
        clientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      }
    case "notion":
      return {
        clientId: process.env.NEXT_PUBLIC_NOTION_CLIENT_ID,
        clientSecret: process.env.NOTION_CLIENT_SECRET,
      }
    case "twitter":
      return {
        clientId: process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID,
        clientSecret: process.env.TWITTER_CLIENT_SECRET,
      }
    case "linkedin":
      return {
        clientId: process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_ID,
        clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
      }
    case "dropbox":
      return {
        clientId: process.env.NEXT_PUBLIC_DROPBOX_CLIENT_ID,
        clientSecret: process.env.DROPBOX_CLIENT_SECRET,
      }
    case "trello":
      return {
        clientId: process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID,
        clientSecret: process.env.TRELLO_CLIENT_SECRET,
      }
    default:
      throw new Error(`Unsupported provider: ${provider}`)
  }
}

function getProviderHandler(provider: string) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  const credentials = getProviderCredentials(provider)

  if (!credentials.clientId || !credentials.clientSecret) {
    throw new Error(`Missing credentials for ${provider}`)
  }

  switch (provider.toLowerCase()) {
    case "slack":
      return {
        exchangeCodeForToken: async (code: string) => {
          const response = await fetch("https://slack.com/api/oauth.v2.access", {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              client_id: credentials.clientId!,
              client_secret: credentials.clientSecret!,
              code,
              redirect_uri: `${baseUrl}/api/integrations/slack/callback`,
            }),
          })

          const data = await response.json()
          if (!data.ok) {
            throw new Error(data.error || "Failed to exchange code for token")
          }

          return {
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_in: data.expires_in,
            scope: data.scope,
            token_type: data.token_type,
          }
        },
        getUserInfo: async (accessToken: string) => {
          const response = await fetch("https://slack.com/api/auth.test", {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          })

          const data = await response.json()
          if (!data.ok) {
            throw new Error(data.error || "Failed to get user info")
          }

          return {
            id: data.user_id,
            user_id: data.user_id,
            name: data.user,
            team_id: data.team_id,
            team: data.team,
            url: data.url,
          }
        },
      }

    case "discord":
      return {
        exchangeCodeForToken: async (code: string) => {
          const response = await fetch("https://discord.com/api/oauth2/token", {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              client_id: credentials.clientId!,
              client_secret: credentials.clientSecret!,
              grant_type: "authorization_code",
              code,
              redirect_uri: `${baseUrl}/api/integrations/discord/callback`,
            }),
          })

          const data = await response.json()
          if (!response.ok) {
            throw new Error(data.error_description || "Failed to exchange code for token")
          }

          return data
        },
        getUserInfo: async (accessToken: string) => {
          const response = await fetch("https://discord.com/api/users/@me", {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          })

          const data = await response.json()
          if (!response.ok) {
            throw new Error("Failed to get user info")
          }

          return data
        },
      }

    case "github":
      return {
        exchangeCodeForToken: async (code: string) => {
          const response = await fetch("https://github.com/login/oauth/access_token", {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              client_id: credentials.clientId!,
              client_secret: credentials.clientSecret!,
              code,
            }),
          })

          const data = await response.json()
          if (data.error) {
            throw new Error(data.error_description || "Failed to exchange code for token")
          }

          return data
        },
        getUserInfo: async (accessToken: string) => {
          const response = await fetch("https://api.github.com/user", {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "User-Agent": "ChainReact-App",
            },
          })

          const data = await response.json()
          if (!response.ok) {
            throw new Error("Failed to get user info")
          }

          return data
        },
      }

    case "google":
    case "gmail":
    case "google-drive":
    case "google-sheets":
    case "google-docs":
    case "google-calendar":
    case "youtube":
      return {
        exchangeCodeForToken: async (code: string) => {
          const response = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              client_id: credentials.clientId!,
              client_secret: credentials.clientSecret!,
              code,
              grant_type: "authorization_code",
              redirect_uri: `${baseUrl}/api/integrations/${provider}/callback`,
            }),
          })

          const data = await response.json()
          if (!response.ok) {
            throw new Error(data.error_description || "Failed to exchange code for token")
          }

          return data
        },
        getUserInfo: async (accessToken: string) => {
          const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          })

          const data = await response.json()
          if (!response.ok) {
            throw new Error("Failed to get user info")
          }

          return data
        },
      }

    case "notion":
      return {
        exchangeCodeForToken: async (code: string) => {
          const authHeader = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64")

          const response = await fetch("https://api.notion.com/v1/oauth/token", {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              Authorization: `Basic ${authHeader}`,
            },
            body: JSON.stringify({
              grant_type: "authorization_code",
              code,
              redirect_uri: `${baseUrl}/api/integrations/notion/callback`,
            }),
          })

          const data = await response.json()
          if (!response.ok) {
            throw new Error(data.error || "Failed to exchange code for token")
          }

          return data
        },
        getUserInfo: async (accessToken: string) => {
          const response = await fetch("https://api.notion.com/v1/users/me", {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Notion-Version": "2022-06-28",
            },
          })

          const data = await response.json()
          if (!response.ok) {
            throw new Error("Failed to get user info")
          }

          return data
        },
      }

    case "twitter":
      return {
        exchangeCodeForToken: async (code: string) => {
          const authHeader = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64")

          const response = await fetch("https://api.twitter.com/2/oauth2/token", {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Authorization: `Basic ${authHeader}`,
            },
            body: new URLSearchParams({
              code,
              grant_type: "authorization_code",
              redirect_uri: `${baseUrl}/api/integrations/twitter/callback`,
              code_verifier: "challenge", // This should be stored and retrieved properly
            }),
          })

          const data = await response.json()
          if (!response.ok) {
            throw new Error(data.error_description || "Failed to exchange code for token")
          }

          return data
        },
        getUserInfo: async (accessToken: string) => {
          const response = await fetch("https://api.twitter.com/2/users/me", {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          })

          const data = await response.json()
          if (!response.ok) {
            throw new Error("Failed to get user info")
          }

          return data.data
        },
      }

    default:
      return null
  }
}

function generateSlackAuthUrl(scopes: string[], state: string, redirectUri: string): string {
  const clientId = process.env.NEXT_PUBLIC_SLACK_CLIENT_ID
  if (!clientId) throw new Error("Slack client ID not configured")

  const params = new URLSearchParams({
    client_id: clientId,
    scope: scopes.join(","),
    redirect_uri: redirectUri,
    state,
    response_type: "code",
  })

  return `https://slack.com/oauth/v2/authorize?${params.toString()}`
}

function generateDiscordAuthUrl(scopes: string[], state: string, redirectUri: string): string {
  const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID
  if (!clientId) throw new Error("Discord client ID not configured")

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    state,
  })

  return `https://discord.com/api/oauth2/authorize?${params.toString()}`
}

function generateGitHubAuthUrl(scopes: string[], state: string, redirectUri: string): string {
  const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID
  if (!clientId) throw new Error("GitHub client ID not configured")

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(" "),
    state,
    response_type: "code",
  })

  return `https://github.com/login/oauth/authorize?${params.toString()}`
}

function generateGoogleAuthUrl(service: string, scopes: string[], state: string, redirectUri: string): string {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  if (!clientId) throw new Error("Google client ID not configured")

  // Map service to specific scopes
  const serviceScopes = getGoogleScopes(service)
  const allScopes = [...new Set([...scopes, ...serviceScopes])]

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: allScopes.join(" "),
    state,
    access_type: "offline",
    prompt: "consent",
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

function generateNotionAuthUrl(scopes: string[], state: string, redirectUri: string): string {
  const clientId = process.env.NEXT_PUBLIC_NOTION_CLIENT_ID
  if (!clientId) throw new Error("Notion client ID not configured")

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
  })

  return `https://api.notion.com/v1/oauth/authorize?${params.toString()}`
}

function generateTwitterAuthUrl(scopes: string[], state: string, redirectUri: string): string {
  const clientId = process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID
  if (!clientId) throw new Error("Twitter client ID not configured")

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    state,
    code_challenge_method: "S256",
    code_challenge: generateCodeChallenge(),
  })

  return `https://twitter.com/i/oauth2/authorize?${params.toString()}`
}

function generateLinkedInAuthUrl(scopes: string[], state: string, redirectUri: string): string {
  const clientId = process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_ID
  if (!clientId) throw new Error("LinkedIn client ID not configured")

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    state,
  })

  return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`
}

function generateDropboxAuthUrl(scopes: string[], state: string, redirectUri: string): string {
  const clientId = process.env.NEXT_PUBLIC_DROPBOX_CLIENT_ID
  if (!clientId) throw new Error("Dropbox client ID not configured")

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
  })

  return `https://www.dropbox.com/oauth2/authorize?${params.toString()}`
}

function generateTrelloAuthUrl(scopes: string[], state: string, redirectUri: string): string {
  const clientId = process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID
  if (!clientId) throw new Error("Trello client ID not configured")

  const params = new URLSearchParams({
    key: clientId,
    return_url: redirectUri,
    scope: scopes.join(","),
    expiration: "never",
    name: "ChainReact",
    response_type: "token",
  })

  return `https://trello.com/1/authorize?${params.toString()}`
}

function getGoogleScopes(service: string): string[] {
  const baseScopes = [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
  ]

  switch (service) {
    case "gmail":
      return [...baseScopes, "https://www.googleapis.com/auth/gmail.modify"]
    case "google-drive":
      return [...baseScopes, "https://www.googleapis.com/auth/drive"]
    case "google-sheets":
      return [...baseScopes, "https://www.googleapis.com/auth/spreadsheets"]
    case "google-docs":
      return [...baseScopes, "https://www.googleapis.com/auth/documents"]
    case "google-calendar":
      return [...baseScopes, "https://www.googleapis.com/auth/calendar"]
    case "youtube":
      return [...baseScopes, "https://www.googleapis.com/auth/youtube"]
    default:
      return baseScopes
  }
}

function generateCodeChallenge(): string {
  // Simple code challenge for Twitter OAuth 2.0 PKCE
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
}

export async function exchangeCodeForToken(
  provider: string,
  code: string,
  redirectUri: string,
): Promise<TokenResponse> {
  const handler = getProviderHandler(provider)
  if (!handler) {
    throw new Error(`No handler found for provider: ${provider}`)
  }
  return handler.exchangeCodeForToken(code)
}

export async function refreshAccessToken(provider: string, refreshToken: string): Promise<TokenResponse> {
  // Implementation for token refresh would go here
  throw new Error("Token refresh not implemented for this provider")
}
