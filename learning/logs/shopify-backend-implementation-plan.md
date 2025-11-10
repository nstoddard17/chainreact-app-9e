# Shopify Backend Implementation Plan
**Date**: January 2025
**Status**: Ready to Implement
**Est. Time**: 1-2 weeks

---

## Overview

Phase 1 node definitions are complete (8 triggers, 12 actions). Now we need to implement:
1. **Action handlers** for 6 new actions
2. **Webhook handlers** for 3 new triggers
3. **Trigger lifecycle** registration
4. **Action registry** entries

---

## Existing Infrastructure ✅

### 1. Shopify API Client (`/app/api/integrations/shopify/data/utils.ts`)

Already provides:
```typescript
makeShopifyRequest(integration, endpoint, options)
// - Handles authentication
// - Decrypts access token
// - Makes authenticated requests to Shopify Admin API
// - Error handling with proper status codes

validateShopifyIntegration(integration)
// - Validates integration exists
// - Checks access token
// - Verifies shop domain

getShopDomain(integration)
getShopifyHeaders(integration)
```

**API Version**: `2024-01` (configured in utils.ts line 48)

---

## Action Handlers to Implement

### Pattern to Follow

```typescript
// File: /lib/workflows/actions/shopify/[actionName].ts
import { ActionResult } from '../index'
import { makeShopifyRequest, validateShopifyIntegration } from '@/app/api/integrations/shopify/data/utils'
import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { resolveValue } from '../core/resolveValue'
import { logger } from '@/lib/utils/logger'

export async function shopifyActionName(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // 1. Get and validate integration
    const integrationId = await resolveValue(config.integration_id || config.integrationId, input)
    const integration = await getDecryptedAccessToken(integrationId, userId, 'shopify')
    validateShopifyIntegration(integration)

    // 2. Resolve all config values
    const fieldValue = await resolveValue(config.field_name, input)

    // 3. Make API request
    const result = await makeShopifyRequest(integration, 'endpoint.json', {
      method: 'POST',
      body: JSON.stringify({ /* payload */ })
    })

    // 4. Return success
    return {
      success: true,
      output: {
        /* formatted output matching outputSchema */
      },
      message: 'Action completed successfully'
    }
  } catch (error: any) {
    logger.error('[Shopify Action] Error:', error)
    return {
      success: false,
      output: {},
      message: error.message || 'Action failed'
    }
  }
}
```

---

### 1. Update Product

**File**: `/lib/workflows/actions/shopify/updateProduct.ts`

**API Endpoint**: `PUT /admin/api/2024-01/products/{id}.json`

**Implementation**:
```typescript
export async function updateShopifyProduct(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const integrationId = await resolveValue(config.integration_id || config.integrationId, input)
    const integration = await getDecryptedAccessToken(integrationId, userId, 'shopify')
    validateShopifyIntegration(integration)

    // Resolve config values
    const productId = await resolveValue(config.product_id, input)
    const title = config.title ? await resolveValue(config.title, input) : undefined
    const bodyHtml = config.body_html ? await resolveValue(config.body_html, input) : undefined
    const vendor = config.vendor ? await resolveValue(config.vendor, input) : undefined
    const productType = config.product_type ? await resolveValue(config.product_type, input) : undefined
    const tags = config.tags ? await resolveValue(config.tags, input) : undefined
    const published = config.published ? await resolveValue(config.published, input) : undefined

    // Build payload (only include fields that were provided)
    const payload: any = {}
    if (title) payload.title = title
    if (bodyHtml) payload.body_html = bodyHtml
    if (vendor) payload.vendor = vendor
    if (productType) payload.product_type = productType
    if (tags) payload.tags = tags
    if (published !== undefined && published !== '') {
      payload.published = published === 'true'
    }

    // Extract numeric ID from GID if needed
    const numericId = extractNumericId(productId)

    // Make API request
    const result = await makeShopifyRequest(integration, `products/${numericId}.json`, {
      method: 'PUT',
      body: JSON.stringify({ product: payload })
    })

    const product = result.product
    const shopDomain = getShopDomain(integration)

    return {
      success: true,
      output: {
        success: true,
        product_id: product.id,
        title: product.title,
        admin_url: `https://${shopDomain}/admin/products/${product.id}`,
        updated_at: product.updated_at
      },
      message: 'Product updated successfully'
    }
  } catch (error: any) {
    logger.error('[Shopify] Update product error:', error)
    return {
      success: false,
      output: { success: false },
      message: error.message || 'Failed to update product'
    }
  }
}

// Helper function to extract numeric ID from GID format
function extractNumericId(id: string): string {
  if (id.includes('gid://')) {
    return id.split('/').pop() || id
  }
  return id
}
```

---

### 2. Update Customer

**File**: `/lib/workflows/actions/shopify/updateCustomer.ts`

**API Endpoint**: `PUT /admin/api/2024-01/customers/{id}.json`

**Payload Fields**:
- `email`, `first_name`, `last_name`, `phone`
- `tags` (comma-separated string)
- `note`
- `accepts_marketing` (boolean)

**Output**: Same pattern as Update Product

---

### 3. Create Fulfillment

**File**: `/lib/workflows/actions/shopify/createFulfillment.ts`

**API Endpoint**: `POST /admin/api/2024-01/fulfillments.json`

**⚠️ IMPORTANT**: Shopify's fulfillment API changed significantly. Use GraphQL or new REST endpoint.

**Implementation**:
```typescript
// Modern Shopify fulfillment uses FulfillmentOrder API
// 1. GET /admin/api/2024-01/orders/{order_id}/fulfillment_orders.json
// 2. POST /admin/api/2024-01/fulfillments.json with fulfillment_order_line_items

const payload = {
  fulfillment: {
    line_items_by_fulfillment_order: [
      {
        fulfillment_order_id: fulfillmentOrderId,
        // Optionally specify line items, or omit to fulfill all
      }
    ],
    tracking_info: {
      number: trackingNumber,
      company: trackingCompany,
      url: trackingUrl
    },
    notify_customer: notifyCustomer
  }
}
```

**Steps**:
1. Get order's fulfillment orders
2. Select first unfulfilled fulfillment order
3. Create fulfillment with tracking info

---

### 4. Create Product Variant

**File**: `/lib/workflows/actions/shopify/createProductVariant.ts`

**API Endpoint**: `POST /admin/api/2024-01/products/{product_id}/variants.json`

**Payload**:
```json
{
  "variant": {
    "option1": "Large",
    "option2": "Red",
    "option3": "Cotton",
    "price": "39.99",
    "sku": "PROD-LRG-RED",
    "inventory_quantity": 100,
    "weight": 1.5,
    "weight_unit": "lb",
    "barcode": "123456789012"
  }
}
```

---

### 5. Update Product Variant

**File**: `/lib/workflows/actions/shopify/updateProductVariant.ts`

**API Endpoint**: `PUT /admin/api/2024-01/variants/{id}.json`

**Payload**: Same fields as Create, all optional

---

### 6. Enhance Create Order

**File**: `/lib/workflows/actions/shopify/createOrder.ts` (create or enhance existing)

**API Endpoint**: `POST /admin/api/2024-01/orders.json`

**New Fields to Add**:
```typescript
// Add to existing payload
shipping_address: {
  address1: config.shipping_address_line1,
  address2: config.shipping_address_line2,
  city: config.shipping_city,
  province: config.shipping_province,
  country: config.shipping_country,
  zip: config.shipping_zip
},
billing_address: {
  address1: config.billing_address_line1 || config.shipping_address_line1,
  address2: config.billing_address_line2 || config.shipping_address_line2,
  city: config.billing_city || config.shipping_city,
  province: config.billing_province || config.shipping_province,
  country: config.billing_country || config.shipping_country,
  zip: config.billing_zip || config.shipping_zip
}
```

---

## Action Registry Entries

**File**: `/lib/workflows/actions/registry.ts`

Add these lines (around line 700+):

```typescript
// Shopify actions
import { updateShopifyProduct } from './shopify/updateProduct'
import { updateShopifyCustomer } from './shopify/updateCustomer'
import { createShopifyFulfillment } from './shopify/createFulfillment'
import { createShopifyProductVariant } from './shopify/createProductVariant'
import { updateShopifyProductVariant } from './shopify/updateProductVariant'
import { createShopifyOrder } from './shopify/createOrder' // If creating new

// ... in actionHandlerRegistry object:

"shopify_action_update_product": (params: { config: any; userId: string; input: Record<string, any> }) =>
  updateShopifyProduct(params.config, params.userId, params.input),
"shopify_action_update_customer": (params: { config: any; userId: string; input: Record<string, any> }) =>
  updateShopifyCustomer(params.config, params.userId, params.input),
"shopify_action_create_fulfillment": (params: { config: any; userId: string; input: Record<string, any> }) =>
  createShopifyFulfillment(params.config, params.userId, params.input),
"shopify_action_create_product_variant": (params: { config: any; userId: string; input: Record<string, any> }) =>
  createShopifyProductVariant(params.config, params.userId, params.input),
"shopify_action_update_product_variant": (params: { config: any; userId: string; input: Record<string, any> }) =>
  updateShopifyProductVariant(params.config, params.userId, params.input),
```

---

## Webhook Handlers (Triggers)

### Webhook Registration Pattern

**File**: `/lib/triggers/providers/ShopifyTriggerLifecycle.ts` (create new)

```typescript
import { TriggerLifecycle, TriggerActivationContext, TriggerDeactivationContext, TriggerHealthStatus } from '../types'
import { makeShopifyRequest, validateShopifyIntegration } from '@/app/api/integrations/shopify/data/utils'
import { getDecryptedAccessToken } from '@/lib/workflows/actions/core/getDecryptedAccessToken'
import { logger } from '@/lib/utils/logger'

export class ShopifyTriggerLifecycle implements TriggerLifecycle {
  async onActivate(context: TriggerActivationContext): Promise<void> {
    const { workflowId, userId, triggerType, config } = context

    // Map trigger type to Shopify webhook topic
    const topicMap: Record<string, string> = {
      'shopify_trigger_new_paid_order': 'orders/paid',
      'shopify_trigger_order_fulfilled': 'orders/fulfilled',
      'shopify_trigger_abandoned_cart': 'checkouts/create'
    }

    const topic = topicMap[triggerType]
    if (!topic) {
      throw new Error(`Unknown Shopify trigger type: ${triggerType}`)
    }

    // Get integration
    const integrationId = config.integration_id || config.integrationId
    const integration = await getDecryptedAccessToken(integrationId, userId, 'shopify')
    validateShopifyIntegration(integration)

    // Register webhook
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/workflow/shopify`

    const result = await makeShopifyRequest(integration, 'webhooks.json', {
      method: 'POST',
      body: JSON.stringify({
        webhook: {
          topic,
          address: webhookUrl,
          format: 'json'
        }
      })
    })

    // Save webhook ID to trigger_resources
    await saveTriggerResource({
      workflow_id: workflowId,
      external_id: result.webhook.id.toString(),
      provider: 'shopify',
      resource_type: 'webhook',
      metadata: { topic }
    })

    logger.info('[Shopify] Webhook registered:', { workflowId, topic, webhookId: result.webhook.id })
  }

  async onDeactivate(context: TriggerDeactivationContext): Promise<void> {
    // Get webhook ID from trigger_resources
    const resource = await getTriggerResource(context.workflowId)
    if (!resource) return

    // Delete webhook
    const integration = await getDecryptedAccessToken(context.integrationId, context.userId, 'shopify')
    await makeShopifyRequest(integration, `webhooks/${resource.external_id}.json`, {
      method: 'DELETE'
    })

    // Delete from trigger_resources
    await deleteTriggerResource(context.workflowId)

    logger.info('[Shopify] Webhook deleted:', { workflowId: context.workflowId, webhookId: resource.external_id })
  }

  async onDelete(context: TriggerDeactivationContext): Promise<void> {
    // Same as onDeactivate
    return this.onDeactivate(context)
  }

  async checkHealth(workflowId: string, userId: string): Promise<TriggerHealthStatus> {
    // Check if webhook still exists in Shopify
    const resource = await getTriggerResource(workflowId)
    if (!resource) {
      return { healthy: false, message: 'No webhook registered' }
    }

    try {
      const integration = await getDecryptedAccessToken(resource.integration_id, userId, 'shopify')
      await makeShopifyRequest(integration, `webhooks/${resource.external_id}.json`, {
        method: 'GET'
      })
      return { healthy: true }
    } catch (error) {
      return { healthy: false, message: 'Webhook not found in Shopify' }
    }
  }
}
```

### Register in Trigger Registry

**File**: `/lib/triggers/index.ts`

```typescript
import { ShopifyTriggerLifecycle } from './providers/ShopifyTriggerLifecycle'

// Add to registry
export const triggerLifecycleRegistry: Record<string, TriggerLifecycle> = {
  // ... existing triggers
  'shopify_trigger_new_paid_order': new ShopifyTriggerLifecycle(),
  'shopify_trigger_order_fulfilled': new ShopifyTriggerLifecycle(),
  'shopify_trigger_abandoned_cart': new ShopifyTriggerLifecycle(),
}
```

---

### Webhook Receiver Endpoint

**File**: `/app/api/workflow/shopify/route.ts` (create new)

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { processWebhook } from '@/lib/triggers/webhookProcessor'
import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const topic = request.headers.get('x-shopify-topic')

    logger.info('[Shopify Webhook] Received:', { topic })

    // Map topic to trigger type
    const triggerTypeMap: Record<string, string> = {
      'orders/paid': 'shopify_trigger_new_paid_order',
      'orders/fulfilled': 'shopify_trigger_order_fulfilled',
      'checkouts/create': 'shopify_trigger_abandoned_cart'
    }

    const triggerType = triggerTypeMap[topic || '']
    if (!triggerType) {
      return NextResponse.json({ error: 'Unknown webhook topic' }, { status: 400 })
    }

    // Process webhook
    await processWebhook({
      triggerType,
      payload: body,
      metadata: { topic }
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error('[Shopify Webhook] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
```

---

## Testing Checklist

### Action Testing

For each action:
1. Create test workflow with the action
2. Configure with test data
3. Run workflow execution
4. Verify API call made correctly
5. Verify output matches outputSchema
6. Test error cases (invalid ID, missing fields, etc.)

### Trigger Testing

For each trigger:
1. Create workflow with trigger
2. Activate workflow → verify webhook registered in Shopify
3. Trigger event in Shopify (place order, fulfill order, abandon cart)
4. Verify webhook received at `/api/workflow/shopify`
5. Verify workflow executes with correct payload
6. Deactivate workflow → verify webhook deleted

### Integration Testing

1. End-to-end: Trigger → Actions → Output
2. Test with real Shopify store
3. Test variable resolution ({{trigger.order_id}}, etc.)
4. Test AI fields ({{AI_FIELD:...}})

---

## Deployment Checklist

- [ ] All 6 action handlers implemented
- [ ] All handlers registered in action registry
- [ ] ShopifyTriggerLifecycle implemented
- [ ] Trigger registry updated
- [ ] Webhook receiver endpoint created
- [ ] All tests passing
- [ ] Error handling tested
- [ ] Documentation updated
- [ ] Migration notes (if any DB changes)

---

## Known Issues & Considerations

### 1. Shopify API Rate Limits
- **Standard**: 2 requests/second
- **Plus**: 4 requests/second
- **Solution**: Implement rate limiting/retry logic

### 2. Shopify GID Format
- Shopify uses GraphQL IDs like `gid://shopify/Product/123456789`
- REST API uses numeric IDs
- **Solution**: Extract numeric ID from GID (see helper function above)

### 3. Fulfillment API Changes
- Modern Shopify uses FulfillmentOrder API
- Old fulfillment API deprecated
- **Solution**: Use new fulfillment_order_line_items pattern

### 4. Webhook Verification
- Shopify sends `X-Shopify-Hmac-SHA256` header
- **TODO**: Implement HMAC verification for security
- **Reference**: https://shopify.dev/docs/apps/build/webhooks/subscribe/https#step-5-verify-the-webhook

### 5. Abandoned Cart Specifics
- `checkouts/create` fires immediately when cart created
- Need to filter by `completed_at` (null = abandoned)
- `minimum_value` filter happens in webhook processor

---

## Estimated Timeline

| Task | Time | Priority |
|------|------|----------|
| Create action handlers (6 actions) | 1-2 days | HIGH |
| Test action handlers | 0.5 days | HIGH |
| Create ShopifyTriggerLifecycle | 0.5 days | HIGH |
| Create webhook receiver | 0.5 days | HIGH |
| Test triggers end-to-end | 1 day | HIGH |
| HMAC verification | 0.5 days | MEDIUM |
| Error handling improvements | 0.5 days | MEDIUM |
| Documentation | 0.5 days | MEDIUM |
| **TOTAL** | **5-6 days** | |

With testing and iterations: **1-2 weeks to production**

---

## Next Steps

1. **Create action handlers** (start with Update Product)
2. **Register in action registry**
3. **Test with mock Shopify data**
4. **Implement trigger lifecycle**
5. **Test with real Shopify store**
6. **Deploy to staging**
7. **Production release**

---

**Last Updated**: January 2025
**Status**: Ready to begin implementation
