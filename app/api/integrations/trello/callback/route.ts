import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing Supabase URL or service role key")
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get("token")
  const state = searchParams.get("state")
  const error = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")

  const baseUrl = getBaseUrl()

  if (error) {
    console.error(`Trello OAuth error: ${error} - ${errorDescription}`)
    const errorHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Trello Connection Failed</title>
            <style>
              body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; text-align: center; }
              .container { max-width: 500px; padding: 20px; border: 1px solid #ccc; border-radius: 8px; }
              h1 { color: #dc3545; }
              p { color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Trello Connection Failed</h1>
              <p>${errorDescription || "An unknown error occurred."}</p>
              <p>Please try again or contact support if the problem persists.</p>
              <script>
                if (window.opener) {
                  window.opener.postMessage({
                    type: 'oauth-error',
                    provider: 'trello',
                    error: '${error}',
                    errorDescription: '${errorDescription || "An unknown error occurred."}'
                  }, '${baseUrl}');
                  setTimeout(() => window.close(), 1000);
                }
              </script>
            </div>
          </body>
        </html>
      `
    return new Response(errorHtml, {
      headers: { "Content-Type": "text/html" },
      status: 400,
    })
  }

  if (!token || !state) {
    console.error("Missing token or state in Trello callback")
    const errorHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Trello Connection Failed</title>
             <style>
              body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; text-align: center; }
              .container { max-width: 500px; padding: 20px; border: 1px solid #ccc; border-radius: 8px; }
              h1 { color: #dc3545; }
              p { color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Trello Connection Failed</h1>
              <p>Authorization token or state parameter is missing.</p>
              <p>Please try again or contact support if the problem persists.</p>
               <script>
                if (window.opener) {
                  window.opener.postMessage({
                    type: 'oauth-error',
                    provider: 'trello',
                    error: 'Missing token or state'
                  }, '${baseUrl}');
                  setTimeout(() => window.close(), 1000);
                }
              </script>
            </div>
          </body>
        </html>
      `
    return new Response(errorHtml, {
      headers: { "Content-Type": "text/html" },
      status: 400,
    })
  }

  try {
    const stateData = JSON.parse(atob(state))
    const { userId } = stateData

    if (!userId) {
      console.error("Missing userId in Trello state")
      // Handle error: show an error page and inform the user
      return new Response("User ID is missing from state", { status: 400 })
    }

    // Trello gives the access token directly, no code exchange needed.
    const accessToken = token

    // Get user info
    const userResponse = await fetch(`https://api.trello.com/1/members/me?key=${process.env.NEXT_PUBLIC_TRELLO_API_KEY}&token=${accessToken}`)


    if (!userResponse.ok) {
      throw new Error("Failed to get Trello user info")
    }

    const userData = await userResponse.json()

    const integrationData = {
      user_id: userId,
      provider: "trello",
      provider_user_id: userData.id,
      access_token: accessToken,
      refresh_token: null, // Trello doesn't provide a refresh token in this flow
      expires_at: null, // Trello tokens don't expire unless manually revoked
      scopes: [], // Trello doesn't provide scopes in this flow
      status: "connected",
      updated_at: new Date().toISOString(),
    }

    const { error: upsertError } = await supabase.from("integrations").upsert(integrationData, {
      onConflict: "user_id, provider",
    })

    if (upsertError) {
      throw new Error(`Failed to save Trello integration: ${upsertError.message}`)
    }

    const successHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Trello Connection Successful</title>
           <style>
              body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; text-align: center; }
              .container { max-width: 500px; padding: 20px; border: 1px solid #ccc; border-radius: 8px; }
              h1 { color: #28a745; }
              p { color: #666; }
            </style>
        </head>
        <body>
          <div class="container">
            <h1>Trello Connection Successful</h1>
            <p>You can now close this window.</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'oauth-success', provider: 'trello' }, '${baseUrl}');
              setTimeout(() => window.close(), 1000);
            }
          </script>
        </body>
      </html>
    `

    return new Response(successHtml, {
      headers: { "Content-Type": "text/html" },
    })
  } catch (e: any) {
    console.error("Trello callback error:", e)
    const errorHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Trello Connection Failed</title>
            <style>
              body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; text-align: center; }
              .container { max-width: 500px; padding: 20px; border: 1px solid #ccc; border-radius: 8px; }
              h1 { color: #dc3545; }
              p { color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
               <h1>Trello Connection Failed</h1>
              <p>${e.message || "An unexpected error occurred."}</p>
               <p>Please try again or contact support if the problem persists.</p>
              <script>
                if (window.opener) {
                  window.opener.postMessage({
                    type: 'oauth-error',
                    provider: 'trello',
                    error: 'Callback processing failed',
                    errorDescription: '${e.message || "An unexpected error occurred."}'
                  }, '${baseUrl}');
                  setTimeout(() => window.close(), 1000);
                }
              </script>
            </div>
          </body>
        </html>
      `
    return new Response(errorHtml, {
      headers: { "Content-Type": "text/html" },
      status: 500,
    })
  }
}
