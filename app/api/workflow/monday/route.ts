import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/utils/logger'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

/**
 * Monday.com Webhook Handler
 * Receives webhooks from Monday.com and triggers workflow execution
 */
export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const workflowId = searchParams.get('workflowId')

    if (!workflowId) {
      logger.warn('⚠️ Monday.com webhook missing workflowId')
      return errorResponse('Missing workflowId parameter', 400)
    }

    const payload = await req.json()

    logger.debug('🔔 Monday.com webhook received', {
      workflowId,
      event: payload.event
    })

    // Handle Monday.com challenge verification
    if (payload.challenge) {
      logger.debug('✅ Monday.com webhook challenge accepted')
      return NextResponse.json({ challenge: payload.challenge })
    }

    // Extract event data
    const event = payload.event
    if (!event) {
      logger.warn('⚠️ Monday.com webhook missing event data')
      return errorResponse('Missing event data', 400)
    }

    // Get workflow and trigger resources
    const { data: workflow } = await supabase
      .from('workflows')
      .select('user_id, name, status')
      .eq('id', workflowId)
      .single()

    if (!workflow) {
      logger.warn(`⚠️ Workflow ${workflowId} not found`)
      return errorResponse('Workflow not found', 404)
    }

    if (workflow.status !== 'active') {
      logger.debug(`ℹ️ Workflow ${workflowId} not active, ignoring webhook`)
      return NextResponse.json({ message: 'Workflow not active' }, { status: 200 })
    }

    // Get trigger resources for this workflow
    const { data: triggerResources } = await supabase
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('provider_id', 'monday')
      .eq('status', 'active')

    if (!triggerResources || triggerResources.length === 0) {
      logger.warn(`⚠️ No trigger resources found for workflow ${workflowId}`)
      return errorResponse('No trigger resources found', 404)
    }

    // Prepare trigger data based on event type
    const triggerData: Record<string, any> = {
      itemId: event.pulseId,
      itemName: event.pulseName,
      boardId: event.boardId,
      groupId: event.groupId,
      userId: event.userId,
      event: event
    }

    // Add event-specific data
    if (event.columnId) {
      triggerData.columnId = event.columnId
      triggerData.columnTitle = event.columnTitle
      triggerData.value = event.value
      triggerData.previousValue = event.previousValue
    }

    if (event.columnValues) {
      triggerData.columnValues = event.columnValues
    }

    // Queue workflow execution
    const { error: queueError } = await supabase
      .from('workflow_queue')
      .insert({
        workflow_id: workflowId,
        user_id: workflow.user_id,
        trigger_data: triggerData,
        status: 'pending',
        scheduled_for: new Date().toISOString()
      })

    if (queueError) {
      logger.error('❌ Failed to queue workflow execution:', queueError)
      return errorResponse('Failed to queue workflow', 500)
    }

    logger.info('✅ Monday.com webhook processed successfully', {
      workflowId,
      itemId: event.pulseId
    })

    return NextResponse.json({ message: 'Webhook processed successfully' }, { status: 200 })

  } catch (error: any) {
    logger.error('❌ Monday.com webhook error:', error)
    return errorResponse(
      error.message || 'Internal server error',
      500
    )
  }
}

/**
 * Handle GET requests (for webhook verification)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const challenge = searchParams.get('challenge')

  if (challenge) {
    logger.debug('✅ Monday.com webhook verification challenge accepted')
    return NextResponse.json({ challenge })
  }

  return NextResponse.json({
    message: 'Monday.com webhook endpoint',
    status: 'ready'
  })
}
