/**
 * API Route: /api/analytics/cost-savings
 * Get daily cost savings breakdown
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getDailyCostSavings, getCostSavingsSummary } from '@/lib/workflows/ai-agent/promptAnalytics'
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
    const days = parseInt(searchParams.get('days') || '30')

    logger.debug('[Analytics API] Fetching cost savings', {
      userId: user.id,
      days
    })

    // Get daily breakdown
    const dailyData = await getDailyCostSavings(days)

    // Get overall summary
    const summary = await getCostSavingsSummary()

    return NextResponse.json({
      daily: dailyData,
      summary,
      period: {
        days,
        start: dailyData[dailyData.length - 1]?.date,
        end: dailyData[0]?.date
      }
    })

  } catch (error: any) {
    logger.error('[Analytics API] Error fetching cost savings:', error)
    return NextResponse.json(
      { error: 'Failed to fetch cost savings', details: error.message },
      { status: 500 }
    )
  }
}
