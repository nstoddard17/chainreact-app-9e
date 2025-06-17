import { type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { GoogleDriveOAuthService } from "@/lib/oauth/google-drive"
import { parseOAuthState, validateOAuthState } from "@/lib/oauth/utils"

// Validate environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Missing Supabase environment variables")
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
      console.error("Google Drive OAuth error:", error, errorDescription)
      return new Response(
        `
        <html>
          <body>
            <h1>Authentication Failed</h1>
            <p>Error: ${error}</p>
            <p>Description: ${errorDescription || "No description provided"}</p>
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
    validateOAuthState(stateData, "google-drive")

    // Process OAuth callback
    const result = await GoogleDriveOAuthService.handleCallback(
      code,
      state,
      supabase,
      stateData.userId,
      request.nextUrl.origin
    )

    if (!result.success) {
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

    // Return success response
    return new Response(
      `
      <html>
        <body>
          <h1>Successfully Connected!</h1>
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
  } catch (error: any) {
    console.error("Google Drive callback error:", error)
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
