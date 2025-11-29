/**
 * Integration Providers API
 *
 * Returns list of all testable integrations auto-discovered from availableNodes
 */

import { type NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/utils/admin-auth'
import { autoDiscoverTests } from '@/lib/workflows/test-utils/auto-discover-tests'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const authResult = await requireAdmin()
  if (!authResult.isAdmin) {
    return authResult.response
  }

  try {
    // Auto-discover all testable integrations
    const providers = autoDiscoverTests()

    return NextResponse.json({
      providers,
      totalProviders: providers.length,
      totalActions: providers.reduce((sum, p) => sum + p.actions.length, 0),
      totalTriggers: providers.reduce((sum, p) => sum + p.triggers.length, 0),
      totalTests: providers.reduce((sum, p) => sum + p.actions.length + p.triggers.length, 0),
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
