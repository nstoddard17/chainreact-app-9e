/**
 * API Route: /api/analytics/template-candidates
 * Get prompts that appear frequently and should become templates
 * Admin only
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTemplateCandidates } from '@/lib/workflows/ai-agent/promptAnalytics'
import { logger } from '@/lib/utils/logger'

export async function GET(request: NextRequest) {
  try {
    // Create client inside handler to avoid build-time initialization
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!
    )

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('admin')
      .eq('id', user.id)
      .single()

    if (!profile?.admin) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      )
    }

    // Get query params
    const { searchParams } = new URL(request.url)
    const minFrequency = parseInt(searchParams.get('min_frequency') || '3')

    logger.debug('[Analytics API] Fetching template candidates', {
      userId: user.id,
      minFrequency
    })

    // Get template candidates
    const candidates = await getTemplateCandidates(minFrequency)

    return NextResponse.json({
      candidates,
      count: candidates.length,
      minFrequency
    })

  } catch (error: any) {
    logger.error('[Analytics API] Error fetching template candidates:', error)
    return NextResponse.json(
      { error: 'Failed to fetch template candidates', details: error.message },
      { status: 500 }
    )
  }
}
