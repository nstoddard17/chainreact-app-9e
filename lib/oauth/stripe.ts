export class StripeOAuthService {
  private static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_STRIPE_CLIENT_ID
    const clientSecret = process.env.STRIPE_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Missing Stripe OAuth configuration")
    }

    return { clientId, clientSecret }
  }

  static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string, userId?: string): string {
    const { clientId } = this.getClientCredentials()
    const redirectUri = "https://chainreact.app/api/integrations/stripe/callback"

    const state = btoa(
      JSON.stringify({
        provider: "stripe",
        userId,
        reconnect,
        integrationId,
        timestamp: Date.now(),
      }),
    )

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      scope: "read_write",
      redirect_uri: redirectUri,
      state,
    })

    return `https://connect.stripe.com/oauth/authorize?${params.toString()}`
  }

  static getRedirectUri(): string {
    return "https://chainreact.app/api/integrations/stripe/callback"
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

      if (provider !== "stripe") {
        throw new Error("Invalid provider in state")
      }

      const { clientId, clientSecret } = this.getClientCredentials()

      const tokenResponse = await fetch("https://connect.stripe.com/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_secret: clientSecret,
          code,
          grant_type: "authorization_code",
        }),
      })

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text()
        throw new Error(`Token exchange failed: ${errorData}`)
      }

      const tokenData = await tokenResponse.json()
      const { access_token, stripe_user_id, stripe_publishable_key } = tokenData

      const integrationData = {
        user_id: userId,
        provider: "stripe",
        provider_user_id: stripe_user_id,
        access_token,
        status: "connected" as const,
        scopes: ["read_write"],
        metadata: {
          stripe_user_id,
          stripe_publishable_key,
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
        redirectUrl: `https://chainreact.app/integrations?success=stripe_connected`,
      }
    } catch (error: any) {
      return {
        success: false,
        redirectUrl: `https://chainreact.app/integrations?error=callback_failed&provider=stripe&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}
