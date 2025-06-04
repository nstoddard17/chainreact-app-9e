interface NotionOAuthResult {
  success: boolean
  redirectUrl: string
  error?: string
}

export class NotionOAuthService {
  private static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_NOTION_CLIENT_ID
    const clientSecret = process.env.NOTION_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Missing Notion OAuth configuration")
    }

    return { clientId, clientSecret }
  }

  static async handleCallback(
    code: string,
    state: string,
    baseUrl: string,
    supabase: any,
    userId: string,
  ): Promise<NotionOAuthResult> {
    try {
      const stateData = JSON.parse(atob(state))
      const { provider, reconnect, integrationId } = stateData

      if (provider !== "notion") {
        throw new Error("Invalid provider in state")
      }

      const { clientId, clientSecret } = this.getClientCredentials()

      const tokenResponse = await fetch("https://api.notion.com/v1/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(clientId + ":" + clientSecret).toString("base64")}`,
        },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code,
          redirect_uri: "https://chainreact.app/api/integrations/notion/callback",
        }),
      })

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text()
        throw new Error(`Token exchange failed: ${errorData}`)
      }

      const tokenData = await tokenResponse.json()
      const { access_token, workspace_name, workspace_id, bot_id } = tokenData

      const integrationData = {
        user_id: userId,
        provider: "notion",
        provider_user_id: bot_id,
        access_token,
        status: "connected" as const,
        scopes: ["read", "write"],
        metadata: {
          workspace_name,
          workspace_id,
          bot_id,
          connected_at: new Date().toISOString(),
        },
      }

      if (reconnect && integrationId) {
        const { error: updateError } = await supabase
          .from("integrations")
          .update({
            ...integrationData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", integrationId)

        if (updateError) throw updateError
      } else {
        const { error: insertError } = await supabase.from("integrations").insert(integrationData)
        if (insertError) throw insertError
      }

      return {
        success: true,
        redirectUrl: `${baseUrl}/integrations?success=notion_connected`,
      }
    } catch (error: any) {
      return {
        success: false,
        redirectUrl: `${baseUrl}/integrations?error=callback_failed&provider=notion&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}
