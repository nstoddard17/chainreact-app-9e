import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { logger } from '@/lib/utils/logger'
import * as crypto from 'crypto'

// SAML callback handler
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const samlResponse = formData.get('SAMLResponse') as string
    const relayState = formData.get('RelayState') as string

    if (!samlResponse) {
      logger.error('[SSO/SAML] No SAMLResponse in callback')
      return redirectWithError('No SAML response received')
    }

    const supabase = await createClient()

    // Decode relay state to get organization info
    let orgId: string
    let returnUrl: string = '/workflows'

    try {
      const decodedState = JSON.parse(Buffer.from(relayState || '', 'base64').toString())
      orgId = decodedState.orgId
      returnUrl = decodedState.returnUrl || '/workflows'
    } catch {
      logger.error('[SSO/SAML] Invalid relay state')
      return redirectWithError('Invalid SSO session')
    }

    // Get SSO configuration
    const { data: config, error: configError } = await supabase
      .from('sso_configurations')
      .select('*')
      .eq('organization_id', orgId)
      .eq('provider', 'saml')
      .eq('is_active', true)
      .single()

    if (configError || !config) {
      logger.error('[SSO/SAML] No active SAML config found', { orgId })
      return redirectWithError('SSO not configured for this organization')
    }

    // Parse and validate SAML response
    const userInfo = await parseSAMLResponse(samlResponse, config)

    if (!userInfo || !userInfo.email) {
      // Log failed attempt
      await supabase.from('sso_login_attempts').insert({
        sso_config_id: config.id,
        user_email: null,
        ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
        user_agent: request.headers.get('user-agent'),
        status: 'failed',
        error_message: 'Failed to extract user info from SAML response',
      })

      return redirectWithError('Failed to authenticate with SSO provider')
    }

    // Check if email domain is allowed
    if (config.allowed_domains && config.allowed_domains.length > 0) {
      const emailDomain = userInfo.email.split('@')[1]
      if (!config.allowed_domains.includes(emailDomain)) {
        await supabase.from('sso_login_attempts').insert({
          sso_config_id: config.id,
          user_email: userInfo.email,
          ip_address: request.headers.get('x-forwarded-for'),
          user_agent: request.headers.get('user-agent'),
          status: 'failed',
          error_message: `Email domain ${emailDomain} not allowed`,
        })

        return redirectWithError('Your email domain is not authorized for this organization')
      }
    }

    // Check if user exists
    const { data: existingUser, error: userError } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('email', userInfo.email)
      .single()

    let userId: string

    if (existingUser) {
      userId = existingUser.id
    } else if (config.auto_provision_users) {
      // Create new user via Supabase Auth
      // Note: This requires admin privileges or a custom signup flow
      // For now, we'll redirect to a special signup page
      const signupUrl = new URL('/auth/sso-signup', process.env.NEXT_PUBLIC_APP_URL)
      signupUrl.searchParams.set('email', userInfo.email)
      signupUrl.searchParams.set('firstName', userInfo.firstName || '')
      signupUrl.searchParams.set('lastName', userInfo.lastName || '')
      signupUrl.searchParams.set('orgId', orgId)
      signupUrl.searchParams.set('returnUrl', returnUrl)

      return NextResponse.redirect(signupUrl)
    } else {
      return redirectWithError('Your account does not exist. Contact your administrator.')
    }

    // Check if user is member of organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', orgId)
      .eq('user_id', userId)
      .single()

    if (!membership && config.auto_provision_users) {
      // Add user to organization
      await supabase.from('organization_members').insert({
        organization_id: orgId,
        user_id: userId,
        role: config.default_role || 'member',
      })
    } else if (!membership) {
      return redirectWithError('You are not a member of this organization')
    }

    // Log successful login
    await supabase.from('sso_login_attempts').insert({
      sso_config_id: config.id,
      user_email: userInfo.email,
      user_id: userId,
      ip_address: request.headers.get('x-forwarded-for'),
      user_agent: request.headers.get('user-agent'),
      status: 'success',
    })

    // Create a session token for the user
    // In production, this would use Supabase's signInWithIdToken or similar
    const sessionUrl = new URL('/auth/sso-session', process.env.NEXT_PUBLIC_APP_URL)
    sessionUrl.searchParams.set('userId', userId)
    sessionUrl.searchParams.set('email', userInfo.email)
    sessionUrl.searchParams.set('orgId', orgId)
    sessionUrl.searchParams.set('returnUrl', returnUrl)

    // Create a signed token for security
    const token = signSessionToken({ userId, email: userInfo.email, orgId, exp: Date.now() + 60000 })
    sessionUrl.searchParams.set('token', token)

    return NextResponse.redirect(sessionUrl)
  } catch (error) {
    logger.error('[SSO/SAML] Callback error', { error })
    return redirectWithError('An error occurred during SSO authentication')
  }
}

function redirectWithError(message: string) {
  const errorUrl = new URL('/auth/sso-error', process.env.NEXT_PUBLIC_APP_URL)
  errorUrl.searchParams.set('error', message)
  return NextResponse.redirect(errorUrl)
}

async function parseSAMLResponse(
  samlResponse: string,
  config: any
): Promise<{ email?: string; firstName?: string; lastName?: string; groups?: string[] } | null> {
  try {
    // Decode base64 SAML response
    const decoded = Buffer.from(samlResponse, 'base64').toString('utf-8')

    // In production, use a proper SAML library like 'saml2-js' or '@node-saml/node-saml'
    // This is a simplified extraction for demonstration

    // Extract NameID (usually email)
    const nameIdMatch = decoded.match(/<saml:NameID[^>]*>([^<]+)<\/saml:NameID>/i)
      || decoded.match(/<NameID[^>]*>([^<]+)<\/NameID>/i)

    const email = nameIdMatch?.[1] || extractAttribute(decoded, 'email')
      || extractAttribute(decoded, 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress')

    if (!email) {
      logger.error('[SSO/SAML] Could not extract email from SAML response')
      return null
    }

    const firstName = extractAttribute(decoded, 'firstName')
      || extractAttribute(decoded, 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname')
      || extractAttribute(decoded, 'givenName')

    const lastName = extractAttribute(decoded, 'lastName')
      || extractAttribute(decoded, 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname')
      || extractAttribute(decoded, 'sn')

    const groupsRaw = extractAttribute(decoded, 'groups')
      || extractAttribute(decoded, 'http://schemas.microsoft.com/ws/2008/06/identity/claims/groups')

    return {
      email,
      firstName,
      lastName,
      groups: groupsRaw?.split(',').map(g => g.trim()) || [],
    }
  } catch (error) {
    logger.error('[SSO/SAML] Failed to parse SAML response', { error })
    return null
  }
}

function extractAttribute(xml: string, attributeName: string): string | undefined {
  // Try multiple attribute name formats
  const patterns = [
    new RegExp(`<(?:saml:)?Attribute[^>]*Name=["']${escapeRegex(attributeName)}["'][^>]*>.*?<(?:saml:)?AttributeValue[^>]*>([^<]*)</(?:saml:)?AttributeValue>`, 'is'),
    new RegExp(`<Attribute[^>]*Name=["']${escapeRegex(attributeName)}["'][^>]*>.*?<AttributeValue[^>]*>([^<]*)</AttributeValue>`, 'is'),
  ]

  for (const pattern of patterns) {
    const match = xml.match(pattern)
    if (match) return match[1]
  }

  return undefined
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function signSessionToken(payload: any): string {
  const secret = process.env.SSO_SESSION_SECRET || process.env.NEXTAUTH_SECRET || 'fallback-secret'
  const data = JSON.stringify(payload)
  const signature = crypto.createHmac('sha256', secret).update(data).digest('hex')
  return Buffer.from(`${data}|${signature}`).toString('base64')
}
