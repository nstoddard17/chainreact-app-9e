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

  // Define required scopes for Shopify
  static getRequiredScopes() {
    return [
      "read_products",
      "write_products",
      "read_orders",
      "write_orders",
      "read_customers",
      "write_customers",
      "read_inventory",
      "write_inventory",
    ]
  }

  // Validate scopes against required scopes
  static validateScopes(grantedScopes: string[]): { valid: boolean; missing: string[] } {
    const requiredScopes = this.getRequiredScopes()
    const missing = requiredScopes.filter((scope) => !grantedScopes.includes(scope))
    return {
      valid: missing.length === 0,
      missing,
    }
  }

  // Validate token by making an API call
  static async validateToken(accessToken: string, shop: string): Promise<boolean> {
    try {
      const response = await fetch(`https://${shop}/admin/api/2023-10/shop.json`, {
        headers: {
          "X-Shopify-Access-Token": accessToken,
        },
      })
      return response.ok
    } catch (error) {
      console.error("Shopify token validation error:", error)
      return false
    }
  }

  static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string): string {
    const { clientId } = this.getClientCredentials()
    const redirectUri = "https://chainreact.app/api/integrations/shopify/callback"

    const scopes = [
      "read_products",
      "write_products",
      "read_orders",
      "write_orders",
      "read_customers",
      "write_customers",
      "read_inventory",
      "write_inventory",
    ]

    const state = btoa(
      JSON.stringify({
        provider: "shopify",
        reconnect,
        integrationId,
        timestamp: Date.now(),
      }),
    )

    // Note: Shopify requires shop domain, this is a simplified version
    // In practice, you'd need to collect the shop domain first
    const params = new URLSearchParams({
      client_id: clientId,
      scope: scopes.join(","),
      redirect_uri: redirectUri,
      state,
    })

    // This would need to be customized per shop
    return `https://SHOP_DOMAIN.myshopify.com/admin/oauth/authorize?${params.toString()}`
  }

  static getRedirectUri(baseUrl: string): string {
    return "https://chainreact.app/api/integrations/shopify/callback"
  }

  static async handleCallback(code: string, state: string, shop: string, baseUrl: string): Promise<ShopifyOAuthResult> {
    try {
      const stateData = JSON.parse(atob(state))
      const { provider, reconnect, integrationId } = stateData

      if (provider !== "shopify") {
        throw new Error("Invalid provider in state")
      }

      const { clientId, clientSecret } = this.getClientCredentials()

      // Clear any existing tokens before requesting new ones
      if (reconnect && integrationId) {
        const supabase = createServerComponentClient({ cookies })
        const { error: clearError } = await supabase
          .from("integrations")
          .update({
            access_token: null,
            refresh_token: null,
            status: "reconnecting",
          })
          .eq("id", integrationId)

        if (clearError) {
          console.error("Error clearing existing tokens:", clearError)
        }
      }

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

      // Get granted scopes from the token data
      const grantedScopes = scope ? scope.split(",") : []

      // Validate scopes
      const scopeValidation = this.validateScopes(grantedScopes)

      if (!scopeValidation.valid) {
        return {
          success: false,
          redirectUrl: `${baseUrl}/integrations?error=insufficient_scopes&provider=shopify&missing=${scopeValidation.missing.join(",")}`,
        }
      }

      // Validate token by making an API call
      const isTokenValid = await this.validateToken(access_token, shop)
      if (!isTokenValid) {
        return {
          success: false,
          redirectUrl: `${baseUrl}/integrations?error=invalid_token&provider=shopify`,
        }
      }

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
        scopes: grantedScopes,
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
