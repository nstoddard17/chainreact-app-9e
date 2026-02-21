import { ActionResult } from '../core/executeWait'
import { logger } from '@/lib/utils/logger'

/**
 * Handles Stripe trigger events by extracting structured data from the webhook payload.
 * Unlike Gmail triggers (which fetch fresh data), Stripe triggers already have the
 * event data passed via input.stripeEvent from the webhook handler.
 */
export async function handleStripeTriggerEvent(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const stripeEvent = input?.stripeEvent
    if (!stripeEvent) {
      logger.warn('[Stripe Trigger] No stripeEvent in input, returning raw input')
      return {
        success: true,
        output: input,
        message: 'No Stripe event data available'
      }
    }

    const eventType = stripeEvent.type
    const data = stripeEvent.data?.object || {}

    logger.info('[Stripe Trigger] Extracting data from event', {
      eventType,
      objectId: data.id,
    })

    const output = extractEventData(eventType, data)

    // Always include raw event metadata for advanced use
    output.eventId = stripeEvent.id
    output.eventType = eventType
    output.connectedAccount = stripeEvent.account || null
    output.created = stripeEvent.created
      ? new Date(stripeEvent.created * 1000).toISOString()
      : null

    return {
      success: true,
      output,
      message: `Stripe ${eventType} event processed`
    }
  } catch (error: any) {
    logger.error('[Stripe Trigger] Error extracting event data:', error)
    return {
      success: false,
      output: {},
      message: `Failed to extract Stripe event data: ${error.message}`
    }
  }
}

/**
 * Extract structured fields from Stripe event data based on event type.
 * Field names match the output schemas defined in outputSchemaRegistry.ts.
 */
function extractEventData(eventType: string, data: any): Record<string, any> {
  switch (eventType) {
    // Payment events
    case 'payment_intent.succeeded':
    case 'payment_intent.payment_failed':
      return {
        paymentIntentId: data.id,
        amount: data.amount ? data.amount / 100 : 0,
        currency: data.currency,
        status: data.status,
        customerId: data.customer,
        description: data.description || '',
        paymentMethodId: data.payment_method,
        metadata: data.metadata || {},
        failureMessage: data.last_payment_error?.message || '',
      }

    case 'charge.succeeded':
    case 'charge.failed':
    case 'charge.refunded':
      return {
        chargeId: data.id,
        amount: data.amount ? data.amount / 100 : 0,
        amountRefunded: data.amount_refunded ? data.amount_refunded / 100 : 0,
        currency: data.currency,
        status: data.status,
        customerId: data.customer,
        description: data.description || '',
        receiptUrl: data.receipt_url || '',
        paymentIntentId: data.payment_intent,
        failureMessage: data.failure_message || '',
        metadata: data.metadata || {},
      }

    // Customer events
    case 'customer.created':
    case 'customer.updated':
      return {
        customerId: data.id,
        email: data.email || '',
        name: data.name || '',
        phone: data.phone || '',
        created: data.created ? new Date(data.created * 1000).toISOString() : '',
        description: data.description || '',
        metadata: data.metadata || {},
      }

    // Subscription events
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return {
        subscriptionId: data.id,
        customerId: data.customer,
        status: data.status,
        currentPeriodStart: data.current_period_start
          ? new Date(data.current_period_start * 1000).toISOString() : '',
        currentPeriodEnd: data.current_period_end
          ? new Date(data.current_period_end * 1000).toISOString() : '',
        planId: data.items?.data?.[0]?.price?.id || '',
        canceledAt: data.canceled_at
          ? new Date(data.canceled_at * 1000).toISOString() : '',
        reason: data.cancellation_details?.reason || '',
        created: data.created ? new Date(data.created * 1000).toISOString() : '',
        metadata: data.metadata || {},
      }

    // Invoice events
    case 'invoice.created':
    case 'invoice.paid':
    case 'invoice.payment_failed':
      return {
        invoiceId: data.id,
        customerId: data.customer,
        subscriptionId: data.subscription || '',
        amount: data.amount_due ? data.amount_due / 100 : 0,
        amountPaid: data.amount_paid ? data.amount_paid / 100 : 0,
        currency: data.currency,
        status: data.status,
        hostedInvoiceUrl: data.hosted_invoice_url || '',
        invoicePdf: data.invoice_pdf || '',
        attemptCount: data.attempt_count || 0,
        nextPaymentAttempt: data.next_payment_attempt
          ? new Date(data.next_payment_attempt * 1000).toISOString() : '',
        failureReason: data.last_finalization_error?.message || '',
        metadata: data.metadata || {},
      }

    // Dispute events
    case 'charge.dispute.created':
      return {
        disputeId: data.id,
        chargeId: data.charge,
        amount: data.amount ? data.amount / 100 : 0,
        currency: data.currency,
        status: data.status,
        reason: data.reason || '',
        metadata: data.metadata || {},
      }

    // Checkout events
    case 'checkout.session.completed':
      return {
        sessionId: data.id,
        customerId: data.customer,
        customerEmail: data.customer_details?.email || '',
        amount: data.amount_total ? data.amount_total / 100 : 0,
        currency: data.currency,
        status: data.status,
        paymentStatus: data.payment_status,
        subscriptionId: data.subscription || '',
        paymentIntentId: data.payment_intent || '',
        metadata: data.metadata || {},
      }

    default:
      // Return the full object for unrecognized event types
      return {
        objectId: data.id,
        objectType: data.object,
        rawData: data,
      }
  }
}
