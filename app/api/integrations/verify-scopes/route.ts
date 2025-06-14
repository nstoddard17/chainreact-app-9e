import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseClient } from "@/lib/supabase"
import { validateAllIntegrations } from "@/lib/integrations/scopeValidation"

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()

    // Get the current user
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError || !session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Validate all integrations for the user
    const validationResults = await validateAllIntegrations(session.user.id)

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
