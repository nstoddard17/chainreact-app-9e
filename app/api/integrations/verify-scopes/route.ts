import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseClient } from "@/lib/supabase"
import { validateAllIntegrations } from "@/lib/integrations/scopeValidation"

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()

    if (!supabase) {
      return NextResponse.json({ error: "Supabase client not configured" }, { status: 500 })
    }

    // Get the current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    // Validate all integrations for the user
    const validationResults = await validateAllIntegrations(user.id)

    return NextResponse.json({
      success: true,
      integrations: validationResults.map((result) => result.integration),
      validationResults,
    })
  } catch (error: any) {
    console.error("Error verifying integration scopes:", error)
    return NextResponse.json({ error: error.message || "Failed to verify integration scopes" }, { status: 500 })
  }
}
