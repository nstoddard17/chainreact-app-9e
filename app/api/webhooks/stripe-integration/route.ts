import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

import { logger } from '@/lib/utils/logger'

// This webhook handles Stripe integration triggers for workflows
// It processes events from users' connected Stripe accounts

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    logger.debug('[Stripe Integration Webhook] Received webhook for workflow triggers')
    
    const body = await request.text()
    const signature = request.headers.get('stripe-signature')
    
    // Use separate webhook secret for integration webhooks
    const webhookSecret = process.env.STRIPE_INTEGRATION_WEBHOOK_SECRET || process.env.STRIPE_WEBHOOK_SECRET
    
    if (!webhookSecret) {
      logger.error('❌ Missing STRIPE_INTEGRATION_WEBHOOK_SECRET environment variable')
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
    }

    // For testing purposes
    const isTestMode = process.env.NODE_ENV === 'development' && !signature
    
    if (!signature && !isTestMode) {
      logger.error('❌ Missing Stripe signature')
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
    }

    let event
    try {
      if (isTestMode) {
        logger.debug('🧪 Test mode: Skipping signature verification')
        event = JSON.parse(body)
      } else {
        // Verify webhook signature
        const signatureParts = signature!.split(',')
        const timestamp = signatureParts.find(part => part.startsWith('t='))?.split('=')[1]
        const signatureValue = signatureParts.find(part => part.startsWith('v1='))?.split('=')[1]
        
        if (!timestamp || !signatureValue) {
          logger.error('❌ Invalid signature format')
          return NextResponse.json({ error: 'Invalid signature format' }, { status: 400 })
        }
        
        // Verify the signature
        const signedPayload = `${timestamp}.${body}`
        const expectedSignature = crypto
          .createHmac('sha256', webhookSecret)
          .update(signedPayload)
          .digest('hex')
        
        if (signatureValue !== expectedSignature) {
          logger.error('❌ Signature verification failed')
          return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
        }
        
        event = JSON.parse(body)
      }
    } catch (error) {
      logger.error('❌ Failed to parse webhook body:', error)
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    logger.debug(`📦 [Stripe Integration] Processing event: ${event.type}`)
    logger.debug('Event data:', JSON.stringify(event.data, null, 2))

    // Store webhook event for workflow processing
    const webhookData = {
      provider: 'stripe',
      event_type: event.type,
      event_id: event.id,
      payload: event,
      received_at: new Date().toISOString()
    }

    // Store in webhook_events table for workflow triggers
    const { data, error } = await supabase
      .from('webhook_events')
      .insert(webhookData)
      .select()
      .single()

    if (error) {
      logger.error('❌ Failed to store webhook event:', error)
      return NextResponse.json({ error: 'Failed to process webhook' }, { status: 500 })
    }

    logger.debug('✅ Webhook event stored:', data.id)

    // Trigger workflow execution for matching workflows
    // This would be handled by a separate workflow execution service
    await triggerWorkflowsForEvent(event, data.id)

    return NextResponse.json({ received: true, event_id: data.id })
  } catch (error: any) {
    logger.error('❌ Webhook handler error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function triggerWorkflowsForEvent(event: any, eventId: string) {
  try {
    // Find workflows that are triggered by this Stripe event type
    const { data: workflows, error } = await supabase
      .from('workflows')
      .select('*')
      .eq('trigger_type', 'stripe')
      .eq('trigger_event', event.type)
      .eq('status', 'active')

    if (error) {
      logger.error('Failed to find matching workflows:', error)
      return
    }

    if (!workflows || workflows.length === 0) {
      logger.debug('No matching workflows found for event:', event.type)
      return
    }

    logger.debug(`Found ${workflows.length} matching workflows`)

    // Queue workflow executions
    for (const workflow of workflows) {
      const { error: execError } = await supabase
        .from('workflow_executions')
        .insert({
          workflow_id: workflow.id,
          trigger_type: 'webhook',
          trigger_event_id: eventId,
          status: 'pending',
          input_data: event.data,
          created_at: new Date().toISOString()
        })

      if (execError) {
        logger.error(`Failed to queue workflow ${workflow.id}:`, execError)
      } else {
        logger.debug(`Queued workflow ${workflow.id} for execution`)
      }
    }
  } catch (error) {
    logger.error('Error triggering workflows:', error)
  }
}