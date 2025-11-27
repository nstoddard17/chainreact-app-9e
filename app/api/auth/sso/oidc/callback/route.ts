import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { logger } from '@/lib/utils/logger'
import * as crypto from 'crypto'

// OIDC callback handler
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')
    const errorDescription = searchParams.get('error_description')

    if (error) {
      logger.error('[SSO/OIDC] Provider returned error', { error, errorDescription })
      return redirectWithError(errorDescription || error)
    }

    if (!code || !state) {
      logger.error('[SSO/OIDC] Missing code or state')
      return redirectWithError('Invalid SSO callback')
    }

    const supabase = await createClient()

    // Decode state to get organization info
    let stateData: { orgId: string; returnUrl: string; nonce: string }
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString())
    } catch {
      logger.error('[SSO/OIDC] Invalid state parameter')
      return redirectWithError('Invalid SSO session')
    }

    const { orgId, returnUrl = '/workflows', nonce } = stateData

    // Get SSO configuration
    const { data: config, error: configError } = await supabase
      .from('sso_configurations')
      .select('*')
      .eq('organization_id', orgId)
      .eq('provider', 'oidc')
      .eq('is_active', true)
      .single()

    if (configError || !config) {
      logger.error('[SSO/OIDC] No active OIDC config found', { orgId })
      return redirectWithError('SSO not configured for this organization')
    }

    // Exchange code for tokens
    const tokenResponse = await exchangeCodeForTokens(code, config)

    if (!tokenResponse || !tokenResponse.id_token) {
      await logAttempt(supabase, config.id, null, request, 'failed', 'Failed to exchange code for tokens')
      return redirectWithError('Failed to authenticate with SSO provider')
    }

    // Verify and decode ID token
    const userInfo = await verifyIdToken(tokenResponse.id_token, config, nonce)

    if (!userInfo || !userInfo.email) {
      await logAttempt(supabase, config.id, null, request, 'failed', 'Failed to extract user info from ID token')
      return redirectWithError('Failed to get user information')
    }

    // Check if email domain is allowed
    if (config.allowed_domains && config.allowed_domains.length > 0) {
      const emailDomain = userInfo.email.split('@')[1]
      if (!config.allowed_domains.includes(emailDomain)) {
        await logAttempt(supabase, config.id, userInfo.email, request, 'failed', `Domain ${emailDomain} not allowed`)
        return redirectWithError('Your email domain is not authorized for this organization')
      }
    }

    // Check if user exists
    const { data: existingUser } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('email', userInfo.email)
      .single()

    let userId: string

    if (existingUser) {
      userId = existingUser.id
    } else if (config.auto_provision_users) {
      // Redirect to SSO signup for new users
      const signupUrl = new URL('/auth/sso-signup', process.env.NEXT_PUBLIC_APP_URL)
      signupUrl.searchParams.set('email', userInfo.email)
      signupUrl.searchParams.set('firstName', userInfo.given_name || '')
      signupUrl.searchParams.set('lastName', userInfo.family_name || '')
      signupUrl.searchParams.set('orgId', orgId)
      signupUrl.searchParams.set('returnUrl', returnUrl)
      return NextResponse.redirect(signupUrl)
    } else {
      await logAttempt(supabase, config.id, userInfo.email, request, 'failed', 'User not found and auto-provision disabled')
      return redirectWithError('Your account does not exist. Contact your administrator.')
    }

    // Check/add organization membership
    const { data: membership } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', orgId)
      .eq('user_id', userId)
      .single()

    if (!membership && config.auto_provision_users) {
      await supabase.from('organization_members').insert({
        organization_id: orgId,
        user_id: userId,
        role: config.default_role || 'member',
      })
    } else if (!membership) {
      await logAttempt(supabase, config.id, userInfo.email, request, 'failed', 'User not member of organization')
      return redirectWithError('You are not a member of this organization')
    }

    // Log successful login
    await logAttempt(supabase, config.id, userInfo.email, request, 'success', null, userId)

    // Create session
    const sessionUrl = new URL('/auth/sso-session', process.env.NEXT_PUBLIC_APP_URL)
    const token = signSessionToken({
      userId,
      email: userInfo.email,
      orgId,
      exp: Date.now() + 60000,
    })
    sessionUrl.searchParams.set('token', token)
    sessionUrl.searchParams.set('returnUrl', returnUrl)

    return NextResponse.redirect(sessionUrl)
  } catch (error) {
    logger.error('[SSO/OIDC] Callback error', { error })
    return redirectWithError('An error occurred during SSO authentication')
  }
}

async function exchangeCodeForTokens(code: string, config: any) {
  try {
    // Get token endpoint from discovery document
    const discoveryResponse = await fetch(config.discovery_url)
    const discovery = await discoveryResponse.json()

    const tokenEndpoint = discovery.token_endpoint

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/sso/oidc/callback`,
      client_id: config.client_id,
      client_secret: config.configuration?.clientSecret || '',
    })

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    })

    if (!response.ok) {
      logger.error('[SSO/OIDC] Token exchange failed', {
        status: response.status,
        body: await response.text(),
      })
      return null
    }

    return await response.json()
  } catch (error) {
    logger.error('[SSO/OIDC] Token exchange error', { error })
    return null
  }
}

async function verifyIdToken(idToken: string, config: any, expectedNonce: string) {
  try {
    // Decode JWT (in production, verify signature with JWKS)
    const [, payloadB64] = idToken.split('.')
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString())

    // Verify nonce if present
    if (expectedNonce && payload.nonce !== expectedNonce) {
      logger.error('[SSO/OIDC] Nonce mismatch')
      return null
    }

    // Verify expiration
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      logger.error('[SSO/OIDC] Token expired')
      return null
    }

    // Verify audience
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
    if (!aud.includes(config.client_id)) {
      logger.error('[SSO/OIDC] Invalid audience')
      return null
    }

    return {
      email: payload.email,
      given_name: payload.given_name,
      family_name: payload.family_name,
      name: payload.name,
      sub: payload.sub,
      groups: payload.groups || [],
    }
  } catch (error) {
    logger.error('[SSO/OIDC] ID token verification failed', { error })
    return null
  }
}

async function logAttempt(
  supabase: any,
  configId: string,
  email: string | null,
  request: NextRequest,
  status: 'success' | 'failed',
  errorMessage: string | null,
  userId?: string
) {
  await supabase.from('sso_login_attempts').insert({
    sso_config_id: configId,
    user_email: email,
    user_id: userId,
    ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
    user_agent: request.headers.get('user-agent'),
    status,
    error_message: errorMessage,
  })
}

function redirectWithError(message: string) {
  const errorUrl = new URL('/auth/sso-error', process.env.NEXT_PUBLIC_APP_URL)
  errorUrl.searchParams.set('error', message)
  return NextResponse.redirect(errorUrl)
}

function signSessionToken(payload: any): string {
  const secret = process.env.SSO_SESSION_SECRET || process.env.NEXTAUTH_SECRET || 'fallback-secret'
  const data = JSON.stringify(payload)
  const signature = crypto.createHmac('sha256', secret).update(data).digest('hex')
  return Buffer.from(`${data}|${signature}`).toString('base64')
}
