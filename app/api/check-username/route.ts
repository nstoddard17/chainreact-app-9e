import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { checkRateLimit, RateLimitPresets } from '@/lib/utils/rate-limit'

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

export async function POST(request: NextRequest) {
  // Rate limiting: 60 requests per minute (standard)
  const rateLimitResult = checkRateLimit(request, RateLimitPresets.standard)
  if (!rateLimitResult.success && rateLimitResult.response) {
    return rateLimitResult.response
  }

  try {
    const { username } = await request.json()

    if (!username || username.length < 3) {
      return jsonResponse({ available: false, error: 'Username too short' })
    }

    // Use service role to bypass RLS
    const { data, error } = await getSupabaseAdmin()
      .from('user_profiles')
      .select('username')
      .eq('username', username)
      .single()

    if (error) {
      // PGRST116 means no row found - username is available
      if (error.code === 'PGRST116') {
        return jsonResponse({ available: true })
      }
      // For any other error, log it but assume available
      logger.debug('Username check error:', error)
      return jsonResponse({ available: true })
    }

    // If we found data, username is taken
    return jsonResponse({ available: false })

  } catch (error) {
    logger.error('Username availability check failed:', error)
    // Default to available on error - actual constraint will be enforced at signup
    return jsonResponse({ available: true })
  }
}