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

    const origin = request.headers.get("origin") || "http://localhost:3000"
    const result = await GmailOAuthService.handleCallback(code, state, supabase, user.id, origin)

    if (!result.success) {
      return new Response(result.error || "Failed to handle callback", { status: 500 })
    }

    return Response.redirect(`${origin}/integrations?success=true`)
  } catch (error: any) {
    console.error("Gmail callback error:", error)
    return new Response(error.message || "Internal server error", { status: 500 })
  }
}
