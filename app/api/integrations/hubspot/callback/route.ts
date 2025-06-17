import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { HubSpotOAuthService } from "@/lib/oauth/hubspot"
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

  let message = ""
  let success = false

  if (code) {
    message = `HubSpot authentication successful! Code: ${code}`
    success = true
  } else if (error) {
    message = `HubSpot authentication failed. Error: ${error}. Description: ${error_description}`
  } else {
    message = "Unknown error occurred during HubSpot authentication."
  }

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>HubSpot Authentication Callback</title>
  <style>
    body {
      font-family: sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      background-color: #f0f0f0;
    }
    .container {
      text-align: center;
      padding: 20px;
      border-radius: 8px;
      background-color: white;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>HubSpot Authentication</h1>
    <p>${message}</p>
    <script>
      window.onload = function() {
        window.opener.postMessage({
          type: 'hubspot-auth-response',
          success: ${success},
          code: '${code || ""}',
          error: '${error || ""}',
          error_description: '${error_description || ""}'
        }, window.location.origin);
      };
    </script>
  </div>
</body>
</html>
`

  return new NextResponse(htmlContent, {
    headers: {
      "Content-Type": "text/html",
    },
  })
}
