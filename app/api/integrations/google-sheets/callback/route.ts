import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// Use direct Supabase client with service role for reliable database operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined")
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
  },
})

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const baseUrl = new URL(request.url).origin
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("Google Sheets OAuth callback:", { code: !!code, state, error })

  if (error) {
    console.error("Google Sheets OAuth error:", error)
    return new NextResponse(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Google Sheets Authentication Failed</title>
        </head>
        <body>
          <h1>Google Sheets Authentication Failed</h1>
          <p>An error occurred during the Google Sheets authentication process.</p>
          <script>
            window.opener.postMessage({ type: 'oauth-error', error: '${error}' }, window.location.origin);
            window.close();
          </script>
        </body>
      </html>
    `,
      {
        status: 200,
        headers: {
          "Content-Type": "text/html",
        },
      },
    )
  }

  if (!code || !state) {
    console.error("Missing code or state in Google Sheets callback")
    return new NextResponse(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Google Sheets Authentication Failed</title>
        </head>
        <body>
          <h1>Google Sheets Authentication Failed</h1>
          <p>Missing parameters during the Google Sheets authentication process.</p>
          <script>
            window.opener.postMessage({ type: 'oauth-error', error: 'missing_params' }, window.location.origin);
            window.close();
          </script>
        </body>
      </html>
    `,
      {
        status: 200,
        headers: {
          "Content-Type": "text/html",
        },
      },
    )
  }

  try {
    // Parse state to get user ID
    let stateData
    try {
      stateData = JSON.parse(atob(state))
    } catch (e) {
      console.error("Failed to parse state:", e)
      return new NextResponse(
        `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Google Sheets Authentication Failed</title>
          </head>
          <body>
            <h1>Google Sheets Authentication Failed</h1>
            <p>Invalid state during the Google Sheets authentication process.</p>
            <script>
              window.opener.postMessage({ type: 'oauth-error', error: 'invalid_state' }, window.location.origin);
              window.close();
            </script>
          </body>
        </html>
      `,
        {
          status: 200,
          headers: {
            "Content-Type": "text/html",
          },
        },
      )
    }

    const userId = stateData.userId

    if (!userId) {
      console.error("No user ID in state")
      return new NextResponse(
        `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Google Sheets Authentication Failed</title>
          </head>
          <body>
            <h1>Google Sheets Authentication Failed</h1>
            <p>Missing user ID during the Google Sheets authentication process.</p>
            <script>
              window.opener.postMessage({ type: 'oauth-error', error: 'missing_user_id' }, window.location.origin);
              window.close();
            </script>
          </body>
        </html>
      `,
        {
          status: 200,
          headers: {
            "Content-Type": "text/html",
          },
        },
      )
    }

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      console.error("Missing Google client ID or secret")
      return new NextResponse(
        `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Google Sheets Authentication Failed</title>
          </head>
          <body>
            <h1>Google Sheets Authentication Failed</h1>
            <p>Missing client credentials during the Google Sheets authentication process.</p>
            <script>
              window.opener.postMessage({ type: 'oauth-error', error: 'missing_client_credentials' }, window.location.origin);
              window.close();
            </script>
          </body>
        </html>
      `,
        {
          status: 200,
          headers: {
            "Content-Type": "text/html",
          },
        },
      )
    }

    // Exchange code for token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${getBaseUrl(request)}/api/integrations/google-sheets/callback`,
      }),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error("Google Sheets token exchange failed:", errorText)
      return new NextResponse(
        `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Google Sheets Authentication Failed</title>
          </head>
          <body>
            <h1>Google Sheets Authentication Failed</h1>
            <p>Token exchange failed during the Google Sheets authentication process.</p>
            <script>
              window.opener.postMessage({ type: 'oauth-error', error: 'token_exchange_failed', message: '${errorText}' }, window.location.origin);
              window.close();
            </script>
          </body>
        </html>
      `,
        {
          status: 200,
          headers: {
            "Content-Type": "text/html",
          },
        },
      )
    }

    const tokenData = await tokenResponse.json()
    const { access_token, refresh_token, expires_in } = tokenData

    // Get user info from Google
    const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    })

    if (!userResponse.ok) {
      console.error("Failed to get Google user info:", await userResponse.text())
      return new NextResponse(
        `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Google Sheets Authentication Failed</title>
          </head>
          <body>
            <h1>Google Sheets Authentication Failed</h1>
            <p>Failed to get user info during the Google Sheets authentication process.</p>
            <script>
              window.opener.postMessage({ type: 'oauth-error', error: 'user_info_failed' }, window.location.origin);
              window.close();
            </script>
          </body>
        </html>
      `,
        {
          status: 200,
          headers: {
            "Content-Type": "text/html",
          },
        },
      )
    }

    const userData = await userResponse.json()

    const now = new Date().toISOString()

    // Check if integration exists
    const { data: existingIntegration } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "google-sheets")
      .maybeSingle()

    const integrationData = {
      user_id: userId,
      provider: "google-sheets",
      provider_user_id: userData.id,
      access_token,
      refresh_token,
      expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
      status: "connected",
      scopes: tokenData.scope ? tokenData.scope.split(" ") : [],
      metadata: {
        email: userData.email,
        name: userData.name,
        picture: userData.picture,
        verified_email: userData.verified_email,
        connected_at: now,
      },
      updated_at: now,
    }

    if (existingIntegration) {
      const { error } = await supabase.from("integrations").update(integrationData).eq("id", existingIntegration.id)

      if (error) {
        console.error("Error updating Google Sheets integration:", error)
        return new NextResponse(
          `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Google Sheets Authentication Failed</title>
            </head>
            <body>
              <h1>Google Sheets Authentication Failed</h1>
              <p>Database update failed during the Google Sheets authentication process.</p>
              <script>
                window.opener.postMessage({ type: 'oauth-error', error: 'database_update_failed' }, window.location.origin);
                window.close();
              </script>
            </body>
          </html>
        `,
          {
            status: 200,
            headers: {
              "Content-Type": "text/html",
            },
          },
        )
      }
    } else {
      const { error } = await supabase.from("integrations").insert({
        ...integrationData,
        created_at: now,
      })

      if (error) {
        console.error("Error inserting Google Sheets integration:", error)
        return new NextResponse(
          `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Google Sheets Authentication Failed</title>
            </head>
            <body>
              <h1>Google Sheets Authentication Failed</h1>
              <p>Database insert failed during the Google Sheets authentication process.</p>
              <script>
                window.opener.postMessage({ type: 'oauth-error', error: 'database_insert_failed' }, window.location.origin);
                window.close();
              </script>
            </body>
          </html>
        `,
          {
            status: 200,
            headers: {
              "Content-Type": "text/html",
            },
          },
        )
      }
    }

    // Add a delay to ensure database operations complete
    await new Promise((resolve) => setTimeout(resolve, 500))

    return new NextResponse(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Google Sheets Authentication Successful</title>
        </head>
        <body>
          <h1>Google Sheets Authentication Successful</h1>
          <p>Google Sheets has been successfully authenticated.</p>
          <script>
            // Send success message to parent window
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth-success',
                provider: 'google-sheets'
              }, window.location.origin);
            }
            
            // Close the popup
            setTimeout(() => {
              window.close();
            }, 1500);
          </script>
        </body>
      </html>
    `,
      {
        status: 200,
        headers: {
          "Content-Type": "text/html",
        },
      },
    )
  } catch (error: any) {
    console.error("Google Sheets OAuth callback error:", error)
    return new NextResponse(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Google Sheets Authentication Failed</title>
        </head>
        <body>
          <h1>Google Sheets Authentication Failed</h1>
          <p>An unexpected error occurred during the Google Sheets authentication process.</p>
          <script>
            window.opener.postMessage({ type: 'oauth-error', error: 'callback_failed', message: '${error.message}' }, window.location.origin);
            window.close();
          </script>
        </body>
      </html>
    `,
      {
        status: 200,
        headers: {
          "Content-Type": "text/html",
        },
      },
    )
  }
}
