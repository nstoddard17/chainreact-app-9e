import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createPopupResponse } from "@/lib/utils/createPopupResponse"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { prepareIntegrationData } from "@/lib/integrations/tokenUtils"

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const error = url.searchParams.get("error")
  const errorDescription = url.searchParams.get("error_description")

  const baseUrl = getBaseUrl()
  const provider = "microsoft-outlook"

  if (error) {
    const message = errorDescription || error
    console.error(`Error with Microsoft Outlook OAuth: ${message}`)
    return createPopupResponse("error", provider, `OAuth Error: ${message}`, baseUrl)
  }

  if (!code || !state) {
    return createPopupResponse("error", provider, "No code or state provided for Microsoft Outlook OAuth.", baseUrl)
  }

  try {
    const { userId } = JSON.parse(atob(state))
    if (!userId) {
      throw new Error("Missing userId in Microsoft Outlook state")
    }

    const supabase = createAdminClient()

    const clientId = process.env.OUTLOOK_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID
    const clientSecret = process.env.OUTLOOK_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET
    const redirectUri = `${baseUrl}/api/integrations/microsoft-outlook/callback`

    if (!clientId || !clientSecret) {
      throw new Error("Microsoft client ID or secret not configured")
    }

    const tokenResponse = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        scope: "offline_access https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Calendars.Read https://graph.microsoft.com/Calendars.ReadWrite https://graph.microsoft.com/Contacts.Read https://graph.microsoft.com/Contacts.ReadWrite",
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json()
      throw new Error(`Microsoft token exchange failed: ${errorData.error_description}`)
    }

    const tokenData = await tokenResponse.json()
    
    // Check account type to warn about personal account limitations
    try {
      const userResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { 
          "Authorization": `Bearer ${tokenData.access_token}` 
        }
      })
      
      if (userResponse.ok) {
        const userData = await userResponse.json()
        const email = userData.mail || userData.userPrincipalName || ""
        
        // Check if this is a personal account
        const isPersonalAccount = !userData.userPrincipalName || 
                                 email.includes("outlook.com") ||
                                 email.includes("hotmail.com") ||
                                 email.includes("live.com") ||
                                 email.includes("gmail.com")
        
        if (isPersonalAccount) {
          console.warn("⚠️ Personal Microsoft account detected:", email)
          console.warn("   Outlook API may have limitations with personal accounts")
          console.warn("   Some features may not work as expected")
          
          // Store a warning flag in the integration metadata
          const metadata = {
            accountType: "personal",
            email: email,
            warning: "Some Outlook features may not work with personal Microsoft accounts. Consider using a work or school account for full functionality.",
            knownLimitation: true
          }
          
          tokenData._metadata = metadata
        } else {
          console.log("✅ Work/School account detected:", email)
          tokenData._metadata = {
            accountType: "work",
            email: email
          }
        }
      }
    } catch (checkError) {
      console.error("Could not check account type:", checkError)
    }

    // Calculate refresh token expiration (Microsoft default is 90 days)
    const refreshExpiresIn = tokenData.refresh_expires_in || 90 * 24 * 60 * 60 // 90 days in seconds
    const refreshTokenExpiresAt = new Date(Date.now() + refreshExpiresIn * 1000)

    // Prepare integration data with encrypted tokens
    const integrationData = await prepareIntegrationData(
      userId,
      provider,
      tokenData.access_token,
      tokenData.refresh_token,
      tokenData.scope ? tokenData.scope.split(" ") : [],
      tokenData.expires_in,
      refreshTokenExpiresAt,
    )
    
    // Add account type metadata if available
    if (tokenData._metadata) {
      integrationData.metadata = tokenData._metadata
    }

    const { error: upsertError } = await supabase.from("integrations").upsert(integrationData, {
      onConflict: "user_id, provider",
    })

    if (upsertError) {
      throw new Error(`Failed to save Microsoft Outlook integration: ${upsertError.message}`)
    }

    // Return a minimal response that immediately closes the popup
    const script = `
      <script>
        if (window.opener) {
          window.opener.postMessage({
            type: 'oauth-success',
            provider: 'microsoft-outlook',
            message: 'Connected successfully'
          }, '*');
        }
        window.close();
      </script>
    `
    return new Response(`<html><head><title>Success</title></head><body>${script}</body></html>`, {
      headers: { "Content-Type": "text/html" }
    })
  } catch (e: any) {
    console.error("Microsoft Outlook callback error:", e)
    return createPopupResponse("error", provider, e.message || "An unexpected error occurred.", baseUrl)
  }
}
