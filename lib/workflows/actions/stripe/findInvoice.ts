import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'
import { logger } from '@/lib/utils/logger'

/**
 * Find an invoice in Stripe by ID
 * API VERIFICATION: Uses Stripe API GET /v1/invoices/:id
 * Docs: https://stripe.com/docs/api/invoices/retrieve
 */
export async function stripeFindInvoice(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "stripe")

    const invoiceId = context.dataFlowManager.resolveVariable(config.invoiceId)
    if (!invoiceId) {
      throw new Error('Invoice ID is required')
    }

    const response = await fetch(`https://api.stripe.com/v1/invoices/${invoiceId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })

    if (!response.ok) {
      if (response.status === 404) {
        return {
          success: true,
          output: {
            found: false,
            invoice: null
          },
          message: `Invoice ${invoiceId} not found`
        }
      }
      const errorText = await response.text()
      throw new Error(`Stripe API error: ${response.status} - ${errorText}`)
    }

    const invoice = await response.json()

    return {
      success: true,
      output: {
        found: true,
        invoice: {
          invoiceId: invoice.id,
          customerId: invoice.customer,
          status: invoice.status,
          amountDue: invoice.amount_due,
          amountPaid: invoice.amount_paid,
          amountRemaining: invoice.amount_remaining,
          currency: invoice.currency,
          hostedInvoiceUrl: invoice.hosted_invoice_url,
          invoicePdf: invoice.invoice_pdf,
          created: invoice.created,
          metadata: invoice.metadata
        }
      },
      message: `Found invoice ${invoice.id}`
    }
  } catch (error: any) {
    logger.error('[Stripe Find Invoice] Error:', error)
    return {
      success: false,
      output: { found: false, invoice: null },
      message: error.message || 'Failed to find invoice in Stripe'
    }
  }
}
