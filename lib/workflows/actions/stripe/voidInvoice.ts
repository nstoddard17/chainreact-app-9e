import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'
import { logger } from '@/lib/utils/logger'

/**
 * Void an invoice in Stripe (cancel a finalized invoice)
 * API VERIFICATION: Uses Stripe API POST /v1/invoices/:id/void
 * Docs: https://stripe.com/docs/api/invoices/void
 */
export async function stripeVoidInvoice(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "stripe")

    const invoiceId = context.dataFlowManager.resolveVariable(config.invoiceId)
    if (!invoiceId) {
      throw new Error('Invoice ID is required')
    }

    const response = await fetch(`https://api.stripe.com/v1/invoices/${invoiceId}/void`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
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
        status: invoice.status
      },
      message: `Successfully voided invoice ${invoice.id}`
    }
  } catch (error: any) {
    logger.error('[Stripe Void Invoice] Error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to void invoice in Stripe'
    }
  }
}
