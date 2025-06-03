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
    return NextResponse.redirect(new URL("/integrations?error=oauth_error&provider=shopify", request.url))
  }

  if (!code || !state || !shop) {
    console.error("Missing code, state, or shop in Shopify callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=shopify", request.url))
  }

  try {
    // Decode state to get provider info
    const stateData = JSON.parse(atob(state))
    const { provider, reconnect, integrationId } = stateData

    console.log("Decoded state data:", stateData)

    if (provider !== "shopify") {
      throw new Error("Invalid provider in state")
    }

    // Exchange code for access token
    console.log("Exchanging code for access token...")
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
      throw new Error(`Failed to exchange code for token: ${errorData}`)
    }

    const tokenData = await tokenResponse.json()
    console.log("Token exchange successful:", { hasAccessToken: !!tokenData.access_token })
    const { access_token, scope } = tokenData

    // Get shop info
    console.log("Fetching shop info from Shopify...")
    const shopResponse = await fetch(`https://${shop}/admin/api/2023-10/shop.json`, {
      headers: {
        "X-Shopify-Access-Token": access_token,
      },
    })

    if (!shopResponse.ok) {
      const errorData = await shopResponse.text()
      console.error("Failed to get shop info from Shopify:", errorData)
      throw new Error(`Failed to get shop info: ${errorData}`)
    }

    const shopData = await shopResponse.json()
    const shopInfo = shopData.shop
    console.log("Shop info fetched successfully:", { shopId: shopInfo.id })

    // Store integration in Supabase with robust session handling
    const supabase = getSupabaseClient()

    // Try multiple methods to get session
    let session = null
    try {
      const {
        data: { session: cookieSession },
      } = await supabase.auth.getSession()
      session = cookieSession
      console.log("Session from cookies:", !!session)
    } catch (error) {
      console.log("Failed to get session from cookies:", error)
    }

    // If no session from cookies, try authorization headers
    if (!session) {
      try {
        const authHeader = request.headers.get("authorization")
        if (authHeader?.startsWith("Bearer ")) {
          const token = authHeader.substring(7)
          const {
            data: { user },
          } = await supabase.auth.getUser(token)
          if (user) {
            session = { user }
            console.log("Session from auth header:", !!session)
          }
        }
      } catch (error) {
        console.log("Failed to get session from headers:", error)
      }
    }

    // For reconnection scenarios, try to find user from existing integration
    if (!session && reconnect && integrationId) {
      try {
        const { data: existingIntegration } = await supabase
          .from("integrations")
          .select("user_id")
          .eq("id", integrationId)
          .single()

        if (existingIntegration) {
          session = { user: { id: existingIntegration.user_id } }
          console.log("Session from existing integration:", !!session)
        }
      } catch (error) {
        console.log("Failed to get user from existing integration:", error)
      }
    }

    if (!session) {
      console.error("No session found after all attempts")
      return NextResponse.redirect(new URL("/integrations?error=no_session&provider=shopify", request.url))
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

    console.log("Saving integration to database...", {
      userId: session.user.id,
      provider: "shopify",
      reconnect,
      integrationId,
    })

    if (reconnect && integrationId) {
      // Update existing integration
      const { error } = await supabase
        .from("integrations")
        .update({
          ...integrationData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", integrationId)

      if (error) {
        console.error("Error updating integration:", error)
        throw error
      }
      console.log("Integration updated successfully")
    } else {
      // Create new integration
      const { error } = await supabase.from("integrations").insert(integrationData)
      if (error) {
        console.error("Error inserting integration:", error)
        throw error
      }
      console.log("Integration created successfully")
    }

    console.log("Shopify integration saved successfully")
    return NextResponse.redirect(new URL("/integrations?success=shopify_connected", request.url))
  } catch (error: any) {
    console.error("Shopify OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=shopify&message=${encodeURIComponent(error.message)}`,
        request.url,
      ),
    )
  }
}
