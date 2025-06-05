import { WebClient } from "@slack/web-api"

export interface SlackOAuthClient {
  getAuthUrl: (scopes: string[], state?: string) => string
  exchangeCodeForToken: (code: string) => Promise<any>
  refreshToken: (refreshToken: string) => Promise<any>
  revokeToken: (token: string) => Promise<void>
}

export function getSlackOAuthClient(): SlackOAuthClient {
  const clientId = process.env.NEXT_PUBLIC_SLACK_CLIENT_ID!
  const clientSecret = process.env.SLACK_CLIENT_SECRET!
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/slack/callback`

  return {
    getAuthUrl: (scopes: string[], state?: string) => {
      const params = new URLSearchParams({
        client_id: clientId,
        scope: scopes.join(","),
        redirect_uri: redirectUri,
        response_type: "code",
        ...(state && { state }),
      })

      return `https://slack.com/oauth/v2/authorize?${params.toString()}`
    },

    exchangeCodeForToken: async (code: string) => {
      const response = await fetch("https://slack.com/api/oauth.v2.access", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
        }),
      })

      const data = await response.json()

      if (!data.ok) {
        throw new Error(data.error || "Failed to exchange code for token")
      }

      return data
    },

    refreshToken: async (refreshToken: string) => {
      const response = await fetch("https://slack.com/api/oauth.v2.access", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      })

      const data = await response.json()

      if (!data.ok) {
        throw new Error(data.error || "Failed to refresh token")
      }

      return data
    },

    revokeToken: async (token: string) => {
      const client = new WebClient(token)
      await client.auth.revoke()
    },
  }
}

export async function getSlackUserInfo(accessToken: string) {
  const client = new WebClient(accessToken)

  try {
    const response = await client.auth.test()
    return response
  } catch (error) {
    throw new Error("Failed to get Slack user info")
  }
}

export async function testSlackConnection(accessToken: string) {
  const client = new WebClient(accessToken)

  try {
    const response = await client.auth.test()
    return { success: true, data: response }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

export async function getSlackChannels(accessToken: string) {
  const client = new WebClient(accessToken)

  try {
    const response = await client.conversations.list({
      types: "public_channel,private_channel",
    })
    return response.channels || []
  } catch (error) {
    throw new Error("Failed to get Slack channels")
  }
}

export async function sendSlackMessage(accessToken: string, channel: string, text: string) {
  const client = new WebClient(accessToken)

  try {
    const response = await client.chat.postMessage({
      channel,
      text,
    })
    return response
  } catch (error) {
    throw new Error("Failed to send Slack message")
  }
}
