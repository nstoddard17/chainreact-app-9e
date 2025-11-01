import { NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient, createSupabaseServiceClient } from "@/utils/supabase/server"
import { errorResponse, successResponse } from '@/lib/utils/api-response'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'

/**
 * GET /api/workflows/[id]/permissions
 *
 * Get all permissions for a workflow
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const { id: workflowId } = params

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    // Use service client to fetch permissions (bypass RLS)
    const supabaseService = await createSupabaseServiceClient()

    // Check if user has admin permission on this workflow
    const { data: userPermission } = await supabaseService
      .from('workflow_permissions')
      .select('permission')
      .eq('workflow_id', workflowId)
      .eq('user_id', user.id)
      .single()

    if (!userPermission || userPermission.permission !== 'admin') {
      return errorResponse("You must be an admin to view permissions", 403)
    }

    // Fetch all permissions with user details
    const { data: permissions, error } = await supabaseService
      .from('workflow_permissions')
      .select(`
        id,
        user_id,
        permission,
        granted_at,
        granted_by,
        user:user_profiles!user_id(
          id,
          email,
          username,
          full_name,
          avatar_url
        ),
        granted_by_user:user_profiles!granted_by(
          username,
          full_name
        )
      `)
      .eq('workflow_id', workflowId)
      .order('granted_at', { ascending: false })

    if (error) {
      logger.error('[API] Error fetching workflow permissions:', error)
      return errorResponse(error.message, 500)
    }

    return successResponse({ permissions })

  } catch (error: any) {
    logger.error('[API] Exception in GET /api/workflows/[id]/permissions:', error)
    return errorResponse("Internal server error", 500)
  }
}

/**
 * POST /api/workflows/[id]/permissions
 *
 * Grant permission to a user for a workflow
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const { id: workflowId } = params

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    const body = await request.json()
    const { user_id, permission } = body

    // Validate permission level
    if (!['use', 'manage', 'admin'].includes(permission)) {
      return errorResponse("Invalid permission level. Must be 'use', 'manage', or 'admin'", 400)
    }

    // Use service client to bypass RLS
    const supabaseService = await createSupabaseServiceClient()

    // Check if requester has admin permission
    const { data: requesterPermission } = await supabaseService
      .from('workflow_permissions')
      .select('permission')
      .eq('workflow_id', workflowId)
      .eq('user_id', user.id)
      .single()

    if (!requesterPermission || requesterPermission.permission !== 'admin') {
      return errorResponse("You must be an admin to grant permissions", 403)
    }

    // Check if permission already exists
    const { data: existingPermission } = await supabaseService
      .from('workflow_permissions')
      .select('id, permission')
      .eq('workflow_id', workflowId)
      .eq('user_id', user_id)
      .single()

    if (existingPermission) {
      // Update existing permission
      const { error: updateError } = await supabaseService
        .from('workflow_permissions')
        .update({
          permission,
          granted_by: user.id,
          granted_at: new Date().toISOString()
        })
        .eq('id', existingPermission.id)

      if (updateError) {
        logger.error('[API] Error updating permission:', updateError)
        return errorResponse(updateError.message, 500)
      }

      logger.debug('[API] Updated workflow permission:', {
        workflowId,
        userId: user_id,
        permission
      })

      return successResponse({
        message: 'Permission updated successfully',
        updated: true
      })
    } else {
      // Create new permission
      const { error: insertError } = await supabaseService
        .from('workflow_permissions')
        .insert({
          workflow_id: workflowId,
          user_id,
          permission,
          granted_by: user.id
        })

      if (insertError) {
        logger.error('[API] Error creating permission:', insertError)
        return errorResponse(insertError.message, 500)
      }

      logger.debug('[API] Granted workflow permission:', {
        workflowId,
        userId: user_id,
        permission
      })

      return successResponse({
        message: 'Permission granted successfully',
        created: true
      })
    }

  } catch (error: any) {
    logger.error('[API] Exception in POST /api/workflows/[id]/permissions:', error)
    return errorResponse("Internal server error", 500)
  }
}

/**
 * DELETE /api/workflows/[id]/permissions
 *
 * Revoke permission from a user for a workflow
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const { id: workflowId } = params

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse("Unauthorized", 401)
    }

    const { searchParams } = new URL(request.url)
    const userIdToRevoke = searchParams.get('user_id')

    if (!userIdToRevoke) {
      return errorResponse("user_id query parameter is required", 400)
    }

    // Use service client to bypass RLS
    const supabaseService = await createSupabaseServiceClient()

    // Check if requester has admin permission
    const { data: requesterPermission } = await supabaseService
      .from('workflow_permissions')
      .select('permission')
      .eq('workflow_id', workflowId)
      .eq('user_id', user.id)
      .single()

    if (!requesterPermission || requesterPermission.permission !== 'admin') {
      return errorResponse("You must be an admin to revoke permissions", 403)
    }

    // Don't allow removing your own admin permission if you're the only admin
    if (userIdToRevoke === user.id) {
      const { data: adminCount } = await supabaseService
        .from('workflow_permissions')
        .select('id', { count: 'exact', head: true })
        .eq('workflow_id', workflowId)
        .eq('permission', 'admin')

      if (adminCount && adminCount === 1) {
        return errorResponse("Cannot remove the last admin from a workflow", 400)
      }
    }

    // Delete the permission
    const { error: deleteError } = await supabaseService
      .from('workflow_permissions')
      .delete()
      .eq('workflow_id', workflowId)
      .eq('user_id', userIdToRevoke)

    if (deleteError) {
      logger.error('[API] Error revoking permission:', deleteError)
      return errorResponse(deleteError.message, 500)
    }

    logger.debug('[API] Revoked workflow permission:', {
      workflowId,
      userId: userIdToRevoke
    })

    return successResponse({ message: 'Permission revoked successfully' })

  } catch (error: any) {
    logger.error('[API] Exception in DELETE /api/workflows/[id]/permissions:', error)
    return errorResponse("Internal server error", 500)
  }
}
