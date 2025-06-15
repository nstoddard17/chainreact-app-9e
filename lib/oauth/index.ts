import { SlackOAuthService } from "./SlackOAuthService"
import { DiscordOAuthService } from "./DiscordOAuthService"
import { DropboxOAuthService } from "./DropboxOAuthService"
import { TwitterOAuthService } from "./twitter"
import { LinkedInOAuthService } from "./linkedin"
import { TrelloOAuthService } from "./TrelloOAuthService"
import { GitLabOAuthService } from "./gitlab"

export interface OAuthProvider {
  generateAuthUrl(baseUrl: string, reconnect?: boolean, integrationId?: string, userId?: string): string
  exchangeCodeForToken(code: string): Promise<any>
  getUserInfo(accessToken: string): Promise<any>
}

export function getOAuthProvider(provider: string): OAuthProvider {
  switch (provider.toLowerCase()) {
    case "slack":
      return SlackOAuthService
    case "discord":
      return DiscordOAuthService
    case "dropbox":
      return DropboxOAuthService
    case "twitter":
      return {
        generateAuthUrl: async (baseUrl: string, reconnect = false, integrationId?: string, userId?: string) => {
          return TwitterOAuthService.generateAuthUrl(baseUrl, reconnect, integrationId, userId)
        },
        exchangeCodeForToken: async (code: string) => {
          // This should only be called server-side
          if (typeof window !== "undefined") {
            throw new Error("Token exchange must be done server-side")
          }
          throw new Error("Use TwitterOAuthService.handleCallback instead")
        },
        getUserInfo: async (accessToken: string) => {
          const response = await fetch("https://api.twitter.com/2/users/me", {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          })
          const data = await response.json()
          return data.data
        },
      }
    case "linkedin":
      return LinkedInOAuthService
    case "trello":
      return TrelloOAuthService
    case "gitlab":
      return {
        generateAuthUrl: (baseUrl: string, reconnect = false, integrationId?: string, userId?: string) => {
          return GitLabOAuthService.generateAuthUrl(baseUrl, reconnect, integrationId, userId)
        },
        exchangeCodeForToken: async (code: string) => {
          // This should only be called server-side
          if (typeof window !== "undefined") {
            throw new Error("Token exchange must be done server-side")
          }
          throw new Error("Use GitLabOAuthService.handleCallback instead")
        },
        getUserInfo: async (accessToken: string) => {
          const response = await fetch("https://gitlab.com/api/v4/user", {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          })
          return response.json()
        },
      }
    case "github":
      return {
        generateAuthUrl: (baseUrl: string, reconnect = false, integrationId?: string, userId?: string) => {
          const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID
          if (!clientId) throw new Error("GitHub client ID not configured")

          const state = btoa(
            JSON.stringify({
              provider: "github",
              userId,
              reconnect,
              integrationId,
              timestamp: Date.now(),
            }),
          )

          const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: `${baseUrl}/api/integrations/github/callback`,
            scope: "repo user",
            state,
          })

          return `https://github.com/login/oauth/authorize?${params.toString()}`
        },
        exchangeCodeForToken: async (code: string) => {
          // This should only be called server-side
          if (typeof window !== "undefined") {
            throw new Error("Token exchange must be done server-side")
          }

          const response = await fetch("https://github.com/login/oauth/access_token", {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              client_id: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID!,
              client_secret: process.env.GITHUB_CLIENT_SECRET!,
              code,
            }),
          })
          return response.json()
        },
        getUserInfo: async (accessToken: string) => {
          const response = await fetch("https://api.github.com/user", {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "User-Agent": "ChainReact-App",
            },
          })
          return response.json()
        },
      }
    case "gmail":
    case "google-drive":
    case "google-sheets":
    case "google-docs":
    case "google-calendar":
    case "youtube":
      return {
        generateAuthUrl: (baseUrl: string, reconnect = false, integrationId?: string, userId?: string) => {
          const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
          if (!clientId) throw new Error("Google client ID not configured")

          const scopes = getGoogleScopes(provider)
          const state = btoa(
            JSON.stringify({
              provider,
              userId,
              reconnect,
              integrationId,
              timestamp: Date.now(),
            }),
          )

          const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: `${baseUrl}/api/integrations/${provider}/callback`,
            response_type: "code",
            scope: scopes.join(" "),
            access_type: "offline",
            prompt: "consent",
            state,
          })

          return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
        },
        exchangeCodeForToken: async (code: string) => {
          // This should only be called server-side
          if (typeof window !== "undefined") {
            throw new Error("Token exchange must be done server-side")
          }

          const response = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
              client_secret: process.env.GOOGLE_CLIENT_SECRET!,
              code,
              grant_type: "authorization_code",
              redirect_uri: `${process.env.NEXT_PUBLIC_SITE_URL}/api/integrations/${provider}/callback`,
            }),
          })
          return response.json()
        },
        getUserInfo: async (accessToken: string) => {
          const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          })
          return response.json()
        },
      }
    case "notion":
      return {
        generateAuthUrl: (baseUrl: string, reconnect = false, integrationId?: string, userId?: string) => {
          const clientId = process.env.NEXT_PUBLIC_NOTION_CLIENT_ID
          if (!clientId) throw new Error("Notion client ID not configured")

          const state = btoa(
            JSON.stringify({
              provider: "notion",
              userId,
              reconnect,
              integrationId,
              timestamp: Date.now(),
            }),
          )

          const params = new URLSearchParams({
            client_id: clientId,
            response_type: "code",
            owner: "user",
            redirect_uri: `${baseUrl}/api/integrations/notion/callback`,
            state,
          })

          return `https://api.notion.com/v1/oauth/authorize?${params.toString()}`
        },
        exchangeCodeForToken: async (code: string) => {
          // This should only be called server-side
          if (typeof window !== "undefined") {
            throw new Error("Token exchange must be done server-side")
          }

          // Server-side token exchange - credentials are safely accessed here
          const clientId = process.env.NEXT_PUBLIC_NOTION_CLIENT_ID!
          const clientSecret = process.env.NOTION_CLIENT_SECRET!
          const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64")

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
              redirect_uri: `${process.env.NEXT_PUBLIC_SITE_URL}/api/integrations/notion/callback`,
            }),
          })
          return response.json()
        },
        getUserInfo: async (accessToken: string) => {
          const response = await fetch("https://api.notion.com/v1/users/me", {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Notion-Version": "2022-06-28",
            },
          })
          return response.json()
        },
      }
    default:
      throw new Error(`Unsupported provider: ${provider}`)
  }
}

function getGoogleScopes(provider: string): string[] {
  const baseScopes = [
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
  ]

  switch (provider) {
    case "gmail":
      return [
        ...baseScopes,
        "https://www.googleapis.com/auth/gmail.send",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/gmail.readonly",
      ]
    case "google-drive":
      return [...baseScopes, "https://www.googleapis.com/auth/drive", "https://www.googleapis.com/auth/drive.file"]
    case "google-calendar":
      return [
        ...baseScopes,
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/calendar.events",
      ]
    case "google-sheets":
      return [...baseScopes, "https://www.googleapis.com/auth/spreadsheets"]
    case "google-docs":
      return [...baseScopes, "https://www.googleapis.com/auth/documents", "https://www.googleapis.com/auth/drive.file"]
    case "youtube":
      return [
        ...baseScopes,
        "https://www.googleapis.com/auth/youtube.readonly",
        "https://www.googleapis.com/auth/youtube.upload",
      ]
    default:
      return baseScopes
  }
}

export * from "./oauthUtils"
export * from "./utils"
