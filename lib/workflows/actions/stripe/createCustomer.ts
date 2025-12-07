import { ActionResult } from '../index'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { ExecutionContext } from '../../execution/types'
import { logger } from '@/lib/utils/logger'

/**
 * Create a new customer in Stripe with full customization options
 * API VERIFICATION: Uses Stripe API POST /v1/customers
 * Docs: https://stripe.com/docs/api/customers/create
 */
export async function stripeCreateCustomer(
  config: any,
  context: ExecutionContext
): Promise<ActionResult> {
  try {
    const accessToken = await getDecryptedAccessToken(context.userId, "stripe")

    // Build request body - resolve all dynamic values
    const body: any = {}

    // Primary contact information (email is required)
    const email = context.dataFlowManager.resolveVariable(config.email)
    if (!email) {
      throw new Error('Email is required to create a customer')
    }
    body.email = email

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

    // Billing address - use bracket notation for URLSearchParams
    if (config.address_line1) {
      body['address[line1]'] = context.dataFlowManager.resolveVariable(config.address_line1)
    }
    if (config.address_line2) {
      body['address[line2]'] = context.dataFlowManager.resolveVariable(config.address_line2)
    }
    if (config.address_city) {
      body['address[city]'] = context.dataFlowManager.resolveVariable(config.address_city)
    }
    if (config.address_state) {
      body['address[state]'] = context.dataFlowManager.resolveVariable(config.address_state)
    }
    if (config.address_postal_code) {
      body['address[postal_code]'] = context.dataFlowManager.resolveVariable(config.address_postal_code)
    }
    if (config.address_country) {
      body['address[country]'] = context.dataFlowManager.resolveVariable(config.address_country)
    }

    // Shipping address - use bracket notation for URLSearchParams
    if (config.shipping_name) {
      body['shipping[name]'] = context.dataFlowManager.resolveVariable(config.shipping_name)
    }
    if (config.shipping_phone) {
      body['shipping[phone]'] = context.dataFlowManager.resolveVariable(config.shipping_phone)
    }
    if (config.shipping_address_line1) {
      body['shipping[address][line1]'] = context.dataFlowManager.resolveVariable(config.shipping_address_line1)
    }
    if (config.shipping_address_line2) {
      body['shipping[address][line2]'] = context.dataFlowManager.resolveVariable(config.shipping_address_line2)
    }
    if (config.shipping_address_city) {
      body['shipping[address][city]'] = context.dataFlowManager.resolveVariable(config.shipping_address_city)
    }
    if (config.shipping_address_state) {
      body['shipping[address][state]'] = context.dataFlowManager.resolveVariable(config.shipping_address_state)
    }
    if (config.shipping_address_postal_code) {
      body['shipping[address][postal_code]'] = context.dataFlowManager.resolveVariable(config.shipping_address_postal_code)
    }
    if (config.shipping_address_country) {
      body['shipping[address][country]'] = context.dataFlowManager.resolveVariable(config.shipping_address_country)
    }

    // Tax & compliance - use bracket notation for arrays
    if (config.tax_id_type && config.tax_id_value) {
      body['tax_id_data[0][type]'] = context.dataFlowManager.resolveVariable(config.tax_id_type)
      body['tax_id_data[0][value]'] = context.dataFlowManager.resolveVariable(config.tax_id_value)
    }
    if (config.tax_exempt) {
      body.tax_exempt = context.dataFlowManager.resolveVariable(config.tax_exempt)
    }

    // Preferences - use bracket notation for arrays
    if (config.preferred_locales) {
      const locales = context.dataFlowManager.resolveVariable(config.preferred_locales)
      if (Array.isArray(locales)) {
        locales.forEach((locale, index) => {
          body[`preferred_locales[${index}]`] = locale
        })
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

    // Metadata - use bracket notation for nested objects
    if (config.metadata) {
      const metadata = context.dataFlowManager.resolveVariable(config.metadata)
      let metadataObj: any = metadata

      if (typeof metadata === 'string') {
        try {
          metadataObj = JSON.parse(metadata)
        } catch (e) {
          logger.error('[Stripe Create Customer] Failed to parse metadata JSON', { metadata })
          metadataObj = null
        }
      }

      if (metadataObj && typeof metadataObj === 'object') {
        Object.keys(metadataObj).forEach(key => {
          body[`metadata[${key}]`] = metadataObj[key]
        })
      }
    }

    // Invoice settings - use bracket notation
    if (config.invoice_settings_default_payment_method) {
      body['invoice_settings[default_payment_method]'] = context.dataFlowManager.resolveVariable(
        config.invoice_settings_default_payment_method
      )
    }
    if (config.invoice_settings_custom_fields) {
      const customFields = context.dataFlowManager.resolveVariable(config.invoice_settings_custom_fields)
      let fieldsArray: any[] = []

      if (Array.isArray(customFields)) {
        fieldsArray = customFields
      } else if (typeof customFields === 'string') {
        try {
          fieldsArray = JSON.parse(customFields)
        } catch (e) {
          logger.error('[Stripe Create Customer] Failed to parse invoice custom fields', { customFields })
        }
      }

      fieldsArray.forEach((field, index) => {
        if (field.name) body[`invoice_settings[custom_fields][${index}][name]`] = field.name
        if (field.value) body[`invoice_settings[custom_fields][${index}][value]`] = field.value
      })
    }
    if (config.invoice_settings_footer) {
      body['invoice_settings[footer]'] = context.dataFlowManager.resolveVariable(config.invoice_settings_footer)
    }

    // Make API call to create customer
    const response = await fetch('https://api.stripe.com/v1/customers', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams(body).toString()
    })

    if (!response.ok) {
      const errorText = await response.text()
      let errorMessage = `Stripe API error: ${response.status}`

      // Try to parse Stripe's error JSON to get the user-friendly message
      try {
        const errorData = JSON.parse(errorText)
        if (errorData?.error?.message) {
          errorMessage = errorData.error.message
        } else {
          errorMessage += ` - ${errorText}`
        }
      } catch (e) {
        errorMessage += ` - ${errorText}`
      }

      throw new Error(errorMessage)
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
      message: `Successfully created customer ${customer.id}`
    }
  } catch (error: any) {
    logger.error('[Stripe Create Customer] Error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Failed to create customer in Stripe'
    }
  }
}
