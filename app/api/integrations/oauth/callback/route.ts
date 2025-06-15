import { type NextRequest, NextResponse } from "next/server"
import { handleCallback } from "@/lib/oauth/oauthUtils"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const provider = searchParams.get("provider")
    const error = searchParams.get("error")
    const errorDescription = searchParams.get("error_description")

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin

    if (error) {
      console.error(`OAuth error for ${provider}:`, error, errorDescription)
      const errorMessage = errorDescription || error
      return NextResponse.redirect(
        new URL(`/integrations?error=${encodeURIComponent(errorMessage)}&provider=${provider}`, baseUrl),
      )
    }

    if (!code || !state) {
      return NextResponse.redirect(new URL(`/integrations?error=missing_parameters&provider=${provider}`, baseUrl))
    }

    let actualProvider = provider
    let returnUrl = "/integrations"

    if (!actualProvider && state) {
      try {
        const stateData = JSON.parse(Buffer.from(state, "base64").toString())
        actualProvider = stateData.provider
        returnUrl = stateData.returnUrl || "/integrations"
      } catch (e) {
        console.error("Failed to parse state:", e)
      }
    }

    if (!actualProvider) {
      return NextResponse.redirect(new URL(`/integrations?error=missing_provider`, baseUrl))
    }

    try {
      const result = await handleCallback(actualProvider, code, state)

      if (result.success) {
        const successUrl = new URL(returnUrl, baseUrl)
        successUrl.searchParams.set("success", actualProvider)
        successUrl.searchParams.set("provider", actualProvider)
        successUrl.searchParams.set("t", Date.now().toString())

        return NextResponse.redirect(successUrl)
      } else {
        const errorUrl = new URL(returnUrl, baseUrl)
        errorUrl.searchParams.set("error", encodeURIComponent(result.error || "Connection failed"))
        errorUrl.searchParams.set("provider", actualProvider)

        return NextResponse.redirect(errorUrl)
      }
    } catch (error: any) {
      console.error(`OAuth callback error for ${actualProvider}:`, error)
      const errorUrl = new URL(returnUrl, baseUrl)
      errorUrl.searchParams.set("error", encodeURIComponent(error.message || "Connection failed"))
      errorUrl.searchParams.set("provider", actualProvider)

      return NextResponse.redirect(errorUrl)
    }
  } catch (error: any) {
    console.error("OAuth callback error:", error)
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin
    return NextResponse.redirect(new URL(`/integrations?error=callback_failed`, baseUrl))
  }
}
