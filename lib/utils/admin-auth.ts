import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { errorResponse } from '@/lib/utils/api-response'
import { logger } from '@/lib/utils/logger'
import { NextResponse } from 'next/server'

export interface AdminAuthResult {
  isAdmin: true
  userId: string
  serviceClient: Awaited<ReturnType<typeof createSupabaseServiceClient>>
}

export interface AdminAuthError {
  isAdmin: false
  response: NextResponse
}

/**
 * Verify the request is from an authenticated admin user.
 * Returns the service client for admin operations if authorized.
 *
 * Usage:
 * ```ts
 * const authResult = await requireAdmin()
 * if (!authResult.isAdmin) {
 *   return authResult.response
 * }
 * const { userId, serviceClient } = authResult
 * ```
 */
export async function requireAdmin(): Promise<AdminAuthResult | AdminAuthError> {
  try {
    // First, verify the user is authenticated
    const supabase = await createSupabaseRouteHandlerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      logger.warn('[Admin Auth] Unauthenticated request to admin endpoint')
      return {
        isAdmin: false,
        response: errorResponse('Not authenticated', 401)
      }
    }

    // Get service client to check admin status (bypasses RLS)
    const serviceClient = await createSupabaseServiceClient()

    // Check if user is admin
    const { data: profile, error: profileError } = await serviceClient
      .from('user_profiles')
      .select('admin')
      .eq('id', user.id)
      .single()

    if (profileError) {
      logger.error('[Admin Auth] Failed to fetch user profile', { userId: user.id, error: profileError.message })
      return {
        isAdmin: false,
        response: errorResponse('Failed to verify admin status', 500)
      }
    }

    if (profile?.admin !== true) {
      logger.warn('[Admin Auth] Non-admin user attempted admin access', { userId: user.id })
      return {
        isAdmin: false,
        response: errorResponse('Admin access required', 403)
      }
    }

    logger.debug('[Admin Auth] Admin access granted', { userId: user.id })

    return {
      isAdmin: true,
      userId: user.id,
      serviceClient
    }
  } catch (error: any) {
    logger.error('[Admin Auth] Unexpected error', { error: error.message })
    return {
      isAdmin: false,
      response: errorResponse('Authentication error', 500)
    }
  }
}
