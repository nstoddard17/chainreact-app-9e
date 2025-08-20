import { 
  EcommerceProvider, 
  ProductParams, 
  ProductResult, 
  ProductInfo, 
  ProductFilters, 
  OrderParams, 
  OrderResult, 
  OrderInfo, 
  OrderFilters, 
  InventoryResult, 
  InventoryInfo, 
  InventoryFilters 
} from '../../domains/integrations/ports/capability-interfaces'
import { CapabilityDescriptor, ErrorClassification } from '../../domains/integrations/ports/connector-contract'
import { getDecryptedAccessToken } from '../../../lib/workflows/actions/core/getDecryptedAccessToken'

export class ShopifyAdapter implements EcommerceProvider {
  readonly providerId = 'shopify'
  readonly capabilities: CapabilityDescriptor = {
    supportsWebhooks: true,
    rateLimits: [
      { type: 'requests', limit: 2, window: 1000 },    // 2 requests per second (REST API)
      { type: 'requests', limit: 40, window: 60000 }   // 40 requests per minute (burst)
    ],
    supportedFeatures: [
      'create_product',
      'update_product',
      'get_product',
      'get_products',
      'create_order',
      'update_order',
      'get_order',
      'get_orders',
      'update_inventory',
      'get_inventory',
      'product_variants',
      'product_images',
      'collections',
      'customers',
      'fulfillments',
      'discounts'
    ]
  }

  async validateConnection(userId: string): Promise<boolean> {
    try {
      const credentials = await this.getShopifyCredentials(userId)
      
      // Test Shopify API access with shop info
      const response = await fetch(`https://${credentials.shopDomain}/admin/api/2023-10/shop.json`, {
        headers: {
          'X-Shopify-Access-Token': credentials.accessToken,
          'Content-Type': 'application/json'
        }
      })
      
      return response.ok
    } catch {
      return false
    }
  }

  async createProduct(params: ProductParams, userId: string): Promise<ProductResult> {
    try {
      const credentials = await this.getShopifyCredentials(userId)
      
      const productData = {
        product: {
          title: params.title,
          body_html: params.description || '',
          vendor: params.vendor || '',
          product_type: params.productType || '',
          published: params.published !== false,
          tags: params.tags ? params.tags.join(', ') : '',
          images: params.images ? params.images.map(url => ({ src: url })) : [],
          variants: params.variants ? params.variants.map(variant => ({
            title: variant.title,
            price: variant.price.toString(),
            sku: variant.sku,
            inventory_quantity: variant.inventory_quantity || 0,
            weight: variant.weight,
            requires_shipping: variant.requires_shipping !== false
          })) : [{
            title: 'Default Title',
            price: params.price.toString(),
            inventory_quantity: 0
          }],
          metafields: params.metadata ? Object.entries(params.metadata).map(([key, value]) => ({
            namespace: 'custom',
            key: key,
            value: String(value),
            type: 'single_line_text_field'
          })) : []
        }
      }
      
      const response = await fetch(`https://${credentials.shopDomain}/admin/api/2023-10/products.json`, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': credentials.accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(productData)
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Shopify API error: ${response.status} - ${errorData.errors || response.statusText}`)
      }
      
      const result = await response.json()
      
      return {
        success: true,
        output: {
          productId: result.product.id.toString(),
          title: result.product.title,
          handle: result.product.handle,
          vendor: result.product.vendor,
          shopifyResponse: result.product
        },
        message: 'Product created successfully in Shopify'
      }
    } catch (error: any) {
      console.error('Shopify create product error:', error)
      return {
        success: false,
        error: error.message || 'Failed to create product in Shopify',
        output: { error: error.message, timestamp: new Date().toISOString() }
      }
    }
  }

  async updateProduct(productId: string, updates: Partial<ProductParams>, userId: string): Promise<ProductResult> {
    try {
      const credentials = await this.getShopifyCredentials(userId)
      
      const updateData: any = {
        product: {
          id: parseInt(productId)
        }
      }
      
      if (updates.title) updateData.product.title = updates.title
      if (updates.description) updateData.product.body_html = updates.description
      if (updates.vendor) updateData.product.vendor = updates.vendor
      if (updates.productType) updateData.product.product_type = updates.productType
      if (updates.published !== undefined) updateData.product.published = updates.published
      if (updates.tags) updateData.product.tags = updates.tags.join(', ')
      
      if (updates.images) {
        updateData.product.images = updates.images.map(url => ({ src: url }))
      }
      
      if (updates.variants) {
        updateData.product.variants = updates.variants.map(variant => ({
          title: variant.title,
          price: variant.price.toString(),
          sku: variant.sku,
          inventory_quantity: variant.inventory_quantity || 0,
          weight: variant.weight,
          requires_shipping: variant.requires_shipping !== false
        }))
      }
      
      const response = await fetch(`https://${credentials.shopDomain}/admin/api/2023-10/products/${productId}.json`, {
        method: 'PUT',
        headers: {
          'X-Shopify-Access-Token': credentials.accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to update product: ${response.status} - ${errorData.errors || response.statusText}`)
      }
      
      const result = await response.json()
      
      return {
        success: true,
        output: {
          productId: result.product.id.toString(),
          title: result.product.title,
          handle: result.product.handle,
          shopifyResponse: result.product
        },
        message: 'Product updated successfully in Shopify'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to update product in Shopify',
        output: { error: error.message }
      }
    }
  }

  async getProduct(productId: string, userId: string): Promise<ProductInfo> {
    const credentials = await this.getShopifyCredentials(userId)
    
    const response = await fetch(`https://${credentials.shopDomain}/admin/api/2023-10/products/${productId}.json`, {
      headers: {
        'X-Shopify-Access-Token': credentials.accessToken,
        'Content-Type': 'application/json'
      }
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to get product: ${response.status} - ${errorData.errors || response.statusText}`)
    }
    
    const data = await response.json()
    const product = data.product
    
    return {
      id: product.id.toString(),
      title: product.title,
      description: product.body_html || '',
      price: parseFloat(product.variants[0]?.price || '0'),
      compareAtPrice: parseFloat(product.variants[0]?.compare_at_price || '0'),
      currency: 'USD', // Shopify doesn't return currency in product API
      images: product.images?.map((img: any) => img.src) || [],
      variants: product.variants?.map((variant: any) => ({
        id: variant.id.toString(),
        title: variant.title,
        price: parseFloat(variant.price),
        sku: variant.sku || '',
        inventory_quantity: variant.inventory_quantity || 0,
        weight: variant.weight
      })) || [],
      tags: product.tags ? product.tags.split(', ') : [],
      vendor: product.vendor || '',
      productType: product.product_type || '',
      published: product.published_at !== null,
      createdAt: new Date(product.created_at),
      updatedAt: new Date(product.updated_at)
    }
  }

  async getProducts(filters?: ProductFilters, userId?: string): Promise<ProductInfo[]> {
    if (!userId) {
      throw new Error('User ID is required for getProducts')
    }

    try {
      const credentials = await this.getShopifyCredentials(userId)
      
      const params = new URLSearchParams()
      
      if (filters?.limit) {
        params.append('limit', Math.min(filters.limit, 250).toString())
      } else {
        params.append('limit', '50')
      }
      
      if (filters?.title) {
        params.append('title', filters.title)
      }
      
      if (filters?.vendor) {
        params.append('vendor', filters.vendor)
      }
      
      if (filters?.productType) {
        params.append('product_type', filters.productType)
      }
      
      if (filters?.published !== undefined) {
        params.append('published_status', filters.published ? 'published' : 'unpublished')
      }
      
      const url = `https://${credentials.shopDomain}/admin/api/2023-10/products.json?${params.toString()}`
      
      const response = await fetch(url, {
        headers: {
          'X-Shopify-Access-Token': credentials.accessToken,
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to get products from Shopify')
      }
      
      const data = await response.json()
      
      return (data.products || []).map((product: any) => ({
        id: product.id.toString(),
        title: product.title,
        description: product.body_html || '',
        price: parseFloat(product.variants[0]?.price || '0'),
        compareAtPrice: parseFloat(product.variants[0]?.compare_at_price || '0'),
        currency: 'USD',
        images: product.images?.map((img: any) => img.src) || [],
        variants: product.variants?.map((variant: any) => ({
          id: variant.id.toString(),
          title: variant.title,
          price: parseFloat(variant.price),
          sku: variant.sku || '',
          inventory_quantity: variant.inventory_quantity || 0,
          weight: variant.weight
        })) || [],
        tags: product.tags ? product.tags.split(', ') : [],
        vendor: product.vendor || '',
        productType: product.product_type || '',
        published: product.published_at !== null,
        createdAt: new Date(product.created_at),
        updatedAt: new Date(product.updated_at)
      }))
    } catch (error: any) {
      console.error('Shopify get products error:', error)
      return []
    }
  }

  async createOrder(params: OrderParams, userId: string): Promise<OrderResult> {
    try {
      const credentials = await this.getShopifyCredentials(userId)
      
      const orderData = {
        order: {
          line_items: params.lineItems.map(item => ({
            variant_id: item.variantId ? parseInt(item.variantId) : undefined,
            product_id: item.productId ? parseInt(item.productId) : undefined,
            quantity: item.quantity,
            price: item.price?.toString(),
            title: item.title
          })),
          customer: params.customerId ? { id: parseInt(params.customerId) } : undefined,
          email: params.email,
          phone: params.phone,
          note: params.note,
          tags: params.tags ? params.tags.join(', ') : '',
          shipping_address: params.shippingAddress,
          billing_address: params.billingAddress,
          financial_status: params.financialStatus || 'pending',
          fulfillment_status: params.fulfillmentStatus,
          metafields: params.metadata ? Object.entries(params.metadata).map(([key, value]) => ({
            namespace: 'custom',
            key: key,
            value: String(value),
            type: 'single_line_text_field'
          })) : []
        }
      }
      
      const response = await fetch(`https://${credentials.shopDomain}/admin/api/2023-10/orders.json`, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': credentials.accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(orderData)
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to create order: ${response.status} - ${errorData.errors || response.statusText}`)
      }
      
      const result = await response.json()
      
      return {
        success: true,
        output: {
          orderId: result.order.id.toString(),
          orderNumber: result.order.order_number.toString(),
          totalPrice: parseFloat(result.order.total_price),
          shopifyResponse: result.order
        },
        message: 'Order created successfully in Shopify'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to create order in Shopify',
        output: { error: error.message }
      }
    }
  }

  async updateOrder(orderId: string, updates: Partial<OrderParams>, userId: string): Promise<OrderResult> {
    try {
      const credentials = await this.getShopifyCredentials(userId)
      
      const updateData: any = {
        order: {
          id: parseInt(orderId)
        }
      }
      
      if (updates.email) updateData.order.email = updates.email
      if (updates.phone) updateData.order.phone = updates.phone
      if (updates.note) updateData.order.note = updates.note
      if (updates.tags) updateData.order.tags = updates.tags.join(', ')
      if (updates.financialStatus) updateData.order.financial_status = updates.financialStatus
      if (updates.fulfillmentStatus) updateData.order.fulfillment_status = updates.fulfillmentStatus
      
      const response = await fetch(`https://${credentials.shopDomain}/admin/api/2023-10/orders/${orderId}.json`, {
        method: 'PUT',
        headers: {
          'X-Shopify-Access-Token': credentials.accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to update order: ${response.status} - ${errorData.errors || response.statusText}`)
      }
      
      const result = await response.json()
      
      return {
        success: true,
        output: {
          orderId: result.order.id.toString(),
          orderNumber: result.order.order_number.toString(),
          totalPrice: parseFloat(result.order.total_price),
          shopifyResponse: result.order
        },
        message: 'Order updated successfully in Shopify'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to update order in Shopify',
        output: { error: error.message }
      }
    }
  }

  async getOrder(orderId: string, userId: string): Promise<OrderInfo> {
    const credentials = await this.getShopifyCredentials(userId)
    
    const response = await fetch(`https://${credentials.shopDomain}/admin/api/2023-10/orders/${orderId}.json`, {
      headers: {
        'X-Shopify-Access-Token': credentials.accessToken,
        'Content-Type': 'application/json'
      }
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to get order: ${response.status} - ${errorData.errors || response.statusText}`)
    }
    
    const data = await response.json()
    const order = data.order
    
    return {
      id: order.id.toString(),
      orderNumber: order.order_number.toString(),
      customerId: order.customer?.id?.toString(),
      email: order.email || '',
      totalPrice: parseFloat(order.total_price),
      subtotalPrice: parseFloat(order.subtotal_price),
      totalTax: parseFloat(order.total_tax),
      currency: order.currency,
      financialStatus: order.financial_status,
      fulfillmentStatus: order.fulfillment_status || 'unfulfilled',
      lineItems: order.line_items?.map((item: any) => ({
        id: item.id.toString(),
        productId: item.product_id?.toString(),
        variantId: item.variant_id?.toString(),
        title: item.title,
        quantity: item.quantity,
        price: parseFloat(item.price),
        totalDiscount: parseFloat(item.total_discount)
      })) || [],
      shippingAddress: order.shipping_address,
      billingAddress: order.billing_address,
      createdAt: new Date(order.created_at),
      updatedAt: new Date(order.updated_at),
      tags: order.tags ? order.tags.split(', ') : []
    }
  }

  async getOrders(filters?: OrderFilters, userId?: string): Promise<OrderInfo[]> {
    if (!userId) {
      throw new Error('User ID is required for getOrders')
    }

    try {
      const credentials = await this.getShopifyCredentials(userId)
      
      const params = new URLSearchParams()
      
      if (filters?.limit) {
        params.append('limit', Math.min(filters.limit, 250).toString())
      } else {
        params.append('limit', '50')
      }
      
      if (filters?.financialStatus) {
        params.append('financial_status', filters.financialStatus)
      }
      
      if (filters?.fulfillmentStatus) {
        params.append('fulfillment_status', filters.fulfillmentStatus)
      }
      
      if (filters?.dateRange) {
        params.append('created_at_min', filters.dateRange.start.toISOString())
        params.append('created_at_max', filters.dateRange.end.toISOString())
      }
      
      const url = `https://${credentials.shopDomain}/admin/api/2023-10/orders.json?${params.toString()}`
      
      const response = await fetch(url, {
        headers: {
          'X-Shopify-Access-Token': credentials.accessToken,
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to get orders from Shopify')
      }
      
      const data = await response.json()
      
      return (data.orders || []).map((order: any) => ({
        id: order.id.toString(),
        orderNumber: order.order_number.toString(),
        customerId: order.customer?.id?.toString(),
        email: order.email || '',
        totalPrice: parseFloat(order.total_price),
        subtotalPrice: parseFloat(order.subtotal_price),
        totalTax: parseFloat(order.total_tax),
        currency: order.currency,
        financialStatus: order.financial_status,
        fulfillmentStatus: order.fulfillment_status || 'unfulfilled',
        lineItems: order.line_items?.map((item: any) => ({
          id: item.id.toString(),
          productId: item.product_id?.toString(),
          variantId: item.variant_id?.toString(),
          title: item.title,
          quantity: item.quantity,
          price: parseFloat(item.price),
          totalDiscount: parseFloat(item.total_discount)
        })) || [],
        shippingAddress: order.shipping_address,
        billingAddress: order.billing_address,
        createdAt: new Date(order.created_at),
        updatedAt: new Date(order.updated_at),
        tags: order.tags ? order.tags.split(', ') : []
      }))
    } catch (error: any) {
      console.error('Shopify get orders error:', error)
      return []
    }
  }

  async updateInventory(productId: string, quantity: number, userId: string): Promise<InventoryResult> {
    try {
      const credentials = await this.getShopifyCredentials(userId)
      
      // Get product variants first to find inventory item IDs
      const productResponse = await fetch(`https://${credentials.shopDomain}/admin/api/2023-10/products/${productId}.json`, {
        headers: {
          'X-Shopify-Access-Token': credentials.accessToken,
          'Content-Type': 'application/json'
        }
      })
      
      if (!productResponse.ok) {
        throw new Error('Failed to get product for inventory update')
      }
      
      const productData = await productResponse.json()
      const variant = productData.product.variants[0] // Update first variant
      
      if (!variant.inventory_item_id) {
        throw new Error('Product variant does not have inventory tracking enabled')
      }
      
      // Update inventory level
      const inventoryData = {
        inventory_level: {
          inventory_item_id: variant.inventory_item_id,
          available: quantity
        }
      }
      
      const response = await fetch(`https://${credentials.shopDomain}/admin/api/2023-10/inventory_levels/set.json`, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': credentials.accessToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(inventoryData)
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to update inventory: ${response.status} - ${errorData.errors || response.statusText}`)
      }
      
      const result = await response.json()
      
      return {
        success: true,
        output: {
          productId: productId,
          inventoryQuantity: result.inventory_level.available,
          shopifyResponse: result.inventory_level
        },
        message: 'Inventory updated successfully in Shopify'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to update inventory in Shopify',
        output: { error: error.message }
      }
    }
  }

  async getInventory(filters?: InventoryFilters, userId?: string): Promise<InventoryInfo[]> {
    if (!userId) {
      throw new Error('User ID is required for getInventory')
    }

    try {
      const credentials = await this.getShopifyCredentials(userId)
      
      // Get products to get inventory information
      const params = new URLSearchParams()
      params.append('limit', '250')
      
      const url = `https://${credentials.shopDomain}/admin/api/2023-10/products.json?${params.toString()}`
      
      const response = await fetch(url, {
        headers: {
          'X-Shopify-Access-Token': credentials.accessToken,
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to get inventory from Shopify')
      }
      
      const data = await response.json()
      const inventory: InventoryInfo[] = []
      
      for (const product of data.products || []) {
        for (const variant of product.variants || []) {
          if (filters?.productId && product.id.toString() !== filters.productId) {
            continue
          }
          
          if (filters?.sku && variant.sku !== filters.sku) {
            continue
          }
          
          if (filters?.lowStock && variant.inventory_quantity > 10) {
            continue
          }
          
          inventory.push({
            productId: product.id.toString(),
            variantId: variant.id.toString(),
            sku: variant.sku || '',
            inventoryQuantity: variant.inventory_quantity || 0,
            inventoryPolicy: variant.inventory_policy || 'deny',
            inventoryManagement: variant.inventory_management || 'shopify',
            updatedAt: new Date(variant.updated_at)
          })
        }
      }
      
      if (filters?.limit) {
        return inventory.slice(0, filters.limit)
      }
      
      return inventory
    } catch (error: any) {
      console.error('Shopify get inventory error:', error)
      return []
    }
  }

  private async getShopifyCredentials(userId: string): Promise<{ shopDomain: string; accessToken: string }> {
    // Get access token which should contain both shop domain and access token
    const accessToken = await getDecryptedAccessToken(userId, 'shopify')
    
    // For Shopify, we need both shop domain and access token
    // This could be stored as JSON: {"shop": "mystore.myshopify.com", "token": "shpat_..."}
    try {
      const credentials = JSON.parse(accessToken)
      return {
        shopDomain: credentials.shop,
        accessToken: credentials.token
      }
    } catch {
      // Fallback: assume the token contains shop domain and token separated by |
      const parts = accessToken.split('|')
      if (parts.length === 2) {
        return {
          shopDomain: parts[0],
          accessToken: parts[1]
        }
      }
      
      throw new Error('Invalid Shopify credentials format. Expected JSON or shop|token format.')
    }
  }

  classifyError(error: Error): ErrorClassification {
    const message = error.message.toLowerCase()
    
    if (message.includes('unauthorized') || message.includes('invalid access token')) {
      return 'authentication'
    }
    if (message.includes('forbidden') || message.includes('insufficient privileges')) {
      return 'authorization'
    }
    if (message.includes('rate limit') || message.includes('exceeded')) {
      return 'rateLimit'
    }
    if (message.includes('network') || message.includes('timeout')) {
      return 'network'
    }
    if (message.includes('not found') || message.includes('does not exist')) {
      return 'notFound'
    }
    if (message.includes('invalid') || message.includes('bad request')) {
      return 'validation'
    }
    if (message.includes('unprocessable entity') || message.includes('validation')) {
      return 'validation'
    }
    
    return 'unknown'
  }
}