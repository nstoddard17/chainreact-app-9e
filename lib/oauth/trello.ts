import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

interface TrelloOAuthResult {
  success: boolean
  redirectUrl: string
  error?: string
}

export class TrelloOAuthService {
  private static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID

    if (!clientId) {
      throw new Error("Missing Trello OAuth configuration")
    }

    return { clientId }
  }

  static async handleCallback(token: string, state: string, baseUrl: string): Promise<TrelloOAuthResult> {
    try {
      const stateData = JSON.parse(atob(state))
      const { provider, reconnect, integrationId } = stateData

      if (provider !== "trello") {
        throw new Error("Invalid provider in state")
      }

      const { clientId } = this.getClientCredentials()

      const userResponse = await fetch(`https://api.trello.com/1/members/me?key=${clientId}&token=${token}`)

      if (!userResponse.ok) {
        const errorText = await userResponse.text()
        throw new Error(`Failed to get user info: ${userResponse.status}`)
      }

      const userData = await userResponse.json()

      const supabase = createServerComponentClient({ cookies })
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

      if (sessionError || !sessionData?.session) {
        throw new Error("No active user session found")
      }

      const integrationData = {
        user_id: sessionData.session.user.id,
        provider: "trello",
        provider_user_id: userData.id,
        access_token: token,
        status: "connected" as const,
        scopes: ["read", "write"],
        metadata: {
          user_name: userData.fullName,
          username: userData.username,
          user_email: userData.email,
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
        redirectUrl: `${baseUrl}/integrations?success=trello_connected`,
      }
    } catch (error: any) {
      return {
        success: false,
        redirectUrl: `${baseUrl}/integrations?error=callback_failed&provider=trello&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}
