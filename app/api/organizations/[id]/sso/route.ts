import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { logger } from '@/lib/utils/logger'

// GET - Fetch SSO configuration for organization
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: organizationId } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is org admin/owner
    const { data: membership, error: memberError } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .single()

    if (memberError || !membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Fetch SSO configurations
    const { data: configs, error: configError } = await supabase
      .from('sso_configurations')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })

    if (configError) {
      logger.error('[SSO] Failed to fetch configurations', { error: configError.message })
      return NextResponse.json({ error: 'Failed to fetch SSO configurations' }, { status: 500 })
    }

    // Fetch domain mappings
    const { data: domains, error: domainError } = await supabase
      .from('sso_domain_mappings')
      .select('*')
      .eq('organization_id', organizationId)

    if (domainError) {
      logger.error('[SSO] Failed to fetch domain mappings', { error: domainError.message })
    }

    // Mask sensitive fields in configuration
    const maskedConfigs = configs?.map(config => ({
      ...config,
      configuration: {
        ...config.configuration,
        clientSecret: config.configuration?.clientSecret ? '••••••••' : undefined,
      },
      x509_certificate: config.x509_certificate ? '••••••••' : undefined,
    }))

    return NextResponse.json({
      configurations: maskedConfigs || [],
      domains: domains || [],
    })
  } catch (error) {
    logger.error('[SSO] Unexpected error', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Create new SSO configuration
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: organizationId } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is org owner
    const { data: membership, error: memberError } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .single()

    if (memberError || !membership || membership.role !== 'owner') {
      return NextResponse.json({ error: 'Only organization owners can configure SSO' }, { status: 403 })
    }

    // Check if organization has enterprise plan
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('id', organizationId)
      .single()

    if (orgError || !org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // TODO: Check enterprise plan status
    // For now, allow configuration

    const body = await request.json()
    const { provider, providerName, configuration, entityId, ssoUrl, sloUrl, x509Certificate, clientId, discoveryUrl, enforceSso, autoProvisionUsers, defaultRole, allowedDomains } = body

    if (!provider || !['saml', 'oidc', 'oauth2'].includes(provider)) {
      return NextResponse.json({ error: 'Invalid provider type' }, { status: 400 })
    }

    // Validate required fields based on provider
    if (provider === 'saml') {
      if (!entityId || !ssoUrl || !x509Certificate) {
        return NextResponse.json({
          error: 'SAML requires entityId, ssoUrl, and x509Certificate'
        }, { status: 400 })
      }
    } else if (provider === 'oidc') {
      if (!clientId || !discoveryUrl) {
        return NextResponse.json({
          error: 'OIDC requires clientId and discoveryUrl'
        }, { status: 400 })
      }
    }

    // Create SSO configuration
    const { data: config, error: createError } = await supabase
      .from('sso_configurations')
      .insert({
        organization_id: organizationId,
        provider,
        provider_name: providerName || `${provider.toUpperCase()} Provider`,
        configuration: configuration || {},
        entity_id: entityId,
        sso_url: ssoUrl,
        slo_url: sloUrl,
        x509_certificate: x509Certificate,
        client_id: clientId,
        discovery_url: discoveryUrl,
        enforce_sso: enforceSso || false,
        auto_provision_users: autoProvisionUsers !== false,
        default_role: defaultRole || 'member',
        allowed_domains: allowedDomains || [],
        is_active: false, // Start inactive until tested
        created_by: user.id,
      })
      .select()
      .single()

    if (createError) {
      logger.error('[SSO] Failed to create configuration', { error: createError.message })
      return NextResponse.json({ error: 'Failed to create SSO configuration' }, { status: 500 })
    }

    logger.debug('[SSO] Configuration created', {
      orgId: organizationId,
      provider,
      configId: config.id
    })

    return NextResponse.json({
      success: true,
      configuration: config,
      message: 'SSO configuration created. Test it before activating.'
    })
  } catch (error) {
    logger.error('[SSO] Unexpected error creating config', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH - Update SSO configuration
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: organizationId } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is org owner
    const { data: membership, error: memberError } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .single()

    if (memberError || !membership || membership.role !== 'owner') {
      return NextResponse.json({ error: 'Only organization owners can update SSO' }, { status: 403 })
    }

    const body = await request.json()
    const { configId, ...updates } = body

    if (!configId) {
      return NextResponse.json({ error: 'Configuration ID required' }, { status: 400 })
    }

    // Build update object, mapping camelCase to snake_case
    const updateData: Record<string, any> = {}
    if (updates.providerName !== undefined) updateData.provider_name = updates.providerName
    if (updates.entityId !== undefined) updateData.entity_id = updates.entityId
    if (updates.ssoUrl !== undefined) updateData.sso_url = updates.ssoUrl
    if (updates.sloUrl !== undefined) updateData.slo_url = updates.sloUrl
    if (updates.x509Certificate !== undefined) updateData.x509_certificate = updates.x509Certificate
    if (updates.clientId !== undefined) updateData.client_id = updates.clientId
    if (updates.discoveryUrl !== undefined) updateData.discovery_url = updates.discoveryUrl
    if (updates.configuration !== undefined) updateData.configuration = updates.configuration
    if (updates.isActive !== undefined) updateData.is_active = updates.isActive
    if (updates.enforceSso !== undefined) updateData.enforce_sso = updates.enforceSso
    if (updates.autoProvisionUsers !== undefined) updateData.auto_provision_users = updates.autoProvisionUsers
    if (updates.defaultRole !== undefined) updateData.default_role = updates.defaultRole
    if (updates.allowedDomains !== undefined) updateData.allowed_domains = updates.allowedDomains

    const { data: config, error: updateError } = await supabase
      .from('sso_configurations')
      .update(updateData)
      .eq('id', configId)
      .eq('organization_id', organizationId)
      .select()
      .single()

    if (updateError) {
      logger.error('[SSO] Failed to update configuration', { error: updateError.message })
      return NextResponse.json({ error: 'Failed to update SSO configuration' }, { status: 500 })
    }

    logger.debug('[SSO] Configuration updated', { configId, updates: Object.keys(updateData) })

    return NextResponse.json({
      success: true,
      configuration: config
    })
  } catch (error) {
    logger.error('[SSO] Unexpected error updating config', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Remove SSO configuration
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: organizationId } = await params
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const configId = searchParams.get('configId')

    if (!configId) {
      return NextResponse.json({ error: 'Configuration ID required' }, { status: 400 })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is org owner
    const { data: membership, error: memberError } = await supabase
      .from('organization_members')
      .select('role')
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .single()

    if (memberError || !membership || membership.role !== 'owner') {
      return NextResponse.json({ error: 'Only organization owners can delete SSO' }, { status: 403 })
    }

    const { error: deleteError } = await supabase
      .from('sso_configurations')
      .delete()
      .eq('id', configId)
      .eq('organization_id', organizationId)

    if (deleteError) {
      logger.error('[SSO] Failed to delete configuration', { error: deleteError.message })
      return NextResponse.json({ error: 'Failed to delete SSO configuration' }, { status: 500 })
    }

    logger.debug('[SSO] Configuration deleted', { configId, orgId: organizationId })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error('[SSO] Unexpected error deleting config', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
