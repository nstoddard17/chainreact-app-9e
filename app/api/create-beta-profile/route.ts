import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'

import { logger } from '@/lib/utils/logger'

// Create a service role client to bypass RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

export async function POST(request: Request) {
  try {
    const { userId, username, fullName, email } = await request.json()

    if (!userId || !username) {
      return errorResponse('Missing required fields' , 400)
    }

    // First check if profile already exists
    const { data: existingProfile } = await supabaseAdmin
      .from('user_profiles')
      .select('id')
      .eq('id', userId)
      .single()

    let profileResult

    if (existingProfile) {
      // Update existing profile
      profileResult = await supabaseAdmin
        .from('user_profiles')
        .update({
          username: username.toLowerCase().trim(),
          full_name: fullName,
          role: 'beta-pro',
          updated_at: new Date().toISOString()
        })
        .eq('id', userId)
        .select()
        .single()
    } else {
      // Create new profile
      profileResult = await supabaseAdmin
        .from('user_profiles')
        .insert({
          id: userId,
          username: username.toLowerCase().trim(),
          full_name: fullName,
          role: 'beta-pro',
          provider: 'email',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single()
    }

    if (profileResult.error) {
      logger.error('Profile creation/update error:', profileResult.error)
      return errorResponse(profileResult.error.message , 500)
    }

    // Update beta tester status to converted (if they exist and haven't already converted)
    if (email) {
      try {
        const { error } = await supabaseAdmin
          .from('beta_testers')
          .update({
            status: 'converted',
            conversion_date: new Date().toISOString()
          })
          .eq('email', email)
          .neq('status', 'converted') // Update any status except already converted

        // Don't throw error if update fails - it's not critical for signup
        if (error) {
          logger.debug('Note: Could not update beta tester status (non-critical):', error.message)
        }
      } catch (err) {
        // Log but don't fail the signup
        logger.debug('Note: Beta tester status update skipped (non-critical):', err)
      }
    }

    return jsonResponse({
      success: true,
      profile: profileResult.data
    })

  } catch (error) {
    logger.error('Error in create-beta-profile:', error)
    return errorResponse('Failed to create profile' , 500)
  }
}