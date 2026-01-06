import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

import { logger } from '@/lib/utils/logger'

// Helper to create supabase client inside handlers
const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const body = await request.text()
    const signature = request.headers.get('stripe-signature')
    
    logger.debug('🔍 Debug - signature:', signature ? 'present' : 'missing')
    if (!signature && !isTestMode) {
      logger.error('❌ Missing Stripe signature')
      return errorResponse('Missing signature' , 400)
    }

    // Verify webhook signature
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
    if (!webhookSecret) {
      logger.error('❌ Missing STRIPE_WEBHOOK_SECRET environment variable')
      return errorResponse('Webhook secret not configured' , 500)
    }

    // For testing purposes, allow requests without signature verification
    const isTestMode = process.env.NODE_ENV === 'development' || webhookSecret === 'whsec_test_secret_for_testing'
    logger.debug('🔍 Debug - NODE_ENV:', process.env.NODE_ENV)
    logger.debug('🔍 Debug - webhookSecret:', webhookSecret ? `${webhookSecret.substring(0, 20) }...` : 'undefined')
    logger.debug('🔍 Debug - isTestMode:', isTestMode)

    let event
    try {
      if (isTestMode) {
        logger.debug('🧪 Test mode: Skipping signature verification')
        event = JSON.parse(body)
      } else {
        // Parse the signature header
        const signatureParts = signature.split(',')
        const timestamp = signatureParts.find(part => part.startsWith('t='))?.split('=')[1]
        const signatureValue = signatureParts.find(part => part.startsWith('v1='))?.split('=')[1]
        
        if (!timestamp || !signatureValue) {
          logger.error('❌ Invalid signature format')
          return errorResponse('Invalid signature format' , 400)
        }

        // Create the signed payload
        const signedPayload = `${timestamp}.${body}`
        
        // Calculate expected signature
        const hmac = crypto.createHmac('sha256', webhookSecret)
        hmac.update(signedPayload, 'utf8')
        const expectedSignature = hmac.digest('hex')
        
        if (signatureValue !== expectedSignature) {
          logger.error('❌ Invalid Stripe signature')
          logger.error(`Expected: ${expectedSignature}`)
          logger.error(`Received: ${signatureValue}`)
          return errorResponse('Invalid signature' , 400)
        }

        event = JSON.parse(body)
      }
    } catch (err) {
      logger.error('❌ Error verifying webhook signature:', err)
      return errorResponse('Invalid webhook payload' , 400)
    }

    logger.debug(`🔔 Received Stripe webhook: ${event.type}`)

    // Log webhook for debugging
    await getSupabase()
      .from('webhook_logs')
      .insert({
        provider: 'stripe',
        event_type: event.type,
        payload: event,
        status: 'received'
      })

    // Find workflows that match this event type
    const { data: workflows, error: workflowsError } = await getSupabase()
      .from('workflows')
      .select('id, name, status, user_id')
      .eq('status', 'active')

    if (workflowsError) {
      logger.error('❌ Error fetching workflows:', workflowsError)
      return errorResponse('Failed to fetch workflows' , 500)
    }

    // Load nodes for matching workflows
    const matchingWorkflows: Array<{ id: string; name: string; nodes: any[] }> = []

    for (const workflow of workflows || []) {
      try {
        // Load nodes from normalized table
        const { data: dbNodes } = await getSupabase()
          .from('workflow_nodes')
          .select('*')
          .eq('workflow_id', workflow.id)
          .order('display_order')

        const nodes = (dbNodes || []).map((n: any) => ({
          id: n.id,
          type: n.node_type,
          position: { x: n.position_x, y: n.position_y },
          data: {
            type: n.node_type,
            label: n.label,
            config: n.config || {},
            isTrigger: n.is_trigger,
            providerId: n.provider_id
          }
        }))

        const hasMatchingTrigger = nodes.some((node: any) => {
          const triggerType = `stripe_trigger_${event.type.replace('.', '_')}`
          return node.type === triggerType || node.data?.type === triggerType
        })

        if (hasMatchingTrigger) {
          matchingWorkflows.push({ ...workflow, nodes })
        }
      } catch (err) {
        logger.error('❌ Error loading workflow nodes:', err)
      }
    }

    logger.debug(`📋 Found ${matchingWorkflows.length} matching workflows for event ${event.type}`)

    // Process each matching workflow
    const results = []
    for (const workflow of matchingWorkflows) {
      try {
        logger.debug(`🚀 Executing workflow: ${workflow.name} (${workflow.id})`)
        
        // Extract relevant data from the Stripe event
        const eventData = extractStripeEventData(event)
        
        // Execute the workflow with the event data
        const result = await executeWorkflow(workflow, eventData)
        
        results.push({
          workflowId: workflow.id,
          workflowName: workflow.name,
          success: true,
          result
        })

        logger.debug(`✅ Workflow ${workflow.name} executed successfully`)
      } catch (error) {
        logger.error(`❌ Error executing workflow ${workflow.name}:`, error)
        results.push({
          workflowId: workflow.id,
          workflowName: workflow.name,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    return jsonResponse({
      message: 'Stripe webhook processed successfully',
      event_type: event.type,
      workflows_processed: results.length,
      results
    })

  } catch (error) {
    logger.error('❌ Error processing Stripe webhook:', error)
    return errorResponse('Internal server error' , 500)
  }
}

export async function GET() {
  return jsonResponse({
    message: "Stripe webhook endpoint active",
    provider: "stripe",
    methods: ["POST", "GET"],
    timestamp: new Date().toISOString(),
    description: "Stripe webhook endpoint for payment and subscription events",
    setup: "Configure this URL in your Stripe Dashboard webhook settings",
    verification: "Uses HMAC SHA256 signature verification",
    recommended_events: [
      "customer.created",
      "payment_intent.succeeded", 
      "customer.subscription.created",
      "customer.subscription.deleted",
      "invoice.payment_failed"
    ]
  })
}

function extractStripeEventData(event: any) {
  const eventType = event.type
  const data = event.data?.object

  switch (eventType) {
    case 'customer.created':
      return {
        customerId: data.id,
        email: data.email,
        name: data.name,
        phone: data.phone,
        created: new Date(data.created * 1000).toISOString(),
        metadata: data.metadata
      }

    case 'payment_intent.succeeded':
      return {
        paymentIntentId: data.id,
        customerId: data.customer,
        amount: data.amount,
        currency: data.currency,
        status: data.status,
        created: new Date(data.created * 1000).toISOString(),
        metadata: data.metadata
      }

    case 'customer.subscription.created':
      return {
        subscriptionId: data.id,
        customerId: data.customer,
        status: data.status,
        currentPeriodStart: new Date(data.current_period_start * 1000).toISOString(),
        currentPeriodEnd: new Date(data.current_period_end * 1000).toISOString(),
        planId: data.items?.data?.[0]?.price?.id,
        created: new Date(data.created * 1000).toISOString()
      }

    case 'customer.subscription.deleted':
      return {
        subscriptionId: data.id,
        customerId: data.customer,
        status: data.status,
        canceledAt: data.canceled_at ? new Date(data.canceled_at * 1000).toISOString() : null,
        planId: data.items?.data?.[0]?.price?.id,
        reason: data.cancellation_reason
      }

    case 'invoice.payment_failed':
      return {
        invoiceId: data.id,
        customerId: data.customer,
        subscriptionId: data.subscription,
        amount: data.amount_due,
        currency: data.currency,
        attemptCount: data.attempt_count,
        nextPaymentAttempt: data.next_payment_attempt ? new Date(data.next_payment_attempt * 1000).toISOString() : null,
        failureReason: data.last_finalization_error?.message
      }

    default:
      return data
  }
}

async function executeWorkflow(workflow: any, eventData: any) {
  // This is a placeholder for workflow execution
  // In a real implementation, you would:
  // 1. Parse the workflow nodes and edges
  // 2. Execute the workflow engine
  // 3. Pass the event data to the trigger node
  // 4. Execute subsequent nodes in the workflow
  
  logger.debug(`🔄 Executing workflow ${workflow.id} with event data:`, eventData)
  
  // For now, just return success
  return {
    status: 'executed',
    eventData,
    timestamp: new Date().toISOString()
  }
}
