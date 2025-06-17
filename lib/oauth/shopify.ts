import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { getOAuthRedirectUri, generateOAuthState, parseOAuthState, validateOAuthState, OAuthScopes } from "./utils"
import { createClient, SupabaseClient } from "@supabase/supabase-js"

interface ShopifyOAuthState {
  userId: string
  provider: string
  timestamp: number
  shop?: string
  reconnect?: boolean
  integrationId?: string
}

export class ShopifyOAuthService {
  static clientId = process.env.NEXT_PUBLIC_SHOPIFY_CLIENT_ID
  static clientSecret = process.env.SHOPIFY_CLIENT_SECRET
  static apiUrl = "https://myshopify.com/admin/oauth"

  private static getClientCredentials() {
    if (!this.clientId || !this.clientSecret) {
      throw new Error("Missing Shopify OAuth configuration")
    }
    return { clientId: this.clientId, clientSecret: this.clientSecret }
  }

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

  static validateScopes(grantedScopes: string[]): { valid: boolean; missing: string[] } {
    const requiredScopes = this.getRequiredScopes()
    const missing = requiredScopes.filter((scope) => !grantedScopes.includes(scope))
    return {
      valid: missing.length === 0,
      missing,
    }
  }

  static async validateToken(accessToken: string, shop: string): Promise<{ valid: boolean; grantedScopes: string[]; error?: string }> {
    try {
      const response = await fetch(`https://${shop}.myshopify.com/admin/api/2022-10/shop.json`, {
        headers: {
          "X-Shopify-Access-Token": accessToken,
        },
      })

      if (!response.ok) {
        const error = await response.text()
        return {
          valid: false,
          grantedScopes: [],
          error: `Failed to validate token: ${error}`,
        }
      }

      // Get scopes from token info
      const tokenInfoResponse = await fetch(`https://${shop}.myshopify.com/admin/oauth/access_scopes.json`, {
        headers: {
          "X-Shopify-Access-Token": accessToken,
        },
      })

      if (!tokenInfoResponse.ok) {
        return {
          valid: true, // If we can access shop info, token is valid
          grantedScopes: [],
        }
      }

      const tokenInfo = await tokenInfoResponse.json()
      const grantedScopes = tokenInfo.access_scopes || []

      return {
        valid: true,
        grantedScopes,
      }
    } catch (error: any) {
      console.error("Shopify token validation error:", error)
      return {
        valid: false,
        grantedScopes: [],
        error: error.message,
      }
    }
  }

  static generateAuthUrl(baseUrl: string, reconnect = false, integrationId?: string, userId?: string, shop?: string): string {
    const { clientId } = this.getClientCredentials()
    if (!shop) {
      throw new Error("Missing shop parameter for Shopify OAuth")
    }

    const state = generateOAuthState(userId || "", "shopify")
    const redirectUri = getOAuthRedirectUri(baseUrl, "shopify")

    const params = new URLSearchParams({
      client_id: clientId,
      scope: OAuthScopes.SHOPIFY.join(","),
      redirect_uri: redirectUri,
      state,
      grant_options: "per-user",
    })

    return `https://${shop}.myshopify.com/admin/oauth/authorize?${params.toString()}`
  }

  static async handleCallback(
    code: string,
    state: string,
    supabase: SupabaseClient,
    userId: string
  ): Promise<{ success: boolean; error?: string; redirectUrl?: string }> {
    try {
      const { clientId, clientSecret } = this.getClientCredentials()

      // Parse and validate state
      const stateData = parseOAuthState(state) as ShopifyOAuthState
      validateOAuthState(stateData, "shopify")

      const shop = stateData.shop
      if (!shop) {
        throw new Error("Missing shop parameter in state")
      }

      const redirectUri = getOAuthRedirectUri(getBaseUrl(), "shopify")

      // Exchange code for token
      const tokenResponse = await fetch(`https://${shop}.myshopify.com/admin/oauth/access_token`, {
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
        const error = await tokenResponse.text()
        throw new Error(`Failed to exchange code for token: ${error}`)
      }

      const tokenData = await tokenResponse.json()

      // Validate token and get scopes
      const tokenValidation = await this.validateToken(tokenData.access_token, shop)
      if (!tokenValidation.valid) {
        throw new Error(`Invalid token: ${tokenValidation.error}`)
      }

      // Validate scopes
      const scopeValidation = this.validateScopes(tokenValidation.grantedScopes)
      if (!scopeValidation.valid) {
        throw new Error(`Missing required scopes: ${scopeValidation.missing.join(", ")}`)
      }

      // Get shop info
      const shopResponse = await fetch(`https://${shop}.myshopify.com/admin/api/2022-10/shop.json`, {
        headers: {
          "X-Shopify-Access-Token": tokenData.access_token,
        },
      })

      if (!shopResponse.ok) {
        const error = await shopResponse.text()
        throw new Error(`Failed to get shop info: ${error}`)
      }

      const shopData = await shopResponse.json()

      // Check if integration exists
      const { data: existingIntegration } = await supabase
        .from("integrations")
        .select("id")
        .eq("user_id", userId)
        .eq("provider", "shopify")
        .maybeSingle()

      const now = new Date().toISOString()
      const integrationData = {
        user_id: userId,
        provider: "shopify",
        provider_user_id: shopData.shop.id,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_type: tokenData.token_type,
        expires_at: tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
          : null,
        scopes: tokenValidation.grantedScopes,
        metadata: {
          email: shopData.shop.email,
          name: shopData.shop.name,
          picture: shopData.shop.picture,
          provider: "shopify",
          shop_id: shopData.shop.id,
          shop_name: shopData.shop.name,
          shop_domain: shopData.shop.domain,
          shop_plan: shopData.shop.plan_name,
          token_validation_error: tokenValidation.error,
          scope_validation: scopeValidation
        },
        status: "connected",
        is_active: true,
        consecutive_failures: 0,
        last_token_refresh: new Date().toISOString(),
        last_refreshed_at: new Date().toISOString(),
        last_used_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      if (existingIntegration) {
        const { error } = await supabase
          .from("integrations")
          .update(integrationData)
          .eq("id", existingIntegration.id)

        if (error) throw error
      } else {
        const { error } = await supabase.from("integrations").insert({
          ...integrationData,
          created_at: now,
        })

        if (error) throw error
      }

      return {
        success: true,
        redirectUrl: `${getBaseUrl()}/integrations?success=shopify_connected`,
      }
    } catch (error: any) {
      console.error("Shopify OAuth callback error:", error)
      return {
        success: false,
        error: error.message,
        redirectUrl: `${getBaseUrl()}/integrations?error=callback_failed&provider=shopify&message=${encodeURIComponent(
          error.message
        )}`,
      }
    }
  }
}
