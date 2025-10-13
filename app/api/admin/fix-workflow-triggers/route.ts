import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from '@supabase/supabase-js'
import { fixWorkflowTriggerNodes } from '@/lib/utils/fixWorkflowTriggerNodes'

import { logger } from '@/lib/utils/logger'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    // Get workflow ID from request body if provided
    const body = await request.json().catch(() => ({}))
    const workflowId = body.workflowId

    logger.debug('🔧 Running workflow trigger fix...')
    const result = await fixWorkflowTriggerNodes(workflowId)

    return jsonResponse(result)
  } catch (error) {
    logger.error('Error in fix-workflow-triggers API:', error)
    return errorResponse('Internal server error', 500, { details: error })
  }
}

export async function GET(request: NextRequest) {
  return jsonResponse({
    message: 'POST to this endpoint to fix workflow trigger nodes',
    usage: {
      fixAll: 'POST with empty body to fix all workflows',
      fixOne: 'POST with { "workflowId": "uuid" } to fix a specific workflow'
    }
  })
}