import { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { MailchimpOAuthService } from "@/lib/oauth/mailchimp"
import { parseOAuthState, validateOAuthState } from "@/lib/oauth/utils"

export async function GET(request: NextRequest) {
  try {
    // Validate environment variables
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing required environment variables")
    }

    // Initialize Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    // Get URL parameters
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")
    const errorDescription = searchParams.get("error_description")

    // Handle OAuth errors
    if (error) {
      return new Response(
        `
        <html>
          <body>
            <h1>Authentication Error</h1>
            <p>${errorDescription || error}</p>
            <script>
              window.location.href = "/integrations?error=oauth_error&provider=mailchimp&message=${encodeURIComponent(
                errorDescription || error
              )}"
            </script>
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
            <h1>Missing Parameters</h1>
            <p>Required parameters are missing from the request.</p>
            <script>
              window.location.href = "/integrations?error=missing_params&provider=mailchimp"
            </script>
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
    validateOAuthState(stateData, "mailchimp")

    // Process the OAuth callback
    const result = await MailchimpOAuthService.handleCallback(
      code,
      state,
      supabase,
      stateData.userId
    )

    if (result.success) {
      return new Response(
        `
        <html>
          <body>
            <h1>Success!</h1>
            <p>Your Mailchimp account has been successfully connected.</p>
            <script>
              window.location.href = "${result.redirectUrl}"
            </script>
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
    } else {
      return new Response(
        `
        <html>
          <body>
            <h1>Error</h1>
            <p>${result.error || "An unexpected error occurred"}</p>
            <script>
              window.location.href = "${result.redirectUrl}"
            </script>
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
  } catch (error: any) {
    console.error("Mailchimp callback error:", error)
    return new Response(
      `
      <html>
        <body>
          <h1>Unexpected Error</h1>
          <p>${error.message || "An unexpected error occurred"}</p>
          <script>
            window.location.href = "/integrations?error=unexpected&provider=mailchimp&message=${encodeURIComponent(
              error.message || "An unexpected error occurred"
            )}"
          </script>
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
