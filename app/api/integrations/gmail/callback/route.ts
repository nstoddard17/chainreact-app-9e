import { type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { GmailOAuthService } from "@/lib/oauth/gmail"
import { parseOAuthState, validateOAuthState } from "@/lib/oauth/utils"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing required environment variables")
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get("code")
    const state = searchParams.get("state")

    if (!code || !state) {
      return new Response("Missing code or state", { status: 400 })
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return new Response("Unauthorized", { status: 401 })
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
            <title>Gmail OAuth Error</title>
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

    validateOAuthState(parsedState, "google")

    const origin = request.headers.get("origin") || request.nextUrl.origin
    const result = await GmailOAuthService.handleCallback(
      code,
      parsedState,
      supabase,
      parsedState.userId,
      origin || "https://chainreact.app"
    )

    if (!result.success) {
      return new Response(result.error || "Failed to handle callback", { status: 500 })
    }

    return Response.redirect(`${origin}/integrations?success=true`)
  } catch (error: any) {
    console.error("Gmail callback error:", error)
    return new Response(error.message || "Internal server error", { status: 500 })
  }
}
