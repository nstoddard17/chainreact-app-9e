import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'
import { logger } from '@/lib/utils/logger'

/**
 * Create a Checkout Session in Stripe
 * API VERIFICATION: Uses Stripe API POST /v1/checkout/sessions
 * Docs: https://stripe.com/docs/api/checkout/sessions/create
 *
 * Creates a Stripe Checkout session - the modern payment flow that redirects
 * customers to a Stripe-hosted payment page.
 */
export async function stripeCreateCheckoutSession(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "stripe")

    // Build request body
    const body: any = {}

    // Line items (required) - array of price/quantity objects
    if (!config.line_items) {
      throw new Error('Line items are required')
    }

    const lineItems = context.dataFlowManager.resolveVariable(config.line_items)
    if (typeof lineItems === 'string') {
      try {
        body.line_items = JSON.parse(lineItems)
      } catch (e) {
        throw new Error('Line items must be a valid JSON array')
      }
    } else if (Array.isArray(lineItems)) {
      body.line_items = lineItems
    } else {
      throw new Error('Line items must be an array')
    }

    // Mode (required): payment, subscription, or setup
    const mode = context.dataFlowManager.resolveVariable(config.mode) || 'payment'
    body.mode = mode

    // Success URL (required)
    const successUrl = context.dataFlowManager.resolveVariable(config.success_url)
    if (!successUrl) {
      throw new Error('Success URL is required')
    }
    body.success_url = successUrl

    // Cancel URL (required)
    const cancelUrl = context.dataFlowManager.resolveVariable(config.cancel_url)
    if (!cancelUrl) {
      throw new Error('Cancel URL is required')
    }
    body.cancel_url = cancelUrl

    // Optional: Customer ID or email
    if (config.customer) {
      body.customer = context.dataFlowManager.resolveVariable(config.customer)
    }
    if (config.customer_email) {
      body.customer_email = context.dataFlowManager.resolveVariable(config.customer_email)
    }

    // Optional: Payment method types
    if (config.payment_method_types) {
      const paymentMethodTypes = context.dataFlowManager.resolveVariable(config.payment_method_types)
      if (Array.isArray(paymentMethodTypes)) {
        body.payment_method_types = paymentMethodTypes
      } else if (typeof paymentMethodTypes === 'string') {
        try {
          body.payment_method_types = JSON.parse(paymentMethodTypes)
        } catch (e) {
          // Single value
          body.payment_method_types = [paymentMethodTypes]
        }
      }
    }

    // Optional: Allow promotion codes
    if (config.allow_promotion_codes !== undefined) {
      const allowPromo = context.dataFlowManager.resolveVariable(config.allow_promotion_codes)
      body.allow_promotion_codes = allowPromo === true || allowPromo === 'true'
    }

    // Optional: Billing address collection
    if (config.billing_address_collection) {
      body.billing_address_collection = context.dataFlowManager.resolveVariable(config.billing_address_collection)
    }

    // Optional: Shipping address collection
    if (config.shipping_address_collection) {
      const shippingConfig = context.dataFlowManager.resolveVariable(config.shipping_address_collection)
      if (typeof shippingConfig === 'string') {
        try {
          body.shipping_address_collection = JSON.parse(shippingConfig)
        } catch (e) {
          logger.error('[Stripe Create Checkout Session] Failed to parse shipping_address_collection', { shippingConfig })
        }
      } else if (typeof shippingConfig === 'object') {
        body.shipping_address_collection = shippingConfig
      }
    }

    // Optional: Metadata
    if (config.metadata) {
      const metadata = context.dataFlowManager.resolveVariable(config.metadata)
      if (typeof metadata === 'object') {
        body.metadata = metadata
      } else if (typeof metadata === 'string') {
        try {
          body.metadata = JSON.parse(metadata)
        } catch (e) {
          logger.error('[Stripe Create Checkout Session] Failed to parse metadata', { metadata })
        }
      }
    }

    // Optional: Client reference ID
    if (config.client_reference_id) {
      body.client_reference_id = context.dataFlowManager.resolveVariable(config.client_reference_id)
    }

    // Optional: Locale
    if (config.locale) {
      body.locale = context.dataFlowManager.resolveVariable(config.locale)
    }

    // Make API call to create checkout session
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams(body).toString()
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Stripe API error: ${response.status} - ${errorText}`)
    }

    const session = await response.json()

    return {
      success: true,
      output: {
        sessionId: session.id,
        url: session.url,
        customerId: session.customer,
        paymentIntentId: session.payment_intent,
        subscriptionId: session.subscription,
        amountTotal: session.amount_total,
        currency: session.currency,
        paymentStatus: session.payment_status,
        status: session.status,
        expiresAt: session.expires_at,
        metadata: session.metadata
      },
      message: `Successfully created checkout session ${session.id}. Redirect customer to: ${session.url}`
    }
  } catch (error: any) {
    logger.error('[Stripe Create Checkout Session] Error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to create checkout session in Stripe'
    }
  }
}
