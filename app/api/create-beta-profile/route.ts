import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { ensureUserProfile } from '@/lib/auth/ensureUserProfile'

import { logger } from '@/lib/utils/logger'

// Lazily initialized Supabase admin client to avoid build-time errors
let supabaseAdmin: SupabaseClient | null = null

function getSupabaseAdmin(): SupabaseClient {
  if (!supabaseAdmin) {
    supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )
  }
  return supabaseAdmin
}

export async function POST(request: Request) {
  try {
    const { userId, username, fullName, email } = await request.json()

    if (!userId || !username) {
      return errorResponse('Missing required fields' , 400)
    }

    const { profile } = await ensureUserProfile(
      getSupabaseAdmin(),
      userId,
      {
        username: username.toLowerCase().trim(),
        full_name: fullName,
        role: 'beta-pro',
        provider: 'email',
      },
      { applyOverridesToExisting: true },
    )

    // Update beta tester status to converted (if they exist and haven't already converted)
    if (email) {
      try {
        const { error } = await getSupabaseAdmin()
          .from('beta_testers')
          .update({
            status: 'converted',
            conversion_date: new Date().toISOString()
          })
          .eq('email', email)
          .neq('status', 'converted') // Update any status except already converted

        // Don't throw error if update fails - it's not critical for signup
        if (error) {
          logger.info('Note: Could not update beta tester status (non-critical):', error.message)
        }
      } catch (err) {
        // Log but don't fail the signup
        logger.info('Note: Beta tester status update skipped (non-critical):', err)
      }
    }

    return jsonResponse({
      success: true,
      profile
    })

  } catch (error) {
    logger.error('Error in create-beta-profile:', error)
    return errorResponse('Failed to create profile' , 500)
  }
}