import { type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { GoogleCalendarOAuthService } from "@/lib/oauth/google-calendar"
import { parseOAuthState, validateOAuthState } from "@/lib/oauth/utils"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing required environment variables")
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

export async function GET(request: NextRequest) {
  try {
    // Get URL parameters
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")
    const errorDescription = searchParams.get("error_description")

    if (error) {
      console.error("OAuth error:", error, errorDescription)
      return new Response(
        `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Google Calendar OAuth Error</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
                margin: 0;
                background-color: #f5f5f5;
              }
              .container {
                background: white;
                padding: 2rem;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                text-align: center;
                max-width: 400px;
              }
              h1 { color: #e74c3c; }
              p { color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Authentication Error</h1>
              <p>${errorDescription || error}</p>
            </div>
          </body>
        </html>
        `,
        {
          headers: { "Content-Type": "text/html" },
        }
      )
    }

    if (!code || !state) {
      console.error("Missing parameters:", { code, state })
      return new Response(
        `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Google Calendar OAuth Error</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
                margin: 0;
                background-color: #f5f5f5;
              }
              .container {
                background: white;
                padding: 2rem;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                text-align: center;
                max-width: 400px;
              }
              h1 { color: #e74c3c; }
              p { color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Invalid Request</h1>
              <p>Missing required parameters</p>
            </div>
          </body>
        </html>
        `,
        {
          headers: { "Content-Type": "text/html" },
        }
      )
    }

    // Parse and validate state
    let parsedState
    try {
      parsedState = parseOAuthState(state)
    } catch (error: any) {
      console.error("Invalid state parameter:", state, error)
      return new Response(
        `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Google Calendar OAuth Error</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
                margin: 0;
                background-color: #f5f5f5;
              }
              .container {
                background: white;
                padding: 2rem;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                text-align: center;
                max-width: 400px;
              }
              h1 { color: #e74c3c; }
              p { color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Invalid State</h1>
              <p>Invalid or expired state parameter</p>
            </div>
          </body>
        </html>
        `,
        {
          headers: { "Content-Type": "text/html" },
        }
      )
    }

    const { provider, userId, origin } = parsedState
    if (provider !== "google") {
      console.error("Invalid provider in state:", provider)
      return new Response(
        `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Google Calendar OAuth Error</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
                margin: 0;
                background-color: #f5f5f5;
              }
              .container {
                background: white;
                padding: 2rem;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                text-align: center;
                max-width: 400px;
              }
              h1 { color: #e74c3c; }
              p { color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Invalid Provider</h1>
              <p>Invalid provider in state parameter</p>
            </div>
          </body>
        </html>
        `,
        {
          headers: { "Content-Type": "text/html" },
        }
      )
    }

    // Handle the OAuth callback
    const result = await GoogleCalendarOAuthService.handleCallback(
      code,
      parsedState,
      supabase,
      userId,
      origin || "https://chainreact.app"
    )

    if (!result.success) {
      console.error("Callback handling failed:", result.error)
      return new Response(
        `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Google Calendar OAuth Error</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                min-height: 100vh;
                margin: 0;
                background-color: #f5f5f5;
              }
              .container {
                background: white;
                padding: 2rem;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                text-align: center;
                max-width: 400px;
              }
              h1 { color: #e74c3c; }
              p { color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Connection Failed</h1>
              <p>${result.error || "Failed to connect Google Calendar"}</p>
            </div>
          </body>
        </html>
        `,
        {
          headers: { "Content-Type": "text/html" },
        }
      )
    }

    // Redirect to success page
    return Response.redirect(`${origin || "https://chainreact.app"}/integrations?success=true`)
  } catch (error: any) {
    console.error("Error in Google Calendar callback:", error)
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Google Calendar OAuth Error</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
              background-color: #f5f5f5;
            }
            .container {
              background: white;
              padding: 2rem;
              border-radius: 8px;
              box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
              text-align: center;
              max-width: 400px;
            }
            h1 { color: #e74c3c; }
            p { color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Connection Error</h1>
            <p>${error.message || "An unexpected error occurred"}</p>
          </div>
        </body>
      </html>
      `,
      {
        headers: { "Content-Type": "text/html" },
      }
    )
  }
}
