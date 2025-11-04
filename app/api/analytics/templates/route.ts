/**
 * API Route: /api/analytics/templates
 * Get template performance metrics
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getTemplatePerformance, getCostSavingsSummary } from '@/lib/workflows/ai-agent/promptAnalytics'
import { logger } from '@/lib/utils/logger'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {

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

    const isAdmin = profile?.admin === true

    logger.debug('[Analytics API] Fetching template performance', {
      userId: user.id,
      isAdmin
    })

    // Get template performance
    const templates = await getTemplatePerformance()

    // Get cost savings summary
    const summary = await getCostSavingsSummary()

    return NextResponse.json({
      templates,
      summary,
      isAdmin
    })

  } catch (error: any) {
    logger.error('[Analytics API] Error fetching template performance:', error)
    return NextResponse.json(
      { error: 'Failed to fetch template analytics', details: error.message },
      { status: 500 }
    )
  }
}
