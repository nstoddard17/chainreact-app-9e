import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'
import { logger } from '@/lib/utils/logger'

/**
 * Create an invoice item in Stripe
 * API VERIFICATION: Uses Stripe API POST /v1/invoiceitems
 * Docs: https://stripe.com/docs/api/invoiceitems/create
 */
export async function stripeCreateInvoiceItem(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "stripe")

    const customerId = context.dataFlowManager.resolveVariable(config.customerId)
    if (!customerId) {
      throw new Error('Customer ID is required')
    }

    const amount = context.dataFlowManager.resolveVariable(config.amount)
    if (!amount) {
      throw new Error('Amount is required')
    }

    const currency = context.dataFlowManager.resolveVariable(config.currency)
    if (!currency) {
      throw new Error('Currency is required')
    }

    const body: any = {
      customer: customerId,
      amount: parseInt(amount.toString()),
      currency: currency.toLowerCase()
    }

    if (config.description) {
      body.description = context.dataFlowManager.resolveVariable(config.description)
    }
    if (config.invoice) {
      body.invoice = context.dataFlowManager.resolveVariable(config.invoice)
    }
    if (config.metadata) {
      const metadata = context.dataFlowManager.resolveVariable(config.metadata)
      if (typeof metadata === 'object') {
        body.metadata = metadata
      } else if (typeof metadata === 'string') {
        try {
          body.metadata = JSON.parse(metadata)
        } catch (e) {
          logger.error('[Stripe Create Invoice Item] Failed to parse metadata', { metadata })
        }
      }
    }

    const response = await fetch('https://api.stripe.com/v1/invoiceitems', {
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

    const invoiceItem = await response.json()

    return {
      success: true,
      output: {
        invoiceItemId: invoiceItem.id,
        customerId: invoiceItem.customer,
        amount: invoiceItem.amount,
        currency: invoiceItem.currency,
        description: invoiceItem.description,
        invoice: invoiceItem.invoice,
        metadata: invoiceItem.metadata
      },
      message: `Successfully created invoice item ${invoiceItem.id}`
    }
  } catch (error: any) {
    logger.error('[Stripe Create Invoice Item] Error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to create invoice item in Stripe'
    }
  }
}
