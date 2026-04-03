import { NextResponse, type NextRequest } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureUserProfile } from '@/lib/auth/ensureUserProfile'

import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errorResponse('Not authenticated' , 401)
    }

    const adminClient = createAdminClient()

    // ensureUserProfile handles SELECT-if-exists and INSERT-if-missing idempotently
    const { profile } = await ensureUserProfile(adminClient, user.id)

    logger.info('[API /api/auth/profile] Returning profile', {
      userId: profile.id,
      admin_capabilities: profile.admin_capabilities,
      plan: profile.plan,
      role: profile.role,
    })

    return jsonResponse({ profile })
  } catch (error) {
    logger.error('Unexpected error in auth profile route:', error)
    return errorResponse('Internal server error' , 500)
  }
}
