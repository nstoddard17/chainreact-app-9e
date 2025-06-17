import { GoogleSheetsOAuthService } from "@/lib/oauth/google-sheets"
import { createAdminSupabaseClient } from "@/lib/oauth/utils"
import { NextRequest } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get("code")
    const state = searchParams.get("state")

    if (!code || !state) {
      return new Response("Missing code or state", { status: 400 })
    }

    const supabase = createAdminSupabaseClient()
    if (!supabase) {
      return new Response("Failed to create Supabase client", { status: 500 })
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return new Response("Unauthorized", { status: 401 })
    }

    const result = await GoogleSheetsOAuthService.handleCallback(
      code,
      state,
      supabase,
      user.id,
      request.headers.get("origin") || request.nextUrl.origin
    )

    if (!result.success) {
      return new Response(result.error || "Failed to handle callback", { status: 500 })
    }

    // Redirect to success page
    return Response.redirect(new URL("/integrations?success=true", request.url))
  } catch (error) {
    console.error("Google Sheets callback error:", error)
    return new Response("Failed to handle callback", { status: 500 })
  }
}
