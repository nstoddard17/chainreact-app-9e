# Webhook Trigger Implementation Guide

## Overview

The webhook trigger allows workflows to be triggered by external HTTP requests. This is perfect for custom integrations, third-party services, form submissions, IoT devices, and any system that can make HTTP requests.

## Implementation Status: ✅ Complete

**Date Completed**: November 10, 2025

### What Was Implemented

1. **Trigger Lifecycle** (`lib/triggers/providers/WebhookTriggerLifecycle.ts`)
   - Generates unique webhook URLs on activation
   - Manages webhook configuration and state
   - Handles cleanup on deactivation/deletion
   - Health check verification

2. **Node Definition** (`lib/workflows/nodes/providers/automation/webhook.ts`)
   - Removed `comingSoon` flag
   - Added `providerId: "webhook"`
   - Comprehensive config schema (path, method)
   - Complete output schema (body, headers, query, etc.)

3. **Configuration UI** (`components/workflows/configuration/providers/WebhookConfiguration.tsx`)
   - Displays webhook URL with copy button
   - Shows activation status
   - Example cURL request
   - Documentation for available variables
   - Configuration fields for webhook settings

4. **Security Features** (`app/api/workflow-webhooks/[workflowId]/route.ts`)
   - Optional HMAC SHA-256 signature verification
   - Timing-safe signature comparison (prevents timing attacks)
   - Checks `X-Webhook-Signature` or `X-Hub-Signature-256` headers
   - Auto-generated HMAC secret stored securely

5. **Registry Integration**
   - Registered in trigger lifecycle registry (`lib/triggers/index.ts`)
   - Added to configuration form routing (`components/workflows/configuration/ConfigurationForm.tsx`)

## How It Works

### 1. Activation Flow

When a workflow with a webhook trigger is activated:

```typescript
1. WebhookTriggerLifecycle.onActivate() is called
2. Generates unique webhook ID (32 hex characters)
3. Generates HMAC secret for signature verification
4. Constructs webhook URL: {baseUrl}/api/workflow-webhooks/{workflowId}
5. Stores configuration in trigger_resources table
6. Creates webhook_configs entry for tracking
```

### 2. Webhook URL Structure

```
https://chainreact.app/api/workflow-webhooks/{workflowId}
```

- **Public endpoint** - No authentication required (unless HMAC enabled)
- **workflowId** - The ID of the workflow to trigger
- **Method** - Configured in node (default: POST)

### 3. Request Format

**Headers:**
```
Content-Type: application/json
X-Webhook-Signature: {hmac-sha256-signature}  (optional, if enabled)
```

**Body:**
```json
{
  "key": "value",
  "any": "data",
  "you": "want"
}
```

### 4. Response Format

**Success (202 Accepted):**
```json
{
  "success": true,
  "sessionId": "execution-session-id"
}
```

**Error (4xx/5xx):**
```json
{
  "error": "Error message",
  "details": []
}
```

## Available Variables

When a webhook is triggered, the following variables are available in the workflow:

| Variable | Type | Description | Example |
|----------|------|-------------|---------|
| `body` | object | Parsed JSON body or raw body | `{{{trigger.body.name}}}` |
| `headers` | object | All HTTP request headers | `{{{trigger.headers.content-type}}}` |
| `method` | string | HTTP method used | `{{{trigger.method}}}` → "POST" |
| `query` | object | URL query parameters | `{{{trigger.query.id}}}` |
| `path` | string | Request path | `{{{trigger.path}}}` |
| `timestamp` | string | When triggered (ISO 8601) | `{{{trigger.timestamp}}}` |
| `ip` | string | Client IP address | `{{{trigger.ip}}}` |
| `userAgent` | string | User agent string | `{{{trigger.userAgent}}}` |

## Security Features

### HMAC Signature Verification

**How It Works:**

1. Server generates HMAC secret on activation (stored in `trigger_resources.config.hmacSecret`)
2. Client computes HMAC-SHA256 signature: `HMAC-SHA256(request_body, secret)`
3. Client sends signature in `X-Webhook-Signature` header
4. Server verifies signature matches before executing workflow

**Enable Signature Verification:**

Currently auto-enabled when workflow is activated. To require signatures:

```typescript
// In trigger_resources.config
{
  hmacSecret: "auto-generated-secret",
  requireSignature: true  // Set to true to enforce
}
```

**Client Example (Node.js):**

```javascript
const crypto = require('crypto');

const payload = JSON.stringify({ key: 'value' });
const secret = 'your-hmac-secret';

const signature = crypto
  .createHmac('sha256', secret)
  .update(payload)
  .digest('hex');

fetch('https://chainreact.app/api/workflow-webhooks/{workflowId}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Webhook-Signature': signature
  },
  body: payload
});
```

**Client Example (Python):**

```python
import hmac
import hashlib
import requests
import json

payload = json.dumps({'key': 'value'})
secret = b'your-hmac-secret'

signature = hmac.new(
    secret,
    payload.encode('utf-8'),
    hashlib.sha256
).hexdigest()

requests.post(
    'https://chainreact.app/api/workflow-webhooks/{workflowId}',
    headers={
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature
    },
    data=payload
)
```

## Configuration Options

### Node Configuration Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | text | No | Custom path for webhook (currently not used, URL is fixed) |
| `method` | select | No | HTTP method (POST, GET, PUT) - default: POST |

### Future Enhancements (Not Implemented)

These could be added in the future:

- [ ] **Rate Limiting** - Limit requests per minute/hour
- [ ] **IP Whitelisting** - Only accept requests from specific IPs
- [ ] **Custom Response** - Return custom JSON response to caller
- [ ] **Payload Schema Validation** - Define required fields and types
- [ ] **Webhook History** - View last 100 webhook calls with payloads
- [ ] **Test Webhook Button** - Send test payload from UI
- [ ] **Webhook Replay** - Replay previous webhook calls
- [ ] **Multiple Methods** - Same workflow responds to GET/POST/PUT differently

## Database Schema

### trigger_resources Table

```sql
{
  workflow_id: uuid,
  user_id: uuid,
  provider_id: 'webhook',
  trigger_type: 'webhook',
  node_id: string,
  resource_type: 'webhook',
  external_id: string,  -- Webhook ID (32 hex chars)
  config: {
    webhookId: string,
    webhookUrl: string,
    hmacSecret: string,
    path: string,
    method: string,
    createdAt: string,
    requireSignature: boolean
  },
  status: 'active' | 'deleted'
}
```

### webhook_configs Table

```sql
{
  id: uuid,
  user_id: uuid,
  workflow_id: uuid,
  name: string,
  description: string,
  webhook_url: string,
  method: string,
  headers: object,
  trigger_type: string,
  provider_id: 'webhook',
  status: 'active' | 'inactive',
  last_triggered: timestamp,
  error_count: integer
}
```

## Testing

### Manual Test

1. Create a new workflow
2. Add "Webhook" trigger from Triggers category
3. Configure webhook settings (method, etc.)
4. Save and activate workflow
5. Copy webhook URL from configuration modal
6. Send test request:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"test": "hello"}' \
  https://chainreact.app/api/workflow-webhooks/your-workflow-id
```

7. Check workflow execution logs

### Integration Test

**Test HMAC signature verification:**

```bash
# Generate signature
payload='{"test":"data"}'
secret='your-hmac-secret'
signature=$(echo -n "$payload" | openssl dgst -sha256 -hmac "$secret" -hex | sed 's/^.* //')

# Send request
curl -X POST \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Signature: $signature" \
  -d "$payload" \
  https://chainreact.app/api/workflow-webhooks/your-workflow-id
```

## Common Issues

### Issue: Webhook returns 404

**Cause**: Workflow is not activated or webhook trigger not found

**Solution**:
1. Ensure workflow is activated (toggle in UI)
2. Verify workflow has a webhook trigger node
3. Check workflow ID in URL matches the workflow

### Issue: "Webhook signature required"

**Cause**: Workflow has `requireSignature: true` but no signature provided

**Solution**:
1. Add `X-Webhook-Signature` header with HMAC-SHA256 signature
2. Use the HMAC secret from trigger configuration
3. Or disable signature requirement (set `requireSignature: false`)

### Issue: "Invalid webhook signature"

**Cause**: Computed signature doesn't match server's computation

**Solution**:
1. Ensure you're using the correct HMAC secret
2. Verify you're hashing the RAW request body (not parsed JSON)
3. Use HMAC-SHA256 algorithm
4. Send signature as hex string

## Best Practices

### 1. Always Use HTTPS in Production

```typescript
// ✅ GOOD
const baseUrl = 'https://chainreact.app'

// ❌ BAD (only for local testing)
const baseUrl = 'http://localhost:3000'
```

### 2. Validate Incoming Data

Even though webhook accepts any JSON, validate data in your workflow:

```
1. Webhook Trigger (receives data)
2. Filter Node (validate data.email exists)
3. Rest of workflow
```

### 3. Use Signature Verification for Production

Enable HMAC signatures for any production webhooks to prevent:
- Unauthorized access
- Replay attacks
- Data tampering

### 4. Handle Errors Gracefully

The webhook endpoint returns success immediately and executes workflow async. Monitor execution logs for failures.

### 5. Document Your Webhook Contract

When integrating with external systems, document:
- Expected payload structure
- Required fields
- Authentication method (if HMAC enabled)
- Rate limits (if implemented)

## Example Use Cases

### 1. Form Submission Handler

```
Webhook Trigger → Extract fields → Send to Google Sheets → Send confirmation email
```

### 2. Payment Notification

```
Webhook Trigger (Stripe/PayPal) → Validate payment → Update database → Send receipt
```

### 3. IoT Device Integration

```
Webhook Trigger (device sensor data) → Check thresholds → Send alert if exceeded
```

### 4. CI/CD Pipeline Trigger

```
Webhook Trigger (GitHub) → Parse commit data → Run tests → Deploy if passed
```

### 5. Custom CRM Integration

```
Webhook Trigger (custom CRM) → Transform data → Create HubSpot contact → Notify team
```

## Files Modified/Created

### Created:
- `lib/triggers/providers/WebhookTriggerLifecycle.ts`
- `components/workflows/configuration/providers/WebhookConfiguration.tsx`
- `learning/docs/webhook-trigger-guide.md` (this file)

### Modified:
- `lib/triggers/index.ts` (registered webhook provider)
- `lib/workflows/nodes/providers/automation/webhook.ts` (removed comingSoon flag)
- `components/workflows/configuration/ConfigurationForm.tsx` (added routing)
- `app/api/workflow-webhooks/[workflowId]/route.ts` (added HMAC verification)

## Future Improvements

1. **Webhook Testing UI** - Built-in interface to send test requests
2. **Webhook History** - View last N webhook calls with payloads and results
3. **Custom Domains** - Allow webhooks at custom domains (webhooks.yourdomain.com)
4. **Webhook Templates** - Pre-built webhook configurations for common services
5. **Automatic Retry** - Retry failed webhook executions with exponential backoff
6. **Webhook Analytics** - Track call volume, success rate, response times

---

**Implementation Time**: ~4 hours
**Complexity**: Medium
**Status**: Production Ready ✅
