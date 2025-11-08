import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'
import { logger } from '@/lib/utils/logger'

/**
 * Update an invoice in Stripe
 * API VERIFICATION: Uses Stripe API POST /v1/invoices/:id
 * Docs: https://stripe.com/docs/api/invoices/update
 */
export async function stripeUpdateInvoice(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "stripe")

    const invoiceId = context.dataFlowManager.resolveVariable(config.invoiceId)
    if (!invoiceId) {
      throw new Error('Invoice ID is required')
    }

    const body: any = {}

    if (config.description) {
      body.description = context.dataFlowManager.resolveVariable(config.description)
    }
    if (config.metadata) {
      const metadata = context.dataFlowManager.resolveVariable(config.metadata)
      if (typeof metadata === 'object') {
        body.metadata = metadata
      } else if (typeof metadata === 'string') {
        try {
          body.metadata = JSON.parse(metadata)
        } catch (e) {
          logger.error('[Stripe Update Invoice] Failed to parse metadata', { metadata })
        }
      }
    }
    if (config.footer) {
      body.footer = context.dataFlowManager.resolveVariable(config.footer)
    }
    if (config.due_date) {
      const dueDate = context.dataFlowManager.resolveVariable(config.due_date)
      if (dueDate) {
        body.due_date = parseInt(dueDate.toString())
      }
    }

    const response = await fetch(`https://api.stripe.com/v1/invoices/${invoiceId}`, {
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
        description: invoice.description,
        metadata: invoice.metadata,
        footer: invoice.footer,
        dueDate: invoice.due_date
      },
      message: `Successfully updated invoice ${invoice.id}`
    }
  } catch (error: any) {
    logger.error('[Stripe Update Invoice] Error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to update invoice in Stripe'
    }
  }
}
