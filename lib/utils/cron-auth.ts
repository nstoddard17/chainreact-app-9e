import { errorResponse } from '@/lib/utils/api-response'
import { logger } from '@/lib/utils/logger'
import { NextResponse } from 'next/server'

export interface CronAuthResult {
  authorized: true
}

export interface CronAuthError {
  authorized: false
  response: NextResponse
}

/**
 * Verify that a request is from an authorized cron job or background task.
 * Checks `authorization` header, `x-admin-key` header, and `secret` query param
 * against ADMIN_SECRET, CRON_SECRET, and ADMIN_API_KEY env vars.
 *
 * Usage:
 * ```ts
 * const authResult = requireCronAuth(request)
 * if (!authResult.authorized) return authResult.response
 * ```
 */
export function requireCronAuth(request: Request): CronAuthResult | CronAuthError {
  const adminSecret = process.env.ADMIN_SECRET
  const cronSecret = process.env.CRON_SECRET
  const adminApiKey = process.env.ADMIN_API_KEY

  const validSecrets = [adminSecret, cronSecret, adminApiKey].filter(Boolean)

  if (validSecrets.length === 0) {
    logger.error('[Cron Auth] No cron/admin secrets configured')
    return {
      authorized: false,
      response: errorResponse('Server misconfiguration', 500)
    }
  }

  // Check x-admin-key header
  const adminKeyHeader = request.headers.get('x-admin-key')
  if (adminKeyHeader && validSecrets.includes(adminKeyHeader)) {
    return { authorized: true }
  }

  // Check authorization bearer token
  const authHeader = request.headers.get('authorization')
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, '')
    if (validSecrets.includes(token)) {
      return { authorized: true }
    }
  }

  // Check secret query param
  const url = new URL(request.url)
  const secretParam = url.searchParams.get('secret')
  if (secretParam && validSecrets.includes(secretParam)) {
    return { authorized: true }
  }

  logger.warn('[Cron Auth] Unauthorized cron/admin request')
  return {
    authorized: false,
    response: errorResponse('Unauthorized', 401)
  }
}
