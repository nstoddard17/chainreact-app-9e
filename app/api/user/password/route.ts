import { NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { jsonResponse, errorResponse } from "@/lib/utils/api-response"
import { logger } from "@/lib/utils/logger"

export const dynamic = 'force-dynamic'

export async function PUT(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    const body = await request.json()
    const { currentPassword, newPassword } = body

    if (!currentPassword || !newPassword) {
      return errorResponse("Current password and new password are required", 400)
    }

    if (newPassword.length < 8) {
      return errorResponse("New password must be at least 8 characters", 400)
    }

    // Verify current password by attempting to sign in
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password: currentPassword
    })

    if (verifyError) {
      return errorResponse("Current password is incorrect", 401)
    }

    // Update password
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword
    })

    if (updateError) throw updateError

    // Log password change
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'password_changed',
      resource_type: 'user',
      resource_id: user.id,
      created_at: new Date().toISOString()
    })

    return jsonResponse({ success: true })
  } catch (error: any) {
    logger.error('[User API] Error changing password:', { error: error.message })
    return errorResponse(error.message || "Failed to change password", 500)
  }
}
