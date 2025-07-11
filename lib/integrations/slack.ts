import { WebClient, CodedError } from "@slack/web-api"
import { createClient } from "@supabase/supabase-js"
import { getIntegrationCredentials } from "@/lib/integrations/getDecryptedAccessToken";
import { createSupabaseServerClient } from "@/utils/supabase/server";

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
  } catch (error: unknown) {
    throw new Error("Failed to get Slack user info")
  }
}

export async function testSlackConnection(accessToken: string) {
  const client = new WebClient(accessToken)

  try {
    const response = await client.auth.test()
    return { success: true, data: response }
  } catch (error: unknown) {
    let message = "An unknown error occurred"
    if (error instanceof Error) {
      message = error.message
    }
    return { success: false, error: message }
  }
}

export async function getSlackChannels(accessToken: string) {
  const client = new WebClient(accessToken)

  try {
    const response = await client.conversations.list({
      types: "public_channel,private_channel",
    })
    return response.channels || []
  } catch (error: unknown) {
    throw new Error("Failed to get Slack channels")
  }
}

export async function sendSlackMessage(
  accessToken: string,
  channel: string,
  text: string,
) {
  const client = new WebClient(accessToken)

  try {
    const response = await client.chat.postMessage({
      channel,
      text,
    })
    return response
  } catch (error: unknown) {
    throw new Error("Failed to send Slack message")
  }
}

export class SlackService {
  private slackClient: WebClient
  private supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  constructor(accessToken: string) {
    this.slackClient = new WebClient(accessToken)
  }

  async sendChannelMessage(params: { channel: string; text: string }): Promise<any> {
    const { channel, text } = params

    if (!channel || !text) {
      throw new Error("Missing required parameters: channel and text are required.")
    }

    try {
      const result = await this.slackClient.chat.postMessage({
        channel,
        text,
      })
      return result
    } catch (error: unknown) {
      console.error("Error sending Slack message:", error)

      let errorMessage = "An unknown error occurred."

      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        "data" in error &&
        typeof (error as any).code === "string"
      ) {
        const codedError = error as { code: string; data: { error?: string } }
        errorMessage = `Slack API Error (${codedError.code}): ${
          codedError.data?.error || "No additional details"
        }`
      } else if (error instanceof Error) {
        errorMessage = error.message
      }

      throw new Error(`Failed to send message to Slack channel ${channel}: ${errorMessage}`)
    }
  }

  static async refreshToken(userId: string, integrationId: string): Promise<string | null> {
    // Slack's standard OAuth tokens (xoxp) do not expire, so a refresh flow is not typically needed.
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { data: integration, error } = await supabase
      .from("integrations")
      .select("access_token")
      .eq("id", integrationId)
      .eq("user_id", userId)
      .single()

    if (error || !integration) {
      console.error(`Failed to retrieve Slack integration for user ${userId}:`, error)
      return null
    }

    return integration.access_token
  }
}

/**
 * Fetches the Slack workspace plan from Slack API and updates provider_plan in the integrations table.
 * @param userId The user ID who owns the integration
 * @param teamId The Slack workspace/team ID
 */
export async function updateSlackProviderPlan(userId: string, teamId: string) {
  const credentials = await getIntegrationCredentials(userId, "slack");
  if (!credentials?.accessToken) return;

  // Fetch plan from Slack API
  const response = await fetch("https://slack.com/api/team.info", {
    headers: {
      Authorization: `Bearer ${credentials.accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });
  const data = await response.json();
  if (!data.ok) return;

  const plan = data.team?.plan || "free";

  // Update the integration record
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("integrations")
    .update({ provider_plan: plan })
    .eq("provider", "slack")
    .eq("team_id", teamId);
}
