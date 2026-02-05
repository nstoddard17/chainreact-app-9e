import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { UserDeletionService } from '@/lib/services/userDeletionService'

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

    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!
    )

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

    // Hard delete: Remove all user data and auth user
    try {
      const deletionService = new UserDeletionService(adminSupabase)
      const result = await deletionService.deleteUser(userId, 'full')

      if (result.errors.length > 0) {
        logger.warn(`[Admin Delete] Completed with ${result.errors.length} errors:`, result.errors)
      }

      return jsonResponse({
        success: true,
        message: 'User and all associated data deleted successfully',
        action: 'deleted',
        tablesProcessed: result.tablesProcessed,
        errors: result.errors.length > 0 ? result.errors : undefined
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