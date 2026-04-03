import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { errorResponse } from '@/lib/utils/api-response'
import { logger } from '@/lib/utils/logger'
import { NextResponse } from 'next/server'
import type { AdminCapability, AdminCapabilities } from '@/lib/types/admin'
import { hasAnyCapability } from '@/lib/types/admin'

export interface AdminAuthResult {
  isAdmin: true
  userId: string
  capabilities: AdminCapabilities
  serviceClient: Awaited<ReturnType<typeof createSupabaseServiceClient>>
}

export interface AdminAuthError {
  isAdmin: false
  response: NextResponse
}

export interface RequireAdminOptions {
  /** Required capabilities — user must have at least one. If omitted, any admin capability suffices. */
  capabilities?: AdminCapability[]
  /** If true, check for a recent step-up auth session. Returns STEP_UP_REQUIRED if missing. */
  stepUp?: boolean
}

/**
 * Verify the request is from an authenticated admin user with the required capabilities.
 *
 * Usage:
 * ```ts
 * const authResult = await requireAdmin({ capabilities: ['user_admin'] })
 * if (!authResult.isAdmin) return authResult.response
 * const { userId, capabilities, serviceClient } = authResult
 * ```
 */
export async function requireAdmin(options?: RequireAdminOptions): Promise<AdminAuthResult | AdminAuthError> {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      logger.warn('[Admin Auth] Unauthenticated request to admin endpoint')
      return {
        isAdmin: false,
        response: errorResponse('Not authenticated', 401)
      }
    }

    const serviceClient = await createSupabaseServiceClient()

    const { data: profile, error: profileError } = await serviceClient
      .from('user_profiles')
      .select('admin_capabilities')
      .eq('id', user.id)
      .single()

    if (profileError) {
      logger.error('[Admin Auth] Failed to fetch user profile', { userId: user.id, error: profileError.message })
      return {
        isAdmin: false,
        response: errorResponse('Failed to verify admin status', 500)
      }
    }

    const capabilities: AdminCapabilities = (profile?.admin_capabilities as AdminCapabilities) || {}

    // Must have at least one admin capability
    const isAdmin = capabilities.super_admin === true ||
      Object.values(capabilities).some(v => v === true)

    if (!isAdmin) {
      logger.warn('[Admin Auth] Non-admin user attempted admin access', { userId: user.id })
      return {
        isAdmin: false,
        response: errorResponse('Admin access required', 403)
      }
    }

    // Check specific capability requirements
    if (options?.capabilities && options.capabilities.length > 0) {
      if (!hasAnyCapability(capabilities, options.capabilities)) {
        logger.warn('[Admin Auth] Admin lacks required capability', {
          userId: user.id,
          required: options.capabilities,
          has: capabilities
        })
        return {
          isAdmin: false,
          response: errorResponse('Insufficient admin permissions', 403)
        }
      }
    }

    // Check step-up auth if required
    if (options?.stepUp) {
      const { data: stepUpSession } = await serviceClient
        .from('admin_step_up_sessions')
        .select('id, method, verified_at')
        .eq('user_id', user.id)
        .gt('expires_at', new Date().toISOString())
        .order('verified_at', { ascending: false })
        .limit(1)
        .single()

      if (!stepUpSession) {
        logger.info('[Admin Auth] Step-up auth required', { userId: user.id })
        return {
          isAdmin: false,
          response: NextResponse.json(
            { error: 'Step-up authentication required', code: 'STEP_UP_REQUIRED' },
            { status: 403 }
          )
        }
      }
    }

    logger.info('[Admin Auth] Admin access granted', { userId: user.id, capabilities })

    return {
      isAdmin: true,
      userId: user.id,
      capabilities,
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
