import { cookies } from "next/headers"
import { generateOAuthState, getOAuthRedirectUri } from "./utils"

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
  // Implementation for token exchange
  // This would be provider-specific
  throw new Error("Token exchange not implemented for this provider")
}

export async function refreshAccessToken(provider: string, refreshToken: string): Promise<TokenResponse> {
  // Implementation for token refresh
  // This would be provider-specific
  throw new Error("Token refresh not implemented for this provider")
}
