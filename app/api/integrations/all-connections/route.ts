import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/utils/logger'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

/**
 * GET /api/integrations/all-connections
 *
 * Fetches all integrations (connections) for a specific provider across all workspaces
 * (personal, team, and organization) that the current user has access to.
 *
 * Query Parameters:
 * - provider: The provider ID (e.g., 'gmail', 'slack', 'notion')
 *
 * Returns:
 * Array of connections with:
 * - id: Integration ID
 * - provider: Provider ID
 * - status: Connection status
 * - workspace_type: 'personal' | 'team' | 'organization'
 * - workspace_id: Workspace ID (null for personal)
 * - email: User email (top-level column, fallback to metadata)
 * - username: Username (top-level column, fallback to metadata)
 * - account_name: Account name (top-level column, fallback to metadata)
 * - avatar_url: Profile picture URL (top-level column, fallback to metadata)
 * - provider_user_id: OAuth provider's user ID (top-level column, fallback to metadata)
 * - created_at: Connection creation date
 * - expires_at: Token expiration date
 * - user_permission: User's permission level for this connection
 */
export async function GET(request: NextRequest) {
  try {
    // Get the current user from authorization header
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Authorization header required' },
        { status: 401 }
      )
    }

    // Extract token from Bearer header
    const token = authHeader.replace('Bearer ', '')

    // Verify the user with Supabase
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 }
      )
    }

    // Get provider from query params
    const { searchParams } = new URL(request.url)
    const provider = searchParams.get('provider')

    if (!provider) {
      return NextResponse.json(
        { error: 'Provider parameter is required' },
        { status: 400 }
      )
    }

    logger.debug(`[AllConnections] Fetching all connections for provider: ${provider}`, {
      userId: user.id,
      provider
    })

    // Fetch all integrations for this provider that the user has access to
    // This includes:
    // 1. Personal integrations (user_id = current user)
    // 2. Team integrations (user is member of the team)
    // 3. Organization integrations (user is member of the organization)

    // Try with new columns first (added in migration 20251110000000)
    let { data: integrations, error: integrationsError } = await supabase
      .from('integrations')
      .select(`
        id,
        provider,
        status,
        workspace_type,
        workspace_id,
        email,
        username,
        account_name,
        avatar_url,
        provider_user_id,
        metadata,
        created_at,
        expires_at,
        user_id,
        connected_by
      `)
      .eq('provider', provider)
      .in('status', ['connected', 'error', 'pending'])
      .order('created_at', { ascending: false })

    // If query fails due to missing columns, try without them (backward compatibility)
    if (integrationsError && integrationsError.message?.includes('column')) {
      logger.debug('[AllConnections] New columns not available, using legacy query', {
        error: integrationsError.message
      })

      const fallbackResult = await supabase
        .from('integrations')
        .select(`
          id,
          provider,
          status,
          workspace_type,
          workspace_id,
          metadata,
          created_at,
          expires_at,
          user_id,
          connected_by
        `)
        .eq('provider', provider)
        .in('status', ['connected', 'error', 'pending'])
        .order('created_at', { ascending: false })

      integrations = fallbackResult.data
      integrationsError = fallbackResult.error
    }

    if (integrationsError) {
      logger.error('[AllConnections] Error fetching integrations:', {
        error: integrationsError.message,
        code: integrationsError.code,
        details: integrationsError.details,
        hint: integrationsError.hint,
        provider
      })
      return NextResponse.json(
        { error: `Failed to fetch connections: ${integrationsError.message}` },
        { status: 500 }
      )
    }

    if (!integrations || integrations.length === 0) {
      logger.debug('[AllConnections] No connections found', { provider })
      return NextResponse.json({ connections: [] })
    }

    // Filter integrations based on workspace access
    // Get user's team memberships
    const { data: teamMemberships } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', user.id)

    const teamIds = teamMemberships?.map(tm => tm.team_id) || []

    // Get user's organization memberships
    const { data: orgMemberships } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)

    const orgIds = orgMemberships?.map(om => om.organization_id) || []

    // Filter integrations based on access
    const accessibleIntegrations = integrations.filter(integration => {
      // Personal integrations - user must be the owner
      if (integration.workspace_type === 'personal') {
        return integration.user_id === user.id
      }

      // Team integrations - user must be a member of the team
      if (integration.workspace_type === 'team') {
        return integration.workspace_id && teamIds.includes(integration.workspace_id)
      }

      // Organization integrations - user must be a member of the organization
      if (integration.workspace_type === 'organization') {
        return integration.workspace_id && orgIds.includes(integration.workspace_id)
      }

      return false
    })

    // Get permission levels for each integration
    const integrationsWithPermissions = await Promise.all(
      accessibleIntegrations.map(async (integration) => {
        // For personal integrations, owner has admin permission
        if (integration.workspace_type === 'personal') {
          return {
            ...integration,
            user_permission: 'admin' as const
          }
        }

        // For team/org integrations, check integration_permissions table
        const { data: permission } = await supabase
          .from('integration_permissions')
          .select('permission')
          .eq('integration_id', integration.id)
          .eq('user_id', user.id)
          .single()

        return {
          ...integration,
          user_permission: permission?.permission || 'use' as const
        }
      })
    )

    // Transform integrations into connection format
    const connections = integrationsWithPermissions.map(integration => ({
      id: integration.id,
      provider: integration.provider,
      status: integration.status,
      workspace_type: integration.workspace_type,
      workspace_id: integration.workspace_id,
      // Use top-level columns (added in migration 20251110000000) if available
      // Fall back to metadata for backward compatibility
      email: integration.email ?? integration.metadata?.email ?? integration.metadata?.userEmail ?? null,
      username: integration.username ?? integration.metadata?.username ?? integration.metadata?.name ?? null,
      account_name: integration.account_name ?? integration.metadata?.account_name ?? integration.metadata?.accountName ?? null,
      avatar_url: integration.avatar_url ?? integration.metadata?.avatar_url ?? integration.metadata?.picture ?? null,
      provider_user_id: integration.provider_user_id ?? integration.metadata?.provider_user_id ?? null,
      created_at: integration.created_at,
      expires_at: integration.expires_at,
      user_permission: integration.user_permission,
      connected_by: integration.connected_by
    }))

    logger.debug(`[AllConnections] Found ${connections.length} accessible connections`, {
      provider,
      connectionIds: connections.map(c => c.id)
    })

    return NextResponse.json({ connections })

  } catch (error: any) {
    logger.error('[AllConnections] Unexpected error:', {
      error: error.message,
      stack: error.stack
    })
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
