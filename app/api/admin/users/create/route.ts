import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseServiceClient } from '@/utils/supabase/server'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { sendWelcomeEmail } from '@/lib/services/resend'
import { type UserRole, ROLES } from '@/lib/utils/roles'

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
    const { email, password, full_name, username, role = 'free', send_welcome_email = true } = body

    // Validate required fields
    if (!email || !password) {
      return errorResponse('Email and password are required' , 400)
    }

    // Validate role
    if (!ROLES[role as UserRole]) {
      return errorResponse('Invalid role specified' , 400)
    }

    // Create user with Supabase Admin API
    const adminSupabase = await createSupabaseServiceClient()
    
    const { data: newUser, error: createError } = await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm for admin-created users
      user_metadata: {
        full_name,
        username,
        role,
      }
    })

    if (createError) {
      logger.error('Error creating user:', createError)
      return errorResponse(createError.message , 400)
    }

    if (!newUser.user) {
      return errorResponse('Failed to create user' , 500)
    }

    // Create user profile
    const { error: profileError } = await adminSupabase
      .from('user_profiles')
      .insert({
        id: newUser.user.id,
        username: username || null,
        full_name: full_name || null,
        role: role,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

    if (profileError) {
      logger.error('Error creating user profile:', profileError)
      // Try to cleanup the created user
      await adminSupabase.auth.admin.deleteUser(newUser.user.id)
      return errorResponse('Failed to create user profile' , 500)
    }

    // Send welcome email if requested
    if (send_welcome_email) {
      try {
        // Generate a sign-in link for the new user
        const { data: linkData } = await adminSupabase.auth.admin.generateLink({
          type: 'magiclink',
          email,
          options: {
            redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard`,
          },
        })

        await sendWelcomeEmail(
          {
            to: email,
            subject: 'Welcome to ChainReact - Your account has been created',
          },
          {
            username: full_name || username || undefined,
            confirmationUrl: linkData.properties?.action_link || `${process.env.NEXT_PUBLIC_SITE_URL}/auth/login`,
          }
        )
      } catch (emailError) {
        logger.error('Error sending welcome email:', emailError)
        // Don't fail the user creation if email fails
      }
    }

    // Return the created user data
    const { data: createdProfile } = await adminSupabase
      .from('user_profiles')
      .select('*')
      .eq('id', newUser.user.id)
      .single()

    return jsonResponse({
      success: true,
      user: {
        id: newUser.user.id,
        email: newUser.user.email,
        ...createdProfile,
        created_at: newUser.user.created_at,
      },
      message: 'User created successfully'
    })

  } catch (error) {
    logger.error('Error in user creation API:', error)
    return errorResponse('Internal server error' , 500)
  }
}