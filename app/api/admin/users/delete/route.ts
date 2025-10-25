import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseServiceClient } from '@/utils/supabase/server'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'

import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    
    // Verify admin authorization
    const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser()
    if (authError || !currentUser) {
      return errorResponse('Unauthorized' , 401)
    }

    // Get current user's profile to check admin status
    const { data: currentProfile } = await supabase
      .from('user_profiles')
      .select('admin')
      .eq('id', currentUser.id)
      .single()

    if (currentProfile?.admin !== true) {
      return errorResponse('Admin access required' , 403)
    }

    const body = await request.json()
    const { userId, deleteData = false } = body

    // Validate required fields
    if (!userId) {
      return errorResponse('User ID is required' , 400)
    }

    // Prevent admin from deleting themselves
    if (userId === currentUser.id) {
      return errorResponse('Cannot delete your own account' , 400)
    }

    const adminSupabase = await createSupabaseServiceClient()

    // Check if user exists
    const { data: existingUser } = await adminSupabase.auth.admin.getUserById(userId)
    if (!existingUser.user) {
      return errorResponse('User not found' , 404)
    }

    // Get user profile to check if they're an admin
    const { data: userProfile } = await adminSupabase
      .from('user_profiles')
      .select('admin, full_name, username')
      .eq('id', userId)
      .single()

    // Prevent deletion of other admin accounts (optional safety measure)
    if (userProfile?.admin === true) {
      return errorResponse('Cannot delete admin accounts' , 400)
    }

    // If deleteData is false, just disable the user instead of deleting
    if (!deleteData) {
      // Disable the user by updating their metadata
      const { error: disableError } = await adminSupabase.auth.admin.updateUserById(
        userId,
        {
          user_metadata: {
            ...existingUser.user.user_metadata,
            disabled: true,
            disabled_at: new Date().toISOString(),
            disabled_by: currentUser.id,
          }
        }
      )

      if (disableError) {
        logger.error('Error disabling user:', disableError)
        return errorResponse(disableError.message , 400)
      }

      // Update profile to mark as disabled
      const { error: profileUpdateError } = await adminSupabase
        .from('user_profiles')
        .update({
          updated_at: new Date().toISOString(),
          // You might want to add a disabled field to your profiles table
        })
        .eq('id', userId)

      if (profileUpdateError) {
        logger.error('Error updating user profile:', profileUpdateError)
      }

      return jsonResponse({
        success: true,
        message: 'User account disabled successfully',
        action: 'disabled'
      })
    }

    // Hard delete: Remove user data first, then delete auth user
    try {
      // Delete related data in proper order (foreign key constraints)
      
      // Delete workflow executions
      await adminSupabase
        .from('workflow_executions')
        .delete()
        .eq('user_id', userId)

      // Delete workflows
      await adminSupabase
        .from('workflows')
        .delete()
        .eq('user_id', userId)

      // Delete integrations
      await adminSupabase
        .from('integrations')
        .delete()
        .eq('user_id', userId)

      // Delete organization memberships
      await adminSupabase
        .from('organization_members')
        .delete()
        .eq('user_id', userId)

      // Delete organizations owned by user
      await adminSupabase
        .from('organizations')
        .delete()
        .eq('owner_id', userId)

      // Delete user profile
      await adminSupabase
        .from('user_profiles')
        .delete()
        .eq('id', userId)

      // Finally, delete the auth user
      const { error: deleteError } = await adminSupabase.auth.admin.deleteUser(userId)

      if (deleteError) {
        logger.error('Error deleting auth user:', deleteError)
        return errorResponse(deleteError.message , 400)
      }

      return jsonResponse({
        success: true,
        message: 'User and all associated data deleted successfully',
        action: 'deleted'
      })

    } catch (dataDeleteError) {
      logger.error('Error deleting user data:', dataDeleteError)
      return errorResponse('Failed to delete user data' , 500)
    }

  } catch (error) {
    logger.error('Error in user deletion API:', error)
    return errorResponse('Internal server error' , 500)
  }
}