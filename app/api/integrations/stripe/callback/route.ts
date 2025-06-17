import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { StripeOAuthService } from "@/lib/oauth/stripe"
import { parseOAuthState, validateOAuthState } from "@/lib/oauth/utils"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error("Missing required environment variables")
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const error = searchParams.get("error")
  const error_description = searchParams.get("error_description")

  let postMessage = ""

  if (code) {
    postMessage = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Stripe Integration</title>
      </head>
      <body>
        <script>
          window.opener.postMessage({
            type: 'stripe-callback',
            provider: 'stripe',
            payload: { code: '${code}' }
          }, window.location.origin);
          window.close();
        </script>
      </body>
      </html>
    `
  } else if (error) {
    postMessage = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Stripe Integration Error</title>
      </head>
      <body>
        <script>
          window.opener.postMessage({
            type: 'oauth-success',
            provider: 'stripe',
            error: '${error}',
            error_description: '${error_description || ""}'
          }, window.location.origin);
          window.close();
        </script>
      </body>
      </html>
    `
  } else {
    postMessage = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Stripe Integration Error</title>
      </head>
      <body>
        <script>
          window.opener.postMessage({
            type: 'oauth-error',
            provider: 'stripe',
            error: 'unknown_error',
            error_description: 'Unknown error occurred during Stripe integration.'
          }, window.location.origin);
          window.close();
        </script>
      </body>
      </html>
    `
  }

  return new NextResponse(postMessage, {
    headers: {
      "Content-Type": "text/html",
    },
  })
}
