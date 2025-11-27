import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { logger } from '@/lib/utils/logger'
import * as crypto from 'crypto'

// Initiate SSO login flow
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const orgId = searchParams.get('orgId')
    const email = searchParams.get('email')
    const returnUrl = searchParams.get('returnUrl') || '/workflows'

    if (!orgId && !email) {
      return NextResponse.json({
        error: 'Either organization ID or email is required'
      }, { status: 400 })
    }

    const supabase = await createClient()
    let targetOrgId = orgId

    // If email provided, look up organization by domain
    if (!targetOrgId && email) {
      const domain = email.split('@')[1]
      const { data: domainMapping } = await supabase
        .from('sso_domain_mappings')
        .select('organization_id')
        .eq('domain', domain)
        .eq('is_verified', true)
        .single()

      if (!domainMapping) {
        return NextResponse.json({
          error: 'No SSO configured for this email domain',
          ssoRequired: false
        }, { status: 404 })
      }

      targetOrgId = domainMapping.organization_id
    }

    // Get active SSO configuration
    const { data: config, error: configError } = await supabase
      .from('sso_configurations')
      .select('*')
      .eq('organization_id', targetOrgId)
      .eq('is_active', true)
      .single()

    if (configError || !config) {
      return NextResponse.json({
        error: 'No active SSO configuration found',
        ssoRequired: false
      }, { status: 404 })
    }

    // Generate SSO redirect URL based on provider
    let redirectUrl: string

    if (config.provider === 'saml') {
      redirectUrl = generateSAMLRequest(config, targetOrgId!, returnUrl)
    } else if (config.provider === 'oidc') {
      redirectUrl = generateOIDCRequest(config, targetOrgId!, returnUrl)
    } else {
      return NextResponse.json({
        error: 'Unsupported SSO provider'
      }, { status: 400 })
    }

    // Return redirect URL (client will redirect)
    return NextResponse.json({
      redirectUrl,
      provider: config.provider,
      providerName: config.provider_name,
    })
  } catch (error) {
    logger.error('[SSO] Initiation error', { error })
    return NextResponse.json({ error: 'Failed to initiate SSO' }, { status: 500 })
  }
}

function generateSAMLRequest(config: any, orgId: string, returnUrl: string): string {
  // Generate SAML AuthnRequest
  const requestId = `_${crypto.randomUUID()}`
  const issueInstant = new Date().toISOString()
  const acsUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/sso/saml/callback`

  // Relay state to pass context through SAML flow
  const relayState = Buffer.from(JSON.stringify({
    orgId,
    returnUrl,
    requestId,
  })).toString('base64')

  // Build AuthnRequest XML
  const authnRequest = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:AuthnRequest
  xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
  xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
  ID="${requestId}"
  Version="2.0"
  IssueInstant="${issueInstant}"
  AssertionConsumerServiceURL="${acsUrl}"
  Destination="${config.sso_url}"
  ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
  <saml:Issuer>${config.entity_id || process.env.NEXT_PUBLIC_APP_URL}</saml:Issuer>
  <samlp:NameIDPolicy Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress" AllowCreate="true"/>
</samlp:AuthnRequest>`

  // Encode the request
  const encodedRequest = Buffer.from(authnRequest).toString('base64')

  // Build redirect URL
  const ssoUrl = new URL(config.sso_url)
  ssoUrl.searchParams.set('SAMLRequest', encodedRequest)
  ssoUrl.searchParams.set('RelayState', relayState)

  return ssoUrl.toString()
}

function generateOIDCRequest(config: any, orgId: string, returnUrl: string): string {
  const nonce = crypto.randomUUID()
  const state = Buffer.from(JSON.stringify({
    orgId,
    returnUrl,
    nonce,
  })).toString('base64')

  // Build OIDC authorization URL
  // We need to get the authorization endpoint from discovery
  // For now, construct it from the discovery URL
  const discoveryBase = config.discovery_url.replace('/.well-known/openid-configuration', '')
  const authUrl = new URL(`${discoveryBase}/authorize`)

  authUrl.searchParams.set('client_id', config.client_id)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('scope', 'openid email profile')
  authUrl.searchParams.set('redirect_uri', `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/sso/oidc/callback`)
  authUrl.searchParams.set('state', state)
  authUrl.searchParams.set('nonce', nonce)

  return authUrl.toString()
}

// Check if SSO is required for an email domain
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 })
    }

    const domain = email.split('@')[1]
    const supabase = await createClient()

    // Check if domain has SSO configured
    const { data: domainMapping } = await supabase
      .from('sso_domain_mappings')
      .select(`
        *,
        sso_configurations!inner (
          id,
          provider,
          provider_name,
          enforce_sso,
          is_active
        )
      `)
      .eq('domain', domain)
      .eq('is_verified', true)
      .single()

    if (!domainMapping || !domainMapping.sso_configurations?.is_active) {
      return NextResponse.json({
        ssoRequired: false,
        ssoAvailable: false,
      })
    }

    return NextResponse.json({
      ssoRequired: domainMapping.sso_configurations.enforce_sso,
      ssoAvailable: true,
      provider: domainMapping.sso_configurations.provider,
      providerName: domainMapping.sso_configurations.provider_name,
      organizationId: domainMapping.organization_id,
    })
  } catch (error) {
    logger.error('[SSO] Check error', { error })
    return NextResponse.json({ error: 'Failed to check SSO status' }, { status: 500 })
  }
}
