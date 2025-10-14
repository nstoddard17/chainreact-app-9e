import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseServiceClient } from '@/utils/supabase/server'
import { createSupabaseServerClient } from '@/utils/supabase/server'
import { type UserRole, ROLES } from '@/lib/utils/roles'

import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    
    // Verify admin authorization
    const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser()
    if (authError || !currentUser) {
      return errorResponse('Unauthorized' , 401)
    }

    // Get current user's profile to check admin role
    const { data: currentProfile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', currentUser.id)
      .single()

    if (currentProfile?.role !== 'admin') {
      return errorResponse('Admin access required' , 403)
    }

    const body = await request.json()
    const { userId, email, full_name, username, role, password, email_confirm } = body

    // Validate required fields
    if (!userId) {
      return errorResponse('User ID is required' , 400)
    }

    // Validate role if provided
    if (role && !ROLES[role as UserRole]) {
      return errorResponse('Invalid role specified' , 400)
    }

    const adminSupabase = await createSupabaseServiceClient()

    // Check if user exists
    const { data: existingUser } = await adminSupabase.auth.admin.getUserById(userId)
    if (!existingUser.user) {
      return errorResponse('User not found' , 404)
    }

    // Prepare updates for auth user
    const authUpdates: any = {}
    if (email) authUpdates.email = email
    if (password) authUpdates.password = password
    if (email_confirm !== undefined) authUpdates.email_confirm = email_confirm

    // Update auth user if there are auth-related changes
    if (Object.keys(authUpdates).length > 0) {
      const { error: authUpdateError } = await adminSupabase.auth.admin.updateUserById(
        userId,
        authUpdates
      )

      if (authUpdateError) {
        logger.error('Error updating auth user:', authUpdateError)
        return errorResponse(authUpdateError.message , 400)
      }
    }

    // Prepare updates for user profile
    const profileUpdates: any = {
      updated_at: new Date().toISOString(),
    }
    if (full_name !== undefined) profileUpdates.full_name = full_name
    if (username !== undefined) profileUpdates.username = username
    if (role !== undefined) profileUpdates.role = role

    // Update user profile
    const { error: profileUpdateError } = await adminSupabase
      .from('user_profiles')
      .update(profileUpdates)
      .eq('id', userId)

    if (profileUpdateError) {
      logger.error('Error updating user profile:', profileUpdateError)
      return errorResponse('Failed to update user profile' , 500)
    }

    // Get updated user data
    const { data: updatedProfile } = await adminSupabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single()

    const { data: updatedAuthUser } = await adminSupabase.auth.admin.getUserById(userId)

    return jsonResponse({
      success: true,
      user: {
        id: userId,
        email: updatedAuthUser.user?.email,
        ...updatedProfile,
        created_at: updatedAuthUser.user?.created_at,
      },
      message: 'User updated successfully'
    })

  } catch (error) {
    logger.error('Error in user update API:', error)
    return errorResponse('Internal server error' , 500)
  }
}