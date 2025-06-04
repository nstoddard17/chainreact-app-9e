import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

interface ShopifyOAuthResult {
  success: boolean
  redirectUrl: string
  error?: string
}

export class ShopifyOAuthService {
  private static getClientCredentials() {
    const clientId = process.env.NEXT_PUBLIC_SHOPIFY_CLIENT_ID
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Missing Shopify OAuth configuration")
    }

    return { clientId, clientSecret }
  }

  static async handleCallback(code: string, state: string, shop: string, baseUrl: string): Promise<ShopifyOAuthResult> {
    try {
      const stateData = JSON.parse(atob(state))
      const { provider, reconnect, integrationId } = stateData

      if (provider !== "shopify") {
        throw new Error("Invalid provider in state")
      }

      const { clientId, clientSecret } = this.getClientCredentials()

      const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
        }),
      })

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text()
        throw new Error(`Token exchange failed: ${errorData}`)
      }

      const tokenData = await tokenResponse.json()
      const { access_token, scope } = tokenData

      const shopResponse = await fetch(`https://${shop}/admin/api/2023-10/shop.json`, {
        headers: {
          "X-Shopify-Access-Token": access_token,
        },
      })

      if (!shopResponse.ok) {
        const errorData = await shopResponse.text()
        throw new Error(`Failed to get shop info: ${errorData}`)
      }

      const shopData = await shopResponse.json()
      const shopInfo = shopData.shop

      const supabase = createServerComponentClient({ cookies })
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

      if (sessionError || !sessionData?.session) {
        throw new Error("No active user session found")
      }

      const integrationData = {
        user_id: sessionData.session.user.id,
        provider: "shopify",
        provider_user_id: shopInfo.id.toString(),
        access_token,
        status: "connected" as const,
        scopes: scope.split(","),
        metadata: {
          shop_domain: shop,
          shop_name: shopInfo.name,
          shop_email: shopInfo.email,
          shop_owner: shopInfo.shop_owner,
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
        redirectUrl: `${baseUrl}/integrations?success=shopify_connected`,
      }
    } catch (error: any) {
      return {
        success: false,
        redirectUrl: `${baseUrl}/integrations?error=callback_failed&provider=shopify&message=${encodeURIComponent(error.message)}`,
        error: error.message,
      }
    }
  }
}
