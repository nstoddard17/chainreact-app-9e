import { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { LinkedInOAuthService } from "@/lib/oauth/linkedin"
import { parseOAuthState, validateOAuthState } from "@/lib/oauth/utils"

// Get environment variables
const linkedinClientId = process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_ID
const linkedinClientSecret = process.env.LINKEDIN_CLIENT_SECRET
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

// Validate environment variables
if (!linkedinClientId || !linkedinClientSecret) {
  throw new Error("Missing LinkedIn OAuth configuration")
}

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Missing Supabase configuration")
}

// Create Supabase client
const supabase = createClient(supabaseUrl, supabaseServiceKey)

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")
    const errorDescription = searchParams.get("error_description")

    // Handle OAuth errors
    if (error) {
      return new Response(
        `
        <!DOCTYPE html>
        <html>
          <head>
            <title>LinkedIn Connection Error</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                margin: 0;
                background-color: #f5f5f5;
              }
              .container {
                text-align: center;
                padding: 2rem;
                background: white;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                max-width: 400px;
              }
              h1 { color: #e74c3c; }
              p { color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Connection Failed</h1>
              <p>${errorDescription || "An error occurred while connecting to LinkedIn."}</p>
            </div>
          </body>
        </html>
        `,
        {
          headers: { "Content-Type": "text/html" },
          status: 400,
        }
      )
    }

    // Validate required parameters
    if (!code || !state) {
      return new Response(
        `
        <!DOCTYPE html>
        <html>
          <head>
            <title>LinkedIn Connection Error</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                margin: 0;
                background-color: #f5f5f5;
              }
              .container {
                text-align: center;
                padding: 2rem;
                background: white;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                max-width: 400px;
              }
              h1 { color: #e74c3c; }
              p { color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Invalid Request</h1>
              <p>Missing required parameters. Please try connecting again.</p>
            </div>
          </body>
        </html>
        `,
        {
          headers: { "Content-Type": "text/html" },
          status: 400,
        }
      )
    }

    // Parse and validate state
    const stateData = parseOAuthState(state)
    validateOAuthState(stateData, "linkedin")

    // Process the OAuth callback
    const result = await LinkedInOAuthService.handleCallback(
      code,
      state,
      supabase,
      stateData.userId
    )

    if (!result.success) {
      return new Response(
        `
        <!DOCTYPE html>
        <html>
          <head>
            <title>LinkedIn Connection Error</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
                margin: 0;
                background-color: #f5f5f5;
              }
              .container {
                text-align: center;
                padding: 2rem;
                background: white;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                max-width: 400px;
              }
              h1 { color: #e74c3c; }
              p { color: #666; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Connection Failed</h1>
              <p>${result.error || "An error occurred while connecting to LinkedIn."}</p>
            </div>
          </body>
        </html>
        `,
        {
          headers: { "Content-Type": "text/html" },
          status: 400,
        }
      )
    }

    // Return success response
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>LinkedIn Connected</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background-color: #f5f5f5;
            }
            .container {
              text-align: center;
              padding: 2rem;
              background: white;
              border-radius: 8px;
              box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
              max-width: 400px;
            }
            h1 { color: #2ecc71; }
            p { color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Successfully Connected!</h1>
            <p>Your LinkedIn account has been connected successfully.</p>
          </div>
        </body>
      </html>
      `,
      {
        headers: { "Content-Type": "text/html" },
        status: 200,
      }
    )
  } catch (error: any) {
    console.error("LinkedIn callback error:", error)
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>LinkedIn Connection Error</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background-color: #f5f5f5;
            }
            .container {
              text-align: center;
              padding: 2rem;
              background: white;
              border-radius: 8px;
              box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
              max-width: 400px;
            }
            h1 { color: #e74c3c; }
            p { color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Connection Error</h1>
            <p>${error.message || "An unexpected error occurred."}</p>
          </div>
        </body>
      </html>
      `,
      {
        headers: { "Content-Type": "text/html" },
        status: 500,
      }
    )
  }
}
