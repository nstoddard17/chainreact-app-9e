import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { createPopupResponse } from "@/lib/utils/createPopupResponse"
import { encrypt } from "@/lib/security/encryption"


export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const error = url.searchParams.get("error")
  const baseUrl = getBaseUrl()

  if (error) {
    console.error(`Error with Mailchimp OAuth: ${error}`)
    return createPopupResponse("error", "mailchimp", `OAuth Error: ${error}`, baseUrl)
  }

  if (!code) {
    return createPopupResponse("error", "mailchimp", "No code provided for Mailchimp OAuth.", baseUrl)
  }

  if (!state) {
    return createPopupResponse("error", "mailchimp", "No state provided for Mailchimp OAuth.", baseUrl)
  }

  try {
    const { userId } = JSON.parse(atob(state))
    if (!userId) {
      return createPopupResponse("error", "mailchimp", "Missing userId in Mailchimp state.", baseUrl)
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

    // Fetch Mailchimp metadata to get the server prefix (dc)
    const metadataResponse = await fetch("https://login.mailchimp.com/oauth2/metadata", {
      headers: {
        Authorization: `OAuth ${tokenData.access_token}`,
      },
    })

    let metadata = {}
    if (metadataResponse.ok) {
      const metadataData = await metadataResponse.json()
      metadata = {
        dc: metadataData.dc, // Data center / server prefix
        accountname: metadataData.accountname,
        login_url: metadataData.login.login_url,
        api_endpoint: metadataData.api_endpoint,
      }
      console.log('✅ Mailchimp metadata fetched:', { dc: metadataData.dc, accountname: metadataData.accountname })
    } else {
      console.error('Failed to fetch Mailchimp metadata:', await metadataResponse.text())
    }

    // Mailchimp tokens don't expire in the traditional way, they are permanent until revoked.
    // expires_in is not part of the standard response.
    const expiresAt = null

    // Encrypt tokens before storing
    const encryptionKey = process.env.ENCRYPTION_KEY
    if (!encryptionKey) {
      console.error('❌ [Mailchimp] Encryption key not configured')
      return createPopupResponse('error', 'mailchimp', 'Encryption key not configured', baseUrl)
    }

    const integrationData = {
      user_id: userId,
      provider: 'mailchimp',
      access_token: encrypt(tokenData.access_token, encryptionKey),
      refresh_token: null,
      scopes: ['campaigns', 'audience', 'automation', 'root'],
      status: 'connected',
      expires_at: null,
      metadata,
      updated_at: new Date().toISOString(),
    }

    const supabase = createAdminClient()

    const { error: dbError } = await supabase.from("integrations").upsert(integrationData, {
      onConflict: 'user_id, provider',
    })

    if (dbError) {
      console.error("Error saving Mailchimp integration to DB:", dbError)
      return createPopupResponse(
        "error",
        "mailchimp",
        `Database Error: ${dbError.message}`,
        baseUrl,
      )
    }

    console.log('✅ [Mailchimp] Integration successfully saved with status: connected')

    return createPopupResponse("success", "mailchimp", "Mailchimp account connected successfully.", baseUrl)
  } catch (error) {
    console.error("Error during Mailchimp OAuth callback:", error)
    const message = error instanceof Error ? error.message : "An unexpected error occurred"
    return createPopupResponse("error", "mailchimp", message, baseUrl)
  }
}
