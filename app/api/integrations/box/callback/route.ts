import { type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { BoxOAuthService } from "@/lib/oauth/box"
import { parseOAuthState, validateOAuthState } from "@/lib/oauth/utils"

const boxClientId = process.env.NEXT_PUBLIC_BOX_CLIENT_ID
const boxClientSecret = process.env.BOX_CLIENT_SECRET
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!boxClientId || !boxClientSecret || !supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing required environment variables")
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")
    const errorDescription = searchParams.get("error_description")

    if (error) {
      return new Response(
        `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Box OAuth Error</title>
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
      return new Response(
        `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Box OAuth Error</title>
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
    const stateData = parseOAuthState(state)
    validateOAuthState(stateData, "box")

    const userId = stateData.userId
    if (!userId) {
      throw new Error("Missing user ID in state")
    }

    const result = await BoxOAuthService.handleCallback(code, state, supabase, userId)

    if (!result.success) {
      return new Response(
        `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Box OAuth Error</title>
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
              <p>${result.error || "Failed to connect Box"}</p>
            </div>
          </body>
        </html>
        `,
        {
          headers: { "Content-Type": "text/html" },
        }
      )
    }

    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Box Connected</title>
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
            h1 { color: #2ecc71; }
            p { color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Successfully Connected!</h1>
            <p>You can now close this window and return to the app.</p>
          </div>
        </body>
      </html>
      `,
      {
        headers: { "Content-Type": "text/html" },
      }
    )
  } catch (error: any) {
    console.error("Box callback error:", error)
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Box OAuth Error</title>
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
            <h1>Error</h1>
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