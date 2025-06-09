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
    // UPDATED: Redirect to our client-side handler instead of server callback
    return `${getBaseUrl()}/integrations/trello-auth`
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
    const params = new URLSearchParams({
      key: clientId,
      return_url: redirectUri,
      scope: "read,write",
      expiration: "never",
      name: "ChainReact",
      response_type: "token",
      state: state,
    })

    return `https://trello.com/1/authorize?${params.toString()}`
  }
}
