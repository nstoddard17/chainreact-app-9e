import { type NextRequest, NextResponse } from "next/server"
import { PayPalOAuthService } from "@/lib/oauth/paypal"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const baseUrl = new URL(request.url).origin
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("PayPal OAuth callback:", { code: !!code, state, error })

  if (error) {
    console.error("PayPal OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_error&provider=paypal", baseUrl))
  }

  if (!code || !state) {
    console.error("Missing code or state in PayPal callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=paypal", baseUrl))
  }

  try {
    const result = await PayPalOAuthService.handleCallback(code, state, baseUrl)

    console.log("PayPal OAuth result:", result.success ? "success" : "failed")
    return NextResponse.redirect(new URL(result.redirectUrl, baseUrl))
  } catch (error: any) {
    console.error("PayPal OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=paypal&message=${encodeURIComponent(error.message)}`,
        baseUrl,
      ),
    )
  }
}
