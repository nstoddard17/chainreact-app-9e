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

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const integrationData = {
      user_id: userId,
      provider: 'shopify',
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      scopes: tokenData.scope.split(' '),
      status: 'connected',
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      updated_at: new Date().toISOString(),
      metadata: {
        shop: shop,
      },
    }

    const { error: upsertError } = await supabase.from('integrations').upsert(integrationData, {
      onConflict: 'user_id, provider',
    })

    if (upsertError) {
      logger.error("Error saving Shopify integration to DB:", upsertError)
      return createPopupResponse(
        "error",
        "shopify",
        `Database Error: ${upsertError.message}`,
        baseUrl,
      )
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
