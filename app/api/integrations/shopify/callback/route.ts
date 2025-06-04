import { type NextRequest, NextResponse } from "next/server"
import { ShopifyOAuthService } from "@/lib/oauth/shopify"

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
    const baseUrl = new URL(request.url).origin
    const result = await ShopifyOAuthService.handleCallback(code, state, shop, baseUrl)

    console.log("Shopify OAuth result:", result.success ? "success" : "failed")
    return NextResponse.redirect(new URL(result.redirectUrl))
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
