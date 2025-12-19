import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'
import { logger } from '@/lib/utils/logger'

/**
 * Create a new invoice in Stripe
 * API VERIFICATION: Uses Stripe API POST /v1/invoices
 * Docs: https://stripe.com/docs/api/invoices/create
 */
export async function stripeCreateInvoice(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "stripe")

    // Resolve required customer ID
    const customerId = context.dataFlowManager.resolveVariable(config.customerId)
    if (!customerId) {
      throw new Error('Customer ID is required to create an invoice')
    }

    // Build request body
    const body: any = {
      customer: customerId
    }

    // Optional description
    if (config.description) {
      body.description = context.dataFlowManager.resolveVariable(config.description)
    }

    // Optional auto advance (defaults to true)
    if (config.autoAdvance !== undefined) {
      body.auto_advance = context.dataFlowManager.resolveVariable(config.autoAdvance)
    }

    // Optional metadata
    if (config.metadata) {
      const metadata = context.dataFlowManager.resolveVariable(config.metadata)
      if (typeof metadata === 'object') {
        body.metadata = metadata
      } else if (typeof metadata === 'string') {
        try {
          body.metadata = JSON.parse(metadata)
        } catch (e) {
          logger.error('[Stripe Create Invoice] Failed to parse metadata JSON', { metadata })
        }
      }
    }

    // Make API call to create invoice
    const response = await fetch('https://api.stripe.com/v1/invoices', {
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

    const invoice = await response.json()

    return {
      success: true,
      output: {
        invoiceId: invoice.id,
        customerId: invoice.customer,
        number: invoice.number,
        status: invoice.status,
        amountDue: invoice.amount_due,
        amountPaid: invoice.amount_paid,
        amountRemaining: invoice.amount_remaining,
        currency: invoice.currency,
        description: invoice.description,
        dueDate: invoice.due_date ? new Date(invoice.due_date * 1000).toISOString() : null,
        hostedInvoiceUrl: invoice.hosted_invoice_url,
        invoicePdf: invoice.invoice_pdf,
        created: invoice.created,
        metadata: invoice.metadata
      },
      message: `Successfully created invoice ${invoice.id}`
    }
  } catch (error: any) {
    logger.error('[Stripe Create Invoice] Error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to create invoice in Stripe'
    }
  }
}
