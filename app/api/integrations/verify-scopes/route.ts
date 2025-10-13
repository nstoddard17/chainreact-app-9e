import { type NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { getSupabaseClient } from "@/lib/supabase"
import { validateAllIntegrations } from "@/lib/integrations/scopeValidation"

import { logger } from '@/lib/utils/logger'

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()

    if (!supabase) {
      return errorResponse("Supabase client not configured" , 500)
    }

    // Get the current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse("Not authenticated" , 401)
    }

    // Validate all integrations for the user
    const validationResults = await validateAllIntegrations(user.id)

    return jsonResponse({
      success: true,
      integrations: validationResults.map((result) => result.integration),
      validationResults,
    })
  } catch (error: any) {
    logger.error("Error verifying integration scopes:", error)
    return errorResponse(error.message || "Failed to verify integration scopes" , 500)
  }
}
