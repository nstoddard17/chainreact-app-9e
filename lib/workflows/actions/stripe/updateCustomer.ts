import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'
import { logger } from '@/lib/utils/logger'

/**
 * Update an existing customer in Stripe
 * API VERIFICATION: Uses Stripe API POST /v1/customers/:id
 * Docs: https://stripe.com/docs/api/customers/update
 */
export async function stripeUpdateCustomer(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "stripe")

    // Resolve required customerId
    const customerId = context.dataFlowManager.resolveVariable(config.customerId)
    if (!customerId) {
      throw new Error('Customer ID is required')
    }

    // Build request body - resolve all dynamic values
    const body: any = {}

    // Primary contact information
    if (config.email) {
      body.email = context.dataFlowManager.resolveVariable(config.email)
    }
    if (config.name) {
      body.name = context.dataFlowManager.resolveVariable(config.name)
    }
    if (config.phone) {
      body.phone = context.dataFlowManager.resolveVariable(config.phone)
    }
    if (config.description) {
      body.description = context.dataFlowManager.resolveVariable(config.description)
    }

    // Payment settings
    if (config.payment_method) {
      body.payment_method = context.dataFlowManager.resolveVariable(config.payment_method)
    }
    if (config.invoice_prefix) {
      body.invoice_prefix = context.dataFlowManager.resolveVariable(config.invoice_prefix)
    }

    // Billing address
    const address: any = {}
    if (config.address_line1) {
      address.line1 = context.dataFlowManager.resolveVariable(config.address_line1)
    }
    if (config.address_line2) {
      address.line2 = context.dataFlowManager.resolveVariable(config.address_line2)
    }
    if (config.address_city) {
      address.city = context.dataFlowManager.resolveVariable(config.address_city)
    }
    if (config.address_state) {
      address.state = context.dataFlowManager.resolveVariable(config.address_state)
    }
    if (config.address_postal_code) {
      address.postal_code = context.dataFlowManager.resolveVariable(config.address_postal_code)
    }
    if (config.address_country) {
      address.country = context.dataFlowManager.resolveVariable(config.address_country)
    }
    if (Object.keys(address).length > 0) {
      body.address = address
    }

    // Shipping address
    const shipping: any = {}
    if (config.shipping_name || config.shipping_phone ||
        config.shipping_address_line1 || config.shipping_address_city) {
      if (config.shipping_name) {
        shipping.name = context.dataFlowManager.resolveVariable(config.shipping_name)
      }
      if (config.shipping_phone) {
        shipping.phone = context.dataFlowManager.resolveVariable(config.shipping_phone)
      }

      const shippingAddress: any = {}
      if (config.shipping_address_line1) {
        shippingAddress.line1 = context.dataFlowManager.resolveVariable(config.shipping_address_line1)
      }
      if (config.shipping_address_line2) {
        shippingAddress.line2 = context.dataFlowManager.resolveVariable(config.shipping_address_line2)
      }
      if (config.shipping_address_city) {
        shippingAddress.city = context.dataFlowManager.resolveVariable(config.shipping_address_city)
      }
      if (config.shipping_address_state) {
        shippingAddress.state = context.dataFlowManager.resolveVariable(config.shipping_address_state)
      }
      if (config.shipping_address_postal_code) {
        shippingAddress.postal_code = context.dataFlowManager.resolveVariable(config.shipping_address_postal_code)
      }
      if (config.shipping_address_country) {
        shippingAddress.country = context.dataFlowManager.resolveVariable(config.shipping_address_country)
      }
      if (Object.keys(shippingAddress).length > 0) {
        shipping.address = shippingAddress
      }

      if (Object.keys(shipping).length > 0) {
        body.shipping = shipping
      }
    }

    // Tax & compliance
    if (config.tax_id_type && config.tax_id_value) {
      body.tax_id_data = [{
        type: context.dataFlowManager.resolveVariable(config.tax_id_type),
        value: context.dataFlowManager.resolveVariable(config.tax_id_value)
      }]
    }
    if (config.tax_exempt) {
      body.tax_exempt = context.dataFlowManager.resolveVariable(config.tax_exempt)
    }

    // Preferences
    if (config.preferred_locales) {
      const locales = context.dataFlowManager.resolveVariable(config.preferred_locales)
      if (Array.isArray(locales)) {
        body.preferred_locales = locales
      }
    }

    // Balance and credit
    if (config.balance !== undefined && config.balance !== null) {
      body.balance = context.dataFlowManager.resolveVariable(config.balance)
    }
    if (config.coupon) {
      body.coupon = context.dataFlowManager.resolveVariable(config.coupon)
    }
    if (config.promotion_code) {
      body.promotion_code = context.dataFlowManager.resolveVariable(config.promotion_code)
    }

    // Metadata
    if (config.metadata) {
      const metadata = context.dataFlowManager.resolveVariable(config.metadata)
      if (typeof metadata === 'object') {
        body.metadata = metadata
      } else if (typeof metadata === 'string') {
        try {
          body.metadata = JSON.parse(metadata)
        } catch (e) {
          logger.error('[Stripe Update Customer] Failed to parse metadata JSON', { metadata })
        }
      }
    }

    // Invoice settings
    const invoiceSettings: any = {}
    if (config.invoice_settings_default_payment_method) {
      invoiceSettings.default_payment_method = context.dataFlowManager.resolveVariable(
        config.invoice_settings_default_payment_method
      )
    }
    if (config.invoice_settings_custom_fields) {
      const customFields = context.dataFlowManager.resolveVariable(config.invoice_settings_custom_fields)
      if (Array.isArray(customFields)) {
        invoiceSettings.custom_fields = customFields
      } else if (typeof customFields === 'string') {
        try {
          invoiceSettings.custom_fields = JSON.parse(customFields)
        } catch (e) {
          logger.error('[Stripe Update Customer] Failed to parse invoice custom fields', { customFields })
        }
      }
    }
    if (config.invoice_settings_footer) {
      invoiceSettings.footer = context.dataFlowManager.resolveVariable(config.invoice_settings_footer)
    }
    if (Object.keys(invoiceSettings).length > 0) {
      body.invoice_settings = invoiceSettings
    }

    // Make API call to update customer
    const response = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
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

    const customer = await response.json()

    return {
      success: true,
      output: {
        customerId: customer.id,
        email: customer.email,
        name: customer.name,
        phone: customer.phone,
        description: customer.description,
        created: customer.created,
        currency: customer.currency,
        balance: customer.balance,
        delinquent: customer.delinquent,
        address: customer.address,
        shipping: customer.shipping,
        tax_exempt: customer.tax_exempt,
        metadata: customer.metadata,
        livemode: customer.livemode
      },
      message: `Successfully updated customer ${customer.id}`
    }
  } catch (error: any) {
    logger.error('[Stripe Update Customer] Error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to update customer in Stripe'
    }
  }
}
