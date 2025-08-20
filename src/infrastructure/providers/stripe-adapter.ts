import { 
  PaymentProvider, 
  PaymentParams, 
  PaymentResult, 
  PaymentInfo, 
  PaymentFilters, 
  RefundResult, 
  CustomerParams, 
  CustomerResult, 
  CustomerInfo, 
  SubscriptionParams, 
  SubscriptionResult, 
  SubscriptionInfo, 
  SubscriptionFilters, 
  InvoiceParams, 
  InvoiceResult, 
  InvoiceInfo, 
  InvoiceFilters 
} from '../../domains/integrations/ports/capability-interfaces'
import { CapabilityDescriptor, ErrorClassification } from '../../domains/integrations/ports/connector-contract'
import { getDecryptedAccessToken } from '../../../lib/workflows/actions/core/getDecryptedAccessToken'

export class StripeAdapter implements PaymentProvider {
  readonly providerId = 'stripe'
  readonly capabilities: CapabilityDescriptor = {
    supportsWebhooks: true,
    rateLimits: [
      { type: 'requests', limit: 100, window: 1000 }, // 100 requests per second
      { type: 'requests', limit: 1000, window: 60000 } // 1,000 requests per minute
    ],
    supportedFeatures: [
      'create_payment',
      'refund_payment',
      'get_payment',
      'get_payments',
      'create_customer',
      'update_customer',
      'get_customer',
      'create_subscription',
      'cancel_subscription',
      'get_subscriptions',
      'create_invoice',
      'get_invoices',
      'payment_intents',
      'setup_intents',
      'payment_methods',
      'webhooks'
    ]
  }

  async validateConnection(userId: string): Promise<boolean> {
    try {
      const apiKey = await getDecryptedAccessToken(userId, 'stripe')
      
      // Test Stripe API access with account info
      const response = await fetch('https://api.stripe.com/v1/account', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      })
      
      return response.ok
    } catch {
      return false
    }
  }

  async createPayment(params: PaymentParams, userId: string): Promise<PaymentResult> {
    try {
      const apiKey = await getDecryptedAccessToken(userId, 'stripe')
      
      // Create payment intent
      const paymentData = new URLSearchParams({
        amount: params.amount.toString(),
        currency: params.currency.toLowerCase(),
        confirmation_method: params.confirmationMethod || 'automatic',
        confirm: 'true'
      })
      
      if (params.customerId) {
        paymentData.append('customer', params.customerId)
      }
      
      if (params.description) {
        paymentData.append('description', params.description)
      }
      
      if (params.paymentMethodId) {
        paymentData.append('payment_method', params.paymentMethodId)
      }
      
      if (params.metadata) {
        Object.entries(params.metadata).forEach(([key, value]) => {
          paymentData.append(`metadata[${key}]`, String(value))
        })
      }
      
      const response = await fetch('https://api.stripe.com/v1/payment_intents', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: paymentData.toString()
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Stripe API error: ${response.status} - ${errorData.error?.message || response.statusText}`)
      }
      
      const result = await response.json()
      
      return {
        success: true,
        output: {
          paymentId: result.id,
          status: result.status,
          clientSecret: result.client_secret,
          amount: result.amount,
          currency: result.currency,
          stripeResponse: result
        },
        message: 'Payment created successfully with Stripe'
      }
    } catch (error: any) {
      console.error('Stripe create payment error:', error)
      return {
        success: false,
        error: error.message || 'Failed to create payment with Stripe',
        output: { error: error.message, timestamp: new Date().toISOString() }
      }
    }
  }

  async refundPayment(paymentId: string, amount?: number, userId?: string): Promise<RefundResult> {
    if (!userId) {
      throw new Error('User ID is required for refund operations')
    }

    try {
      const apiKey = await getDecryptedAccessToken(userId, 'stripe')
      
      const refundData = new URLSearchParams({
        payment_intent: paymentId
      })
      
      if (amount) {
        refundData.append('amount', amount.toString())
      }
      
      const response = await fetch('https://api.stripe.com/v1/refunds', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: refundData.toString()
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Stripe refund error: ${response.status} - ${errorData.error?.message || response.statusText}`)
      }
      
      const result = await response.json()
      
      return {
        success: true,
        output: {
          refundId: result.id,
          amount: result.amount,
          status: result.status,
          paymentId: paymentId,
          stripeResponse: result
        },
        message: 'Refund processed successfully'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to process refund',
        output: { error: error.message }
      }
    }
  }

  async getPayment(paymentId: string, userId: string): Promise<PaymentInfo> {
    const apiKey = await getDecryptedAccessToken(userId, 'stripe')
    
    const response = await fetch(`https://api.stripe.com/v1/payment_intents/${paymentId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to get payment: ${response.status} - ${errorData.error?.message || response.statusText}`)
    }
    
    const payment = await response.json()
    
    return {
      id: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      customerId: payment.customer,
      description: payment.description,
      createdAt: new Date(payment.created * 1000),
      confirmedAt: payment.status === 'succeeded' ? new Date(payment.created * 1000) : undefined,
      metadata: payment.metadata
    }
  }

  async getPayments(filters?: PaymentFilters, userId?: string): Promise<PaymentInfo[]> {
    if (!userId) {
      throw new Error('User ID is required for getPayments')
    }

    try {
      const apiKey = await getDecryptedAccessToken(userId, 'stripe')
      
      const params = new URLSearchParams()
      
      if (filters?.limit) {
        params.append('limit', Math.min(filters.limit, 100).toString())
      } else {
        params.append('limit', '10')
      }
      
      if (filters?.customerId) {
        params.append('customer', filters.customerId)
      }
      
      if (filters?.dateRange) {
        params.append('created[gte]', Math.floor(filters.dateRange.start.getTime() / 1000).toString())
        params.append('created[lte]', Math.floor(filters.dateRange.end.getTime() / 1000).toString())
      }
      
      const url = `https://api.stripe.com/v1/payment_intents?${params.toString()}`
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to get payments from Stripe')
      }
      
      const data = await response.json()
      
      return (data.data || []).map((payment: any) => ({
        id: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        customerId: payment.customer,
        description: payment.description,
        createdAt: new Date(payment.created * 1000),
        confirmedAt: payment.status === 'succeeded' ? new Date(payment.created * 1000) : undefined,
        metadata: payment.metadata
      }))
    } catch (error: any) {
      console.error('Stripe get payments error:', error)
      return []
    }
  }

  async createCustomer(params: CustomerParams, userId: string): Promise<CustomerResult> {
    try {
      const apiKey = await getDecryptedAccessToken(userId, 'stripe')
      
      const customerData = new URLSearchParams()
      
      if (params.email) {
        customerData.append('email', params.email)
      }
      
      if (params.name) {
        customerData.append('name', params.name)
      }
      
      if (params.description) {
        customerData.append('description', params.description)
      }
      
      if (params.phone) {
        customerData.append('phone', params.phone)
      }
      
      if (params.address) {
        Object.entries(params.address).forEach(([key, value]) => {
          if (value) {
            customerData.append(`address[${key}]`, value)
          }
        })
      }
      
      if (params.metadata) {
        Object.entries(params.metadata).forEach(([key, value]) => {
          customerData.append(`metadata[${key}]`, String(value))
        })
      }
      
      const response = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: customerData.toString()
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to create customer: ${response.status} - ${errorData.error?.message || response.statusText}`)
      }
      
      const result = await response.json()
      
      return {
        success: true,
        output: {
          customerId: result.id,
          email: result.email,
          name: result.name,
          stripeResponse: result
        },
        message: 'Customer created successfully in Stripe'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to create customer in Stripe',
        output: { error: error.message }
      }
    }
  }

  async updateCustomer(customerId: string, updates: Partial<CustomerParams>, userId: string): Promise<CustomerResult> {
    try {
      const apiKey = await getDecryptedAccessToken(userId, 'stripe')
      
      const updateData = new URLSearchParams()
      
      if (updates.email) {
        updateData.append('email', updates.email)
      }
      
      if (updates.name) {
        updateData.append('name', updates.name)
      }
      
      if (updates.description) {
        updateData.append('description', updates.description)
      }
      
      if (updates.phone) {
        updateData.append('phone', updates.phone)
      }
      
      if (updates.metadata) {
        Object.entries(updates.metadata).forEach(([key, value]) => {
          updateData.append(`metadata[${key}]`, String(value))
        })
      }
      
      const response = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: updateData.toString()
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to update customer: ${response.status} - ${errorData.error?.message || response.statusText}`)
      }
      
      const result = await response.json()
      
      return {
        success: true,
        output: {
          customerId: result.id,
          email: result.email,
          name: result.name,
          stripeResponse: result
        },
        message: 'Customer updated successfully in Stripe'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to update customer in Stripe',
        output: { error: error.message }
      }
    }
  }

  async getCustomer(customerId: string, userId: string): Promise<CustomerInfo> {
    const apiKey = await getDecryptedAccessToken(userId, 'stripe')
    
    const response = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to get customer: ${response.status} - ${errorData.error?.message || response.statusText}`)
    }
    
    const customer = await response.json()
    
    return {
      id: customer.id,
      email: customer.email,
      name: customer.name,
      description: customer.description,
      phone: customer.phone,
      createdAt: new Date(customer.created * 1000),
      metadata: customer.metadata
    }
  }

  async createSubscription(params: SubscriptionParams, userId: string): Promise<SubscriptionResult> {
    try {
      const apiKey = await getDecryptedAccessToken(userId, 'stripe')
      
      const subscriptionData = new URLSearchParams({
        customer: params.customerId
      })
      
      if (params.priceId) {
        subscriptionData.append('items[0][price]', params.priceId)
      } else if (params.items && params.items.length > 0) {
        params.items.forEach((item, index) => {
          subscriptionData.append(`items[${index}][price]`, item.priceId)
          if (item.quantity) {
            subscriptionData.append(`items[${index}][quantity]`, item.quantity.toString())
          }
        })
      }
      
      if (params.trialPeriodDays) {
        subscriptionData.append('trial_period_days', params.trialPeriodDays.toString())
      }
      
      if (params.metadata) {
        Object.entries(params.metadata).forEach(([key, value]) => {
          subscriptionData.append(`metadata[${key}]`, String(value))
        })
      }
      
      const response = await fetch('https://api.stripe.com/v1/subscriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: subscriptionData.toString()
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to create subscription: ${response.status} - ${errorData.error?.message || response.statusText}`)
      }
      
      const result = await response.json()
      
      return {
        success: true,
        output: {
          subscriptionId: result.id,
          status: result.status,
          currentPeriodEnd: new Date(result.current_period_end * 1000),
          stripeResponse: result
        },
        message: 'Subscription created successfully in Stripe'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to create subscription in Stripe',
        output: { error: error.message }
      }
    }
  }

  async cancelSubscription(subscriptionId: string, userId: string): Promise<SubscriptionResult> {
    try {
      const apiKey = await getDecryptedAccessToken(userId, 'stripe')
      
      const response = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to cancel subscription: ${response.status} - ${errorData.error?.message || response.statusText}`)
      }
      
      const result = await response.json()
      
      return {
        success: true,
        output: {
          subscriptionId: result.id,
          status: result.status,
          stripeResponse: result
        },
        message: 'Subscription canceled successfully'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to cancel subscription',
        output: { error: error.message }
      }
    }
  }

  async getSubscriptions(filters?: SubscriptionFilters, userId?: string): Promise<SubscriptionInfo[]> {
    if (!userId) {
      throw new Error('User ID is required for getSubscriptions')
    }

    try {
      const apiKey = await getDecryptedAccessToken(userId, 'stripe')
      
      const params = new URLSearchParams()
      
      if (filters?.limit) {
        params.append('limit', Math.min(filters.limit, 100).toString())
      } else {
        params.append('limit', '10')
      }
      
      if (filters?.customerId) {
        params.append('customer', filters.customerId)
      }
      
      if (filters?.status) {
        params.append('status', filters.status)
      }
      
      if (filters?.priceId) {
        params.append('price', filters.priceId)
      }
      
      const url = `https://api.stripe.com/v1/subscriptions?${params.toString()}`
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to get subscriptions from Stripe')
      }
      
      const data = await response.json()
      
      return (data.data || []).map((subscription: any) => ({
        id: subscription.id,
        customerId: subscription.customer,
        status: subscription.status,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        items: subscription.items.data.map((item: any) => ({
          id: item.id,
          priceId: item.price.id,
          quantity: item.quantity
        })),
        metadata: subscription.metadata
      }))
    } catch (error: any) {
      console.error('Stripe get subscriptions error:', error)
      return []
    }
  }

  async createInvoice(params: InvoiceParams, userId: string): Promise<InvoiceResult> {
    try {
      const apiKey = await getDecryptedAccessToken(userId, 'stripe')
      
      const invoiceData = new URLSearchParams({
        customer: params.customerId
      })
      
      if (params.description) {
        invoiceData.append('description', params.description)
      }
      
      if (params.dueDate) {
        invoiceData.append('due_date', Math.floor(params.dueDate.getTime() / 1000).toString())
      }
      
      if (params.metadata) {
        Object.entries(params.metadata).forEach(([key, value]) => {
          invoiceData.append(`metadata[${key}]`, String(value))
        })
      }
      
      const response = await fetch('https://api.stripe.com/v1/invoices', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: invoiceData.toString()
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to create invoice: ${response.status} - ${errorData.error?.message || response.statusText}`)
      }
      
      const result = await response.json()
      
      return {
        success: true,
        output: {
          invoiceId: result.id,
          status: result.status,
          hostedInvoiceUrl: result.hosted_invoice_url,
          stripeResponse: result
        },
        message: 'Invoice created successfully in Stripe'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to create invoice in Stripe',
        output: { error: error.message }
      }
    }
  }

  async getInvoices(filters?: InvoiceFilters, userId?: string): Promise<InvoiceInfo[]> {
    if (!userId) {
      throw new Error('User ID is required for getInvoices')
    }

    try {
      const apiKey = await getDecryptedAccessToken(userId, 'stripe')
      
      const params = new URLSearchParams()
      
      if (filters?.limit) {
        params.append('limit', Math.min(filters.limit, 100).toString())
      } else {
        params.append('limit', '10')
      }
      
      if (filters?.customerId) {
        params.append('customer', filters.customerId)
      }
      
      if (filters?.status) {
        params.append('status', filters.status)
      }
      
      if (filters?.dateRange) {
        params.append('created[gte]', Math.floor(filters.dateRange.start.getTime() / 1000).toString())
        params.append('created[lte]', Math.floor(filters.dateRange.end.getTime() / 1000).toString())
      }
      
      const url = `https://api.stripe.com/v1/invoices?${params.toString()}`
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to get invoices from Stripe')
      }
      
      const data = await response.json()
      
      return (data.data || []).map((invoice: any) => ({
        id: invoice.id,
        customerId: invoice.customer,
        amount: invoice.amount_due,
        currency: invoice.currency,
        status: invoice.status,
        description: invoice.description,
        dueDate: invoice.due_date ? new Date(invoice.due_date * 1000) : undefined,
        paidAt: invoice.status_transitions?.paid_at ? new Date(invoice.status_transitions.paid_at * 1000) : undefined,
        createdAt: new Date(invoice.created * 1000),
        hostedInvoiceUrl: invoice.hosted_invoice_url
      }))
    } catch (error: any) {
      console.error('Stripe get invoices error:', error)
      return []
    }
  }

  classifyError(error: Error): ErrorClassification {
    const message = error.message.toLowerCase()
    
    if (message.includes('invalid api key') || message.includes('unauthorized')) {
      return 'authentication'
    }
    if (message.includes('insufficient permissions') || message.includes('forbidden')) {
      return 'authorization'
    }
    if (message.includes('rate limit') || message.includes('too many requests')) {
      return 'rateLimit'
    }
    if (message.includes('network') || message.includes('timeout')) {
      return 'network'
    }
    if (message.includes('not found') || message.includes('no such')) {
      return 'notFound'
    }
    if (message.includes('invalid') || message.includes('bad request')) {
      return 'validation'
    }
    if (message.includes('insufficient funds') || message.includes('card')) {
      return 'validation'
    }
    
    return 'unknown'
  }
}