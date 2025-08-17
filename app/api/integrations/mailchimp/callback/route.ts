import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { createPopupResponse } from "@/lib/utils/createPopupResponse"


export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const error = url.searchParams.get("error")
  const baseUrl = getBaseUrl()

  if (error) {
    console.error(`Error with Mailchimp OAuth: ${error}`)
    return createPopupResponse("error", "Mailchimp", `OAuth Error: ${error}`, baseUrl)
  }

  if (!code) {
    return createPopupResponse("error", "Mailchimp", "No code provided for Mailchimp OAuth.", baseUrl)
  }

  if (!state) {
    return createPopupResponse("error", "Mailchimp", "No state provided for Mailchimp OAuth.", baseUrl)
  }

  try {
    const { userId } = JSON.parse(atob(state))
    if (!userId) {
      return createPopupResponse("error", "Mailchimp", "Missing userId in Mailchimp state.", baseUrl)
    }

    const response = await fetch("https://login.mailchimp.com/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: process.env.MAILCHIMP_CLIENT_ID!,
        client_secret: process.env.MAILCHIMP_CLIENT_SECRET!,
        redirect_uri: `${baseUrl}/api/integrations/mailchimp/callback`,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error("Failed to exchange Mailchimp code for token:", errorData)
      return createPopupResponse(
        "error",
        "Mailchimp",
        "Failed to get Mailchimp access token.",
        baseUrl,
      )
    }

    const tokenData = await response.json()

    // Mailchimp tokens don't expire in the traditional way, they are permanent until revoked.
    // expires_in is not part of the standard response.
    const expiresAt = null

    const integrationData = {
      user_id: userId,
      provider: 'mailchimp',
      access_token: tokenData.access_token,
      refresh_token: null,
      scopes: ['campaigns', 'audience', 'automation', 'root'],
      status: 'connected',
      expires_at: null,
      updated_at: new Date().toISOString(),
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { error: dbError } = await supabase.from("integrations").upsert(integrationData, {
      onConflict: 'user_id, provider',
    })

    if (dbError) {
      console.error("Error saving Mailchimp integration to DB:", dbError)
      return createPopupResponse(
        "error",
        "Mailchimp",
        `Database Error: ${dbError.message}`,
        baseUrl,
      )
    }

    return createPopupResponse("success", "Mailchimp", "Mailchimp account connected successfully.", baseUrl)
  } catch (error) {
    console.error("Error during Mailchimp OAuth callback:", error)
    const message = error instanceof Error ? error.message : "An unexpected error occurred"
    return createPopupResponse("error", "Mailchimp", message, baseUrl)
  }
}
