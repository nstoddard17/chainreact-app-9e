import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { db } from "@/lib/db"
import { trelloIntegrationTable } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function getTrelloIntegration(userId: string) {
  try {
    const trelloIntegration = await db
      .select()
      .from(trelloIntegrationTable)
      .where(eq(trelloIntegrationTable.userId, userId))
    return trelloIntegration[0]
  } catch (error: any) {
    console.error("Error getting Trello integration:", error)
    return null
  }
}

export async function createTrelloIntegration(userId: string, accessToken: string, refreshToken: string) {
  try {
    await db.insert(trelloIntegrationTable).values({
      userId: userId,
      accessToken: accessToken,
      refreshToken: refreshToken,
    })
    return { success: true }
  } catch (error: any) {
    console.error("Error creating Trello integration:", error)
    return { success: false, error: error.message }
  }
}

export async function updateTrelloIntegration(userId: string, accessToken: string, refreshToken: string) {
  try {
    await db
      .update(trelloIntegrationTable)
      .set({ accessToken: accessToken, refreshToken: refreshToken })
      .where(eq(trelloIntegrationTable.userId, userId))
    return { success: true }
  } catch (error: any) {
    console.error("Error updating Trello integration:", error)
    return { success: false, error: error.message }
  }
}

export async function deleteTrelloIntegration(userId: string) {
  try {
    await db.delete(trelloIntegrationTable).where(eq(trelloIntegrationTable.userId, userId))
    return { success: true }
  } catch (error: any) {
    console.error("Error deleting Trello integration:", error)
    return { success: false, error: error.message }
  }
}

export class TrelloOAuthService {
  private static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID
    const clientSecret = process.env.TRELLO_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Missing Trello OAuth configuration")
    }

    return { clientId, clientSecret }
  }

  static getRedirectUri(): string {
    return `${getBaseUrl()}/api/integrations/trello/callback`
  }

  static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string, userId?: string): string {
    const { clientId } = this.getClientCredentials()
    const redirectUri = this.getRedirectUri()

    const state = btoa(
      JSON.stringify({
        provider: "trello",
        userId,
        reconnect,
        integrationId,
        timestamp: Date.now(),
      }),
    )

    // Trello uses a different OAuth flow than standard OAuth 2.0
    // It requires the API key as 'key' parameter, not 'client_id'
    const params = new URLSearchParams({
      key: clientId,
      return_url: redirectUri,
      scope: "read,write",
      expiration: "never",
      name: "ChainReact",
      response_type: "token",
      state: state,
    })

    // Use the correct Trello authorization endpoint
    return `https://trello.com/1/authorize?${params.toString()}`
  }

  static async handleCallback(
    code: string,
    state: string,
    supabase: any,
    userId: string,
  ): Promise<{ success: boolean; redirectUrl: string; error?: string }> {
    try {
      const stateData = JSON.parse(atob(state))
      const { provider, reconnect, integrationId } = stateData

      if (provider !== "trello") {
        throw new Error("Invalid provider in state")
      }

      // For Trello OAuth 1.0a, the 'code' parameter is actually the token
      const accessToken = code

      // Get user info from Trello
      const userResponse = await fetch(
        `https://api.trello.com/1/members/me?key=${process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID}&token=${accessToken}`,
      )

      if (!userResponse.ok) {
        throw new Error(`Failed to get user info: ${userResponse.statusText}`)
      }

      const userData = await userResponse.json()

      const integrationData = {
        user_id: userId,
        provider: "trello",
        provider_user_id: userData.id,
        access_token: accessToken,
        status: "connected" as const,
        scopes: ["read", "write"],
        metadata: {
          username: userData.username,
          full_name: userData.fullName,
          connected_at: new Date().toISOString(),
        },
      }

      if (reconnect && integrationId) {
        const { error } = await supabase
          .from("integrations")
          .update({
            ...integrationData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", integrationId)

        if (error) throw error
      } else {
        const { error } = await supabase.from("integrations").insert(integrationData)
        if (error) throw error
      }

      return {
        success: true,
        redirectUrl: `${getBaseUrl()}/integrations?success=trello_connected`,
      }
    } catch (error: any) {
      console.error("Trello OAuth callback error:", error)
      return {
        success: false,
        redirectUrl: `${getBaseUrl()}/integrations?error=callback_failed&provider=trello&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}
