import { NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { requireAdmin } from '@/lib/utils/admin-auth'
import { logger } from '@/lib/utils/logger'

export async function POST() {
  const authResult = await requireAdmin()
  if (!authResult.isAdmin) {
    return authResult.response
  }
  const { serviceClient: supabase } = authResult

  try {
    // Process expired beta testers
    const { data: expiredTesters, error: fetchError } = await supabase
      .from("beta_testers")
      .select("*")
      .eq("status", "active")
      .not("expires_at", "is", null)
      .lt("expires_at", new Date().toISOString())

    if (fetchError) {
      throw fetchError
    }

    const processed = {
      expired: 0,
      downgraded: 0,
      offersSent: 0
    }

    for (const tester of expiredTesters || []) {
      // Update beta tester status to expired
      const { error: updateError } = await supabase
        .from("beta_testers")
        .update({ status: "expired" })
        .eq("id", tester.id)

      if (updateError) {
        logger.error("Failed to update beta tester status:", updateError)
        continue
      }
      processed.expired++

      // Downgrade user role from beta-pro to free
      const { error: roleError } = await supabase
        .from("user_profiles")
        .update({ role: "free" })
        .eq("id", tester.user_id)

      if (roleError) {
        logger.error("Failed to downgrade user role:", roleError)
        continue
      }
      processed.downgraded++
    }

    return jsonResponse({
      success: true,
      processed,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    logger.error("Error processing beta tester expirations:", error)
    return errorResponse(error.message || "Internal server error", 500)
  }
}
