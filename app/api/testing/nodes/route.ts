/**
 * API Route: /api/testing/nodes
 * Run automated tests on all workflow nodes
 * Admin only
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { testAllNodes, testProvider } from '@/lib/workflows/testing/NodeTestRunner'
import { logger } from '@/lib/utils/logger'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

export async function POST(request: NextRequest) {
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

    if (!profile?.admin) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      )
    }

    // Get request body
    const body = await request.json().catch(() => ({}))
    const {
      provider,
      testRealAPIs = false,
      maxParallel = 10,
      timeout = 30000
    } = body

    logger.info('[NodeTesting API] Starting node tests', {
      userId: user.id,
      provider: provider || 'all',
      testRealAPIs,
      maxParallel,
      timeout
    })

    // Run tests
    let summary
    if (provider) {
      summary = await testProvider(provider, { testRealAPIs, maxParallel, timeout })
    } else {
      summary = await testAllNodes({ testRealAPIs, maxParallel, timeout })
    }

    logger.info('[NodeTesting API] Tests complete', {
      totalNodes: summary.totalNodes,
      passed: summary.passed,
      failed: summary.failed,
      passRate: summary.passRate.toFixed(2) + '%',
      duration: summary.duration + 'ms'
    })

    return NextResponse.json({
      success: true,
      summary,
      metadata: {
        testedAt: new Date().toISOString(),
        testedBy: user.id,
        provider: provider || 'all'
      }
    })

  } catch (error: any) {
    logger.error('[NodeTesting API] Error running tests:', error)
    return NextResponse.json(
      { error: 'Failed to run node tests', details: error.message },
      { status: 500 }
    )
  }
}

/**
 * GET /api/testing/nodes
 * Get test results from last run (if cached)
 */
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

    if (!profile?.admin) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      )
    }

    // For now, just run a quick validation test (no real API calls)
    logger.info('[NodeTesting API] Running quick validation test')

    const summary = await testAllNodes({ testRealAPIs: false, maxParallel: 50 })

    return NextResponse.json({
      success: true,
      summary,
      metadata: {
        testedAt: new Date().toISOString(),
        mode: 'validation_only'
      }
    })

  } catch (error: any) {
    logger.error('[NodeTesting API] Error fetching test results:', error)
    return NextResponse.json(
      { error: 'Failed to fetch test results', details: error.message },
      { status: 500 }
    )
  }
}
