import { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { GoogleOAuthService } from "@/lib/oauth/google"
import { parseOAuthState, validateOAuthState } from "@/lib/oauth/utils"

export async function GET(request: NextRequest) {
  try {
    // Validate environment variables
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL")
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY")
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const searchParams = request.nextUrl.searchParams
    const error = searchParams.get("error")
    const code = searchParams.get("code")
    const state = searchParams.get("state")

    // Handle OAuth errors
    if (error) {
      return new Response(
        `
        <html>
          <body>
            <h1>Authentication Failed</h1>
            <p>Error: ${error}</p>
            <p>Please try again or contact support if the problem persists.</p>
          </body>
        </html>
        `,
        {
          status: 400,
          headers: {
            "Content-Type": "text/html",
          },
        }
      )
    }

    // Validate required parameters
    if (!code || !state) {
      return new Response(
        `
        <html>
          <body>
            <h1>Authentication Failed</h1>
            <p>Missing required parameters. Please try again.</p>
          </body>
        </html>
        `,
        {
          status: 400,
          headers: {
            "Content-Type": "text/html",
          },
        }
      )
    }

    // Parse and validate state
    const stateData = parseOAuthState(state)
    validateOAuthState(stateData, "google")

    // Process OAuth callback
    const result = await GoogleOAuthService.handleCallback(
      code,
      state,
      supabase,
      stateData.userId,
      request.headers.get("origin") || request.nextUrl.origin
    )

    if (!result.success) {
      return new Response(
        `
        <html>
          <body>
            <h1>Authentication Failed</h1>
            <p>Error: ${result.error}</p>
            <p>Please try again or contact support if the problem persists.</p>
          </body>
        </html>
        `,
        {
          status: 400,
          headers: {
            "Content-Type": "text/html",
          },
        }
      )
    }

    return new Response(
      `
      <html>
        <body>
          <h1>Authentication Successful</h1>
          <p>Your Google account has been successfully connected.</p>
          <p>You can close this window and return to the application.</p>
        </body>
      </html>
      `,
      {
        status: 200,
        headers: {
          "Content-Type": "text/html",
        },
      }
    )
  } catch (error: any) {
    console.error("Google OAuth callback error:", error)
    return new Response(
      `
      <html>
        <body>
          <h1>Authentication Failed</h1>
          <p>An unexpected error occurred: ${error.message}</p>
          <p>Please try again or contact support if the problem persists.</p>
        </body>
      </html>
      `,
      {
        status: 500,
        headers: {
          "Content-Type": "text/html",
        },
      }
    )
  }
} 