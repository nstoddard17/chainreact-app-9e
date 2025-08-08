import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const body = await request.text()
    const signature = request.headers.get('stripe-signature')
    
    if (!signature) {
      console.error('❌ Missing Stripe signature')
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
    }

    // Verify webhook signature
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
    if (!webhookSecret) {
      console.error('❌ Missing STRIPE_WEBHOOK_SECRET environment variable')
      return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
    }

    let event
    try {
      const hmac = crypto.createHmac('sha256', webhookSecret)
      hmac.update(body, 'utf8')
      const expectedSignature = `whsec_${hmac.digest('hex')}`
      
      if (signature !== expectedSignature) {
        console.error('❌ Invalid Stripe signature')
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
      }

      event = JSON.parse(body)
    } catch (err) {
      console.error('❌ Error verifying webhook signature:', err)
      return NextResponse.json({ error: 'Invalid webhook payload' }, { status: 400 })
    }

    console.log(`🔔 Received Stripe webhook: ${event.type}`)

    // Log webhook for debugging
    await supabase
      .from('webhook_logs')
      .insert({
        provider: 'stripe',
        event_type: event.type,
        payload: event,
        status: 'received'
      })

    // Find workflows that match this event type
    const { data: workflows, error: workflowsError } = await supabase
      .from('workflows')
      .select(`
        id,
        name,
        nodes,
        edges,
        is_active
      `)
      .eq('is_active', true)

    if (workflowsError) {
      console.error('❌ Error fetching workflows:', workflowsError)
      return NextResponse.json({ error: 'Failed to fetch workflows' }, { status: 500 })
    }

    const matchingWorkflows = workflows?.filter(workflow => {
      try {
        const nodes = workflow.nodes || []
        return nodes.some((node: any) => {
          const triggerType = `stripe_trigger_${event.type.replace('.', '_')}`
          return node.type === triggerType
        })
      } catch (err) {
        console.error('❌ Error parsing workflow nodes:', err)
        return false
      }
    }) || []

    console.log(`📋 Found ${matchingWorkflows.length} matching workflows for event ${event.type}`)

    // Process each matching workflow
    const results = []
    for (const workflow of matchingWorkflows) {
      try {
        console.log(`🚀 Executing workflow: ${workflow.name} (${workflow.id})`)
        
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

        console.log(`✅ Workflow ${workflow.name} executed successfully`)
      } catch (error) {
        console.error(`❌ Error executing workflow ${workflow.name}:`, error)
        results.push({
          workflowId: workflow.id,
          workflowName: workflow.name,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    return NextResponse.json({
      message: 'Stripe webhook processed successfully',
      event_type: event.type,
      workflows_processed: results.length,
      results
    })

  } catch (error) {
    console.error('❌ Error processing Stripe webhook:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
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
  
  console.log(`🔄 Executing workflow ${workflow.id} with event data:`, eventData)
  
  // For now, just return success
  return {
    status: 'executed',
    eventData,
    timestamp: new Date().toISOString()
  }
}
