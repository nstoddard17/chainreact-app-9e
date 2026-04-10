import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServiceClient } from '@/utils/supabase/server'
import { logger } from '@/lib/utils/logger'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import * as crypto from 'crypto'

const SSO_SESSION_SECRET = process.env.SSO_SESSION_SECRET || 'chainreact-sso-secret'

/**
 * Verifies an SSO session token server-side, then either:
 * - Returns Supabase session tokens for an existing user
 * - Auto-provisions a new user if the org allows it
 * - Returns { needsSignup: true } if auto-provisioning is disabled
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token } = body

    if (!token) {
      return errorResponse('Missing session token', 400)
    }

    // --- Verify HMAC signature server-side ---
    const payload = verifySessionToken(token)
    if (!payload) {
      logger.error('[SSO/verify-session] Invalid token signature')
      return errorResponse('Invalid session token', 401)
    }

    // --- Check expiration ---
    if (payload.exp && payload.exp < Date.now()) {
      logger.error('[SSO/verify-session] Token expired', {
        exp: payload.exp,
        now: Date.now(),
      })
      return errorResponse('Session token expired', 401)
    }

    const { email, orgId, firstName, lastName } = payload

    if (!email || !orgId) {
      logger.error('[SSO/verify-session] Token missing required fields', { email: !!email, orgId: !!orgId })
      return errorResponse('Invalid token payload', 400)
    }

    // --- Use service-role client for admin operations ---
    const adminClient = getAdminAuthClient()
    const supabase = await createSupabaseServiceClient()

    // --- Look up user by email in auth.users ---
    const { data: userList } = await adminClient.auth.admin.listUsers({ filter: `email.eq.${email}`, page: 1, perPage: 1 } as any)
    const existingAuthUser = userList?.users?.[0] || null

    if (existingAuthUser) {
      // User exists -- generate a magic link to create a valid session
      const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
        type: 'magiclink',
        email,
        options: {
          redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL}/workflows`,
        },
      })

      if (linkError || !linkData?.properties?.hashed_token) {
        logger.error('[SSO/verify-session] Failed to generate magic link', { error: linkError })
        return errorResponse('Failed to create session', 500)
      }

      // Use the OTP from generateLink to verify and get session tokens
      const { data: sessionData, error: sessionError } = await adminClient.auth.verifyOtp({
        type: 'magiclink',
        token_hash: linkData.properties.hashed_token,
      })

      if (sessionError || !sessionData.session) {
        logger.error('[SSO/verify-session] Failed to verify OTP for session', { error: sessionError })
        return errorResponse('Failed to create session', 500)
      }

      logger.info('[SSO/verify-session] Session created for existing user', {
        userId: existingAuthUser.id,
        email,
      })

      return jsonResponse({
        success: true,
        accessToken: sessionData.session.access_token,
        refreshToken: sessionData.session.refresh_token,
      })
    }

    // --- User does not exist -- check if org allows auto-provisioning ---
    const { data: config } = await supabase
      .from('sso_configurations')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .single()

    const ssoConfig = config as any
    if (!ssoConfig?.auto_provision_users) {
      logger.info('[SSO/verify-session] New user, auto-provision disabled', { email, orgId })
      return jsonResponse({
        needsSignup: true,
        email,
        firstName: firstName || '',
        lastName: lastName || '',
        orgId,
      })
    }

    // --- Auto-provision: create auth user ---
    const { data: newAuthUser, error: createError } = await adminClient.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        first_name: firstName || '',
        last_name: lastName || '',
        full_name: [firstName, lastName].filter(Boolean).join(' '),
        provider: 'sso',
      },
    })

    if (createError || !newAuthUser.user) {
      logger.error('[SSO/verify-session] Failed to create user', { error: createError, email })
      return errorResponse('Failed to provision user account', 500)
    }

    // --- Create user_profiles record ---
    const fullName = [firstName, lastName].filter(Boolean).join(' ')
    const { error: profileError } = await supabase
      .from('user_profiles')
      .upsert({
        id: newAuthUser.user.id,
        email,
        first_name: firstName || null,
        last_name: lastName || null,
        full_name: fullName || null,
        provider: 'sso',
        role: 'free',
      }, { onConflict: 'id' })

    if (profileError) {
      logger.error('[SSO/verify-session] Failed to create user profile', { error: profileError })
      // Non-fatal: user is created in auth, profile can be fixed later
    }

    // --- Add to organization_members ---
    const { error: memberError } = await supabase
      .from('organization_members')
      .insert({
        organization_id: orgId,
        user_id: newAuthUser.user.id,
        role: ssoConfig.default_role || 'member',
      })

    if (memberError) {
      logger.error('[SSO/verify-session] Failed to add org membership', { error: memberError })
      // Non-fatal: user can be added later by admin
    }

    // --- Generate session for the new user ---
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL}/workflows`,
      },
    })

    if (linkError || !linkData?.properties?.hashed_token) {
      logger.error('[SSO/verify-session] Failed to generate magic link for new user', { error: linkError })
      return errorResponse('User created but session creation failed', 500)
    }

    const { data: sessionData, error: sessionError } = await adminClient.auth.verifyOtp({
      type: 'magiclink',
      token_hash: linkData.properties.hashed_token,
    })

    if (sessionError || !sessionData.session) {
      logger.error('[SSO/verify-session] Failed to verify OTP for new user session', { error: sessionError })
      return errorResponse('User created but session creation failed', 500)
    }

    logger.info('[SSO/verify-session] Auto-provisioned new user', {
      userId: newAuthUser.user.id,
      email,
      orgId,
    })

    return jsonResponse({
      success: true,
      accessToken: sessionData.session.access_token,
      refreshToken: sessionData.session.refresh_token,
    })
  } catch (error) {
    logger.error('[SSO/verify-session] Unexpected error', { error })
    return errorResponse('Internal server error', 500)
  }
}

// --- Helpers ---

function getAdminAuthClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}

interface SSOTokenPayload {
  userId?: string
  email: string
  orgId: string
  firstName?: string
  lastName?: string
  exp: number
}

function verifySessionToken(token: string): SSOTokenPayload | null {
  try {
    const decoded = Buffer.from(token, 'base64').toString()
    const separatorIndex = decoded.lastIndexOf('|')

    if (separatorIndex === -1) {
      return null
    }

    const data = decoded.substring(0, separatorIndex)
    const signature = decoded.substring(separatorIndex + 1)

    // Verify HMAC-SHA256 signature
    const expectedSignature = crypto
      .createHmac('sha256', SSO_SESSION_SECRET)
      .update(data)
      .digest('hex')

    // Timing-safe comparison to prevent timing attacks
    if (signature.length !== expectedSignature.length) {
      return null
    }

    const sigBuffer = Buffer.from(signature, 'hex')
    const expectedBuffer = Buffer.from(expectedSignature, 'hex')

    if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      return null
    }

    return JSON.parse(data)
  } catch {
    return null
  }
}
