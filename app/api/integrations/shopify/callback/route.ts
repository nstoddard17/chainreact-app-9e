import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseClient } from "@/lib/supabase"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const shop = searchParams.get("shop")
  const error = searchParams.get("error")

  console.log("Shopify OAuth callback:", { code: !!code, state, shop, error })

  if (error) {
    console.error("Shopify OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_error", request.url))
  }

  if (!code || !state || !shop) {
    console.error("Missing code, state, or shop in Shopify callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params", request.url))
  }

  try {
    // Decode state to get provider info
    const stateData = JSON.parse(atob(state))
    const { provider, reconnect, integrationId } = stateData

    if (provider !== "shopify") {
      throw new Error("Invalid provider in state")
    }

    // Exchange code for access token
    const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.NEXT_PUBLIC_SHOPIFY_CLIENT_ID,
        client_secret: process.env.SHOPIFY_CLIENT_SECRET,
        code,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      console.error("Shopify token exchange failed:", errorData)
      throw new Error("Failed to exchange code for token")
    }

    const tokenData = await tokenResponse.json()
    const { access_token, scope } = tokenData

    // Get shop info
    const shopResponse = await fetch(`https://${shop}/admin/api/2023-10/shop.json`, {
      headers: {
        "X-Shopify-Access-Token": access_token,
      },
    })

    if (!shopResponse.ok) {
      throw new Error("Failed to get shop info")
    }

    const shopData = await shopResponse.json()
    const shopInfo = shopData.shop

    // Store integration in Supabase
    const supabase = getSupabaseClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      throw new Error("No session found")
    }

    const integrationData = {
      user_id: session.user.id,
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
      // Update existing integration
      const { error } = await supabase
        .from("integrations")
        .update({
          ...integrationData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", integrationId)

      if (error) throw error
    } else {
      // Create new integration
      const { error } = await supabase.from("integrations").insert(integrationData)
      if (error) throw error
    }

    console.log("Shopify integration saved successfully")
    return NextResponse.redirect(new URL("/integrations?success=shopify_connected", request.url))
  } catch (error: any) {
    console.error("Shopify OAuth callback error:", error)
    return NextResponse.redirect(new URL("/integrations?error=callback_failed", request.url))
  }
}
