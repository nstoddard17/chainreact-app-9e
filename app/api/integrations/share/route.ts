import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/utils/supabase/server'
import { logger } from '@/lib/utils/logger'
import { handleCorsPreFlight, addCorsHeaders } from '@/lib/utils/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request, {
    allowCredentials: true,
    allowedMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  })
}

/**
 * GET /api/integrations/share?integration_id=xxx
 * Get sharing settings for an integration
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      return addCorsHeaders(response, request, { allowCredentials: true })
    }

    const { searchParams } = new URL(request.url)
    const integrationId = searchParams.get('integration_id')

    if (!integrationId) {
      const response = NextResponse.json({ error: 'integration_id is required' }, { status: 400 })
      return addCorsHeaders(response, request, { allowCredentials: true })
    }

    // Get the integration and verify ownership
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('id, user_id, provider, email, display_name, sharing_scope, shared_at')
      .eq('id', integrationId)
      .single()

    if (integrationError || !integration) {
      const response = NextResponse.json({ error: 'Integration not found' }, { status: 404 })
      return addCorsHeaders(response, request, { allowCredentials: true })
    }

    // Only owner can view full sharing details
    const isOwner = integration.user_id === user.id

    // Get shares for this integration
    const { data: shares, error: sharesError } = await supabase
      .from('integration_shares')
      .select(`
        id,
        shared_with_team_id,
        shared_with_user_id,
        permission_level,
        created_at,
        teams:shared_with_team_id (id, name),
        users:shared_with_user_id (id, email)
      `)
      .eq('integration_id', integrationId)

    if (sharesError) {
      logger.error('Error fetching shares:', sharesError)
    }

    const response = NextResponse.json({
      integration: {
        id: integration.id,
        provider: integration.provider,
        email: integration.email,
        display_name: integration.display_name,
        sharing_scope: integration.sharing_scope,
        shared_at: integration.shared_at,
        is_owner: isOwner,
      },
      shares: isOwner ? (shares || []) : [],
      can_manage: isOwner,
    })
    return addCorsHeaders(response, request, { allowCredentials: true })

  } catch (error: any) {
    logger.error('Error in GET /api/integrations/share:', error)
    const response = NextResponse.json({ error: error.message }, { status: 500 })
    return addCorsHeaders(response, request, { allowCredentials: true })
  }
}

/**
 * POST /api/integrations/share
 * Share an integration with teams/users or set sharing scope
 *
 * Body:
 * {
 *   integration_id: string,
 *   sharing_scope?: 'private' | 'team' | 'organization',
 *   share_with_teams?: string[],  // Team IDs
 *   share_with_users?: string[],  // User IDs
 *   permission_level?: 'use' | 'manage' | 'admin'
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      return addCorsHeaders(response, request, { allowCredentials: true })
    }

    const body = await request.json()
    const {
      integration_id,
      sharing_scope,
      share_with_teams = [],
      share_with_users = [],
      permission_level = 'use'
    } = body

    if (!integration_id) {
      const response = NextResponse.json({ error: 'integration_id is required' }, { status: 400 })
      return addCorsHeaders(response, request, { allowCredentials: true })
    }

    // Verify ownership
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('id, user_id, sharing_scope, shared_at')
      .eq('id', integration_id)
      .single()

    if (integrationError || !integration) {
      const response = NextResponse.json({ error: 'Integration not found' }, { status: 404 })
      return addCorsHeaders(response, request, { allowCredentials: true })
    }

    if (integration.user_id !== user.id) {
      const response = NextResponse.json({ error: 'You can only share your own integrations' }, { status: 403 })
      return addCorsHeaders(response, request, { allowCredentials: true })
    }

    // Update sharing scope if provided
    if (sharing_scope && sharing_scope !== integration.sharing_scope) {
      const updateData: any = { sharing_scope }

      // Set shared_at timestamp if sharing for the first time
      if (sharing_scope !== 'private' && !integration.shared_at) {
        updateData.shared_at = new Date().toISOString()
      }

      const { error: updateError } = await supabase
        .from('integrations')
        .update(updateData)
        .eq('id', integration_id)

      if (updateError) {
        logger.error('Error updating sharing scope:', updateError)
        const response = NextResponse.json({ error: 'Failed to update sharing scope' }, { status: 500 })
        return addCorsHeaders(response, request, { allowCredentials: true })
      }
    }

    // Add team shares
    if (share_with_teams.length > 0) {
      const teamShares = share_with_teams.map((teamId: string) => ({
        integration_id,
        shared_by: user.id,
        shared_with_team_id: teamId,
        permission_level,
      }))

      const { error: teamShareError } = await supabase
        .from('integration_shares')
        .upsert(teamShares, {
          onConflict: 'integration_id,shared_with_team_id',
          ignoreDuplicates: false,
        })

      if (teamShareError) {
        logger.error('Error sharing with teams:', teamShareError)
      }
    }

    // Add user shares
    if (share_with_users.length > 0) {
      const userShares = share_with_users.map((userId: string) => ({
        integration_id,
        shared_by: user.id,
        shared_with_user_id: userId,
        permission_level,
      }))

      const { error: userShareError } = await supabase
        .from('integration_shares')
        .upsert(userShares, {
          onConflict: 'integration_id,shared_with_user_id',
          ignoreDuplicates: false,
        })

      if (userShareError) {
        logger.error('Error sharing with users:', userShareError)
      }
    }

    logger.info('Integration shared successfully', {
      integrationId: integration_id,
      sharingScope: sharing_scope,
      teamsCount: share_with_teams.length,
      usersCount: share_with_users.length,
    })

    const response = NextResponse.json({ success: true })
    return addCorsHeaders(response, request, { allowCredentials: true })

  } catch (error: any) {
    logger.error('Error in POST /api/integrations/share:', error)
    const response = NextResponse.json({ error: error.message }, { status: 500 })
    return addCorsHeaders(response, request, { allowCredentials: true })
  }
}

/**
 * DELETE /api/integrations/share
 * Remove sharing from an integration
 *
 * Body:
 * {
 *   integration_id: string,
 *   share_id?: string,           // Specific share to remove
 *   remove_all?: boolean,        // Remove all shares and set to private
 *   team_id?: string,            // Remove share with specific team
 *   user_id?: string,            // Remove share with specific user
 * }
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      return addCorsHeaders(response, request, { allowCredentials: true })
    }

    const body = await request.json()
    const { integration_id, share_id, remove_all, team_id, user_id } = body

    if (!integration_id) {
      const response = NextResponse.json({ error: 'integration_id is required' }, { status: 400 })
      return addCorsHeaders(response, request, { allowCredentials: true })
    }

    // Verify ownership
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('id, user_id')
      .eq('id', integration_id)
      .single()

    if (integrationError || !integration) {
      const response = NextResponse.json({ error: 'Integration not found' }, { status: 404 })
      return addCorsHeaders(response, request, { allowCredentials: true })
    }

    if (integration.user_id !== user.id) {
      const response = NextResponse.json({ error: 'You can only manage your own integrations' }, { status: 403 })
      return addCorsHeaders(response, request, { allowCredentials: true })
    }

    // Remove all shares and set to private
    if (remove_all) {
      await supabase
        .from('integration_shares')
        .delete()
        .eq('integration_id', integration_id)

      await supabase
        .from('integrations')
        .update({ sharing_scope: 'private' })
        .eq('id', integration_id)

      logger.info('All shares removed', { integrationId: integration_id })
    }
    // Remove specific share by ID
    else if (share_id) {
      await supabase
        .from('integration_shares')
        .delete()
        .eq('id', share_id)
        .eq('integration_id', integration_id)

      logger.info('Share removed', { shareId: share_id })
    }
    // Remove share with specific team
    else if (team_id) {
      await supabase
        .from('integration_shares')
        .delete()
        .eq('integration_id', integration_id)
        .eq('shared_with_team_id', team_id)

      logger.info('Team share removed', { integrationId: integration_id, teamId: team_id })
    }
    // Remove share with specific user
    else if (user_id) {
      await supabase
        .from('integration_shares')
        .delete()
        .eq('integration_id', integration_id)
        .eq('shared_with_user_id', user_id)

      logger.info('User share removed', { integrationId: integration_id, userId: user_id })
    }

    const response = NextResponse.json({ success: true })
    return addCorsHeaders(response, request, { allowCredentials: true })

  } catch (error: any) {
    logger.error('Error in DELETE /api/integrations/share:', error)
    const response = NextResponse.json({ error: error.message }, { status: 500 })
    return addCorsHeaders(response, request, { allowCredentials: true })
  }
}
