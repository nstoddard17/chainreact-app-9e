import { type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { TikTokOAuthService } from "@/lib/oauth/tiktok"
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

    // Handle OAuth errors
    if (error) {
      return new Response(
        `
        <html>
          <body>
            <h1>Authentication Error</h1>
            <p>${errorDescription || error}</p>
            <script>
              window.location.href = "/integrations?error=oauth_error&provider=tiktok&message=${encodeURIComponent(
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
              window.location.href = "/integrations?error=missing_params&provider=tiktok"
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
    validateOAuthState(stateData, "tiktok")

    // Process the OAuth callback
    const result = await TikTokOAuthService.handleCallback(
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
            <p>Your TikTok account has been successfully connected.</p>
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
    console.error("TikTok callback error:", error)
    return new Response(
      `
      <html>
        <body>
          <h1>Unexpected Error</h1>
          <p>${error.message || "An unexpected error occurred"}</p>
          <script>
            window.location.href = "/integrations?error=unexpected&provider=tiktok&message=${encodeURIComponent(
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
