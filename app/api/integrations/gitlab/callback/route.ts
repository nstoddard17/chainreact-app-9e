import { type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { GitLabOAuthService } from "@/lib/oauth/gitlab"
import { parseOAuthState, validateOAuthState } from "@/lib/oauth/utils"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
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

    // Handle OAuth errors
    if (error) {
      console.error("GitLab OAuth error:", error, errorDescription)
      return new Response(
        `
        <html>
          <body>
            <h1>Authentication Failed</h1>
            <p>Error: ${error}</p>
            ${errorDescription ? `<p>Description: ${errorDescription}</p>` : ""}
            <script>
              window.close();
            </script>
          </body>
        </html>
      `,
        {
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
            <p>Missing required parameters</p>
            <script>
              window.close();
            </script>
          </body>
        </html>
      `,
        {
          headers: {
            "Content-Type": "text/html",
          },
        }
      )
    }

    // Parse and validate state
    const stateData = parseOAuthState(state)
    validateOAuthState(stateData, "gitlab")

    // Process OAuth callback
    const result = await GitLabOAuthService.handleCallback(
      code,
      state,
      supabase,
      stateData.userId,
      request.nextUrl.origin
    )

    if (result.success) {
      return new Response(
        `
        <html>
          <body>
            <h1>Successfully Connected to GitLab</h1>
            <p>You can close this window and return to the app.</p>
            <script>
              window.close();
            </script>
          </body>
        </html>
      `,
        {
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
            <h1>Authentication Failed</h1>
            <p>Error: ${result.error}</p>
            <script>
              window.close();
            </script>
          </body>
        </html>
      `,
        {
          headers: {
            "Content-Type": "text/html",
          },
        }
      )
    }
  } catch (error: any) {
    console.error("GitLab callback error:", error)
    return new Response(
      `
      <html>
        <body>
          <h1>Authentication Failed</h1>
          <p>Error: ${error.message}</p>
          <script>
            window.close();
          </script>
        </body>
      </html>
    `,
      {
        headers: {
          "Content-Type": "text/html",
        },
      }
    )
  }
}
