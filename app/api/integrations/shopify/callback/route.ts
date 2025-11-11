import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { createPopupResponse } from "@/lib/utils/createPopupResponse"

import { logger } from '@/lib/utils/logger'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const shop = url.searchParams.get("shop")
  const error = url.searchParams.get("error")
  const baseUrl = getBaseUrl()

  if (error) {
    logger.error(`Error with Shopify OAuth: ${error}`)
    return createPopupResponse("error", "shopify", `OAuth Error: ${error}`, baseUrl)
  }

  if (!code || !shop) {
    return createPopupResponse(
      "error",
      "shopify",
      "Missing code or shop for Shopify OAuth.",
      baseUrl,
    )
  }

  if (!state) {
    return createPopupResponse("error", "shopify", "No state provided for Shopify OAuth.", baseUrl)
  }

  try {
    const { userId } = JSON.parse(atob(state))
    if (!userId) {
      return createPopupResponse("error", "shopify", "Missing userId in Shopify state.", baseUrl)
    }

    const tokenUrl = `https://${shop}/admin/oauth/access_token`
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_CLIENT_ID!,
        client_secret: process.env.SHOPIFY_CLIENT_SECRET!,
        code,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      logger.error("Failed to exchange Shopify code for token:", errorData)
      return createPopupResponse("error", "shopify", "Failed to get Shopify access token.", baseUrl)
    }

    const tokenData = await response.json()

    const expiresIn = tokenData.expires_in
    const expiresAt = expiresIn ? new Date(new Date().getTime() + expiresIn * 1000) : null

    // Fetch shop info including owner email
    // API VERIFICATION: Shopify Admin API endpoint for shop details
    // Docs: https://shopify.dev/docs/api/admin-rest/2024-01/resources/shop
    // Returns: email (shop owner), name, id, etc.
    const stores: Array<{ shop: string; name: string; id: string }> = []
    let shopOwnerEmail = null
    let shopName = null
    let shopId = null

    try {
      // Fetch the current shop info
      const shopResponse = await fetch(`https://${shop}/admin/api/2024-01/shop.json`, {
        headers: {
          'X-Shopify-Access-Token': tokenData.access_token
        }
      })

      if (shopResponse.ok) {
        const shopData = await shopResponse.json()
        const shopInfo = shopData.shop
        shopOwnerEmail = shopInfo?.email || null
        shopName = shopInfo?.name || shop
        shopId = shopInfo?.id?.toString() || shop

        stores.push({
          shop: shop,
          name: shopName,
          id: shopId
        })
      }

      // TODO: If Shopify Partner API is available, fetch all stores from organization
      // For now, we only store the current shop that was just connected
      // To connect multiple stores, user will need to run OAuth flow for each store

    } catch (error) {
      logger.error('Failed to fetch Shopify store info:', error)
      // If we can't fetch store info, at least store the shop domain
      stores.push({
        shop: shop,
        name: shop,
        id: shop
      })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // Check if integration already exists to merge stores
    const { data: existingIntegration } = await supabase
      .from('integrations')
      .select('metadata')
      .eq('user_id', userId)
      .eq('provider', 'shopify')
      .single()

    let allStores = stores
    if (existingIntegration?.metadata) {
      const existingMetadata = existingIntegration.metadata as any
      const existingStores = existingMetadata.stores || []

      // Merge stores, avoiding duplicates
      const storeMap = new Map(existingStores.map((s: any) => [s.shop, s]))
      stores.forEach(s => storeMap.set(s.shop, s))
      allStores = Array.from(storeMap.values())

      logger.debug(`Merged Shopify stores: ${allStores.length} total (${stores.length} new, ${existingStores.length} existing)`)
    }

    const integrationData = {
      user_id: userId,
      provider: 'shopify',
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      scopes: tokenData.scope.split(' '),
      status: 'connected',
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      updated_at: new Date().toISOString(),
      // Top-level account identity fields
      email: shopOwnerEmail,
      username: shop,
      account_name: shopName || shop,
      // Store all connected stores in metadata
      metadata: {
        stores: allStores, // Array of all connected stores (merged with existing)
        active_store: shop, // The store that was just connected
        shop_id: shopId,
      },
    }

    const { data: integration, error: upsertError } = await supabase
      .from('integrations')
      .upsert(integrationData, {
        onConflict: 'user_id, provider',
      })
      .select('id')
      .single()

    if (upsertError) {
      logger.error("Error saving Shopify integration to DB:", upsertError)
      return createPopupResponse(
        "error",
        "shopify",
        `Database Error: ${upsertError.message}`,
        baseUrl,
      )
    }

    // Grant admin permissions to the user who connected the integration
    if (integration?.id) {
      const { autoGrantPermissionsForIntegration } = await import('@/lib/services/integration-permissions')
      try {
        await autoGrantPermissionsForIntegration(integration.id, userId)
        logger.debug(`✅ Granted admin permissions for Shopify integration: ${integration.id}`)
      } catch (permError) {
        logger.error('Failed to grant permissions for Shopify integration:', permError)
        // Don't fail the whole flow - integration is connected, just permissions might be missing
      }
    }

    return createPopupResponse(
      "success",
      "shopify",
      "Shopify account connected successfully.",
      baseUrl,
    )
  } catch (error) {
    logger.error("Error during Shopify OAuth callback:", error)
    const message = error instanceof Error ? error.message : "An unexpected error occurred"
    return createPopupResponse("error", "shopify", message, baseUrl)
  }
}
