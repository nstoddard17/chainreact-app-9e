---
title: Webhook System - Complete Integration Webhook Management
date: 2024-12-19
component: WebhookSystem
---

# Webhook System

A comprehensive dual webhook system that provides both custom user-defined webhooks and automatic integration-specific webhooks for all available integrations in the workflow builder.

## Overview

The webhook system consists of two main components:

1. **Custom Webhooks** - User-defined webhook endpoints for external services
2. **Integration Webhooks** - Automatic webhook configurations for all workflow builder integrations

## Architecture

### Dual Webhook System

```
┌─────────────────┐    ┌─────────────────────┐
│   Custom        │    │   Integration       │
│   Webhooks      │    │   Webhooks          │
│                 │    │                     │
│ • User-defined  │    │ • Auto-generated    │
│ • External URLs │    │ • Integration URLs  │
│ • Custom logic  │    │ • Trigger mapping   │
└─────────────────┘    └─────────────────────┘
         │                       │
         └───────────────────────┼───────────────────────┐
                                 │                       │
                    ┌─────────────────────────────────────┐
                    │         Webhook Manager             │
                    │                                     │
                    │ • Registration/Unregistration       │
                    │ • Payload Transformation            │
                    │ • Security Validation               │
                    │ • Error Handling                    │
                    └─────────────────────────────────────┘
```

## Components

### 1. Custom Webhook Manager

**File:** `components/webhooks/CustomWebhookManager.tsx`

**Purpose:** Manages user-defined webhook endpoints

**Features:**
- Create, edit, delete custom webhooks
- Test webhook endpoints
- View execution history
- Template variable support
- Security validation

**Key Functions:**
```typescript
// Create custom webhook
const createWebhook = async (webhookData: {
  name: string
  webhook_url: string
  method: string
  headers: Record<string, string>
  body_template: string
}) => Promise<WebhookConfig>

// Test webhook
const testWebhook = async (webhookId: string) => Promise<TestResult>

// Get execution history
const getExecutions = async (webhookId: string) => Promise<WebhookExecution[]>
```

### 2. Integration Webhook Manager

**File:** `components/webhooks/IntegrationWebhookManager.tsx`

**Purpose:** Displays automatic webhook configurations for all integrations

**Features:**
- Shows all 30+ available integrations
- Displays webhook URLs for each integration
- Setup instructions for developer portals
- Trigger type mapping
- Execution monitoring

**Supported Integrations:**
- **Communication:** Gmail, Slack, Teams, Discord, Outlook
- **Productivity:** Google Calendar, Google Sheets, Notion, OneNote
- **Development:** GitHub, GitLab
- **Social:** Twitter, Facebook, Instagram, LinkedIn, YouTube, TikTok
- **eCommerce:** Stripe, Shopify, PayPal, Gumroad
- **CRM:** HubSpot, Mailchimp
- **Storage:** OneDrive, Dropbox, Box
- **And many more...**

### 3. Webhook API Endpoints

**Custom Webhooks:**
- `GET /api/custom-webhooks` - List custom webhooks
- `POST /api/custom-webhooks` - Create custom webhook
- `GET /api/custom-webhooks/[id]` - Get webhook details
- `PUT /api/custom-webhooks/[id]` - Update webhook
- `DELETE /api/custom-webhooks/[id]` - Delete webhook
- `POST /api/custom-webhooks/[id]/test` - Test webhook
- `GET /api/custom-webhooks/[id]/executions` - Get execution history

**Integration Webhooks:**
- `GET /api/integration-webhooks` - List all integration webhooks
- `GET /api/integration-webhooks/executions/[id]` - Get execution history

**Workflow Webhooks:**
- `POST /api/webhooks/[workflowId]` - Receive webhook triggers for workflows

### 4. Database Schema

**Custom Webhooks Table:**
```sql
CREATE TABLE webhook_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  webhook_url TEXT NOT NULL,
  method VARCHAR(10) DEFAULT 'POST',
  headers JSONB DEFAULT '{}',
  body_template TEXT,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Integration Webhooks Table:**
```sql
CREATE TABLE integration_webhooks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  provider_id VARCHAR(100) NOT NULL,
  webhook_url TEXT NOT NULL,
  trigger_types TEXT[] NOT NULL DEFAULT '{}',
  integration_config JSONB DEFAULT '{}',
  external_config JSONB DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'active',
  last_triggered TIMESTAMP WITH TIME ZONE,
  trigger_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

**Webhook Executions Table:**
```sql
CREATE TABLE webhook_executions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_id UUID NOT NULL,
  user_id UUID NOT NULL,
  provider_id VARCHAR(100),
  trigger_type VARCHAR(100),
  payload JSONB,
  headers JSONB,
  status VARCHAR(20) DEFAULT 'pending',
  response_code INTEGER,
  response_body TEXT,
  error_message TEXT,
  execution_time_ms INTEGER,
  triggered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Integration Mapping

### Trigger Types by Integration

**Gmail:**
- `gmail_trigger_new_email`
- `gmail_trigger_new_attachment`
- `gmail_trigger_new_label`

**Slack:**
- `slack_trigger_new_message`
- `slack_trigger_new_reaction`
- `slack_trigger_slash_command`

**GitHub:**
- `github_trigger_new_commit`

**Stripe:**
- `stripe_trigger_new_payment`

**And 80+ more trigger types across all integrations...**

### Webhook URL Patterns

**Custom Webhooks:**
```
https://your-domain.com/api/webhooks/{webhookId}
```

**Integration Webhooks:**
```
https://your-domain.com/api/integration-webhooks/{providerId}
```

**Workflow Webhooks:**
```
https://your-domain.com/api/webhooks/{workflowId}
```

## Security Features

### 1. Authentication
- All webhook endpoints require user authentication
- RLS policies ensure users can only access their own webhooks

### 2. Payload Validation
- Custom webhooks support template variable validation
- Integration webhooks validate against provider-specific schemas

### 3. Rate Limiting
- Built-in rate limiting for webhook executions
- Error tracking and monitoring

### 4. HTTPS Enforcement
- All webhook URLs must use HTTPS
- Certificate validation for external webhooks

## Usage Examples

### Creating a Custom Webhook

```typescript
const webhookData = {
  name: "Customer Notification",
  webhook_url: "https://api.example.com/webhooks/customer",
  method: "POST",
  headers: {
    "Authorization": "Bearer {{api_key}}",
    "Content-Type": "application/json"
  },
  body_template: `{
    "customer_id": "{{data.customer_id}}",
    "event": "{{data.event_type}}",
    "timestamp": "{{timestamp}}"
  }`
}

const webhook = await createCustomWebhook(webhookData)
```

### Setting Up Integration Webhooks

1. Navigate to the Integration Webhooks tab
2. Find your desired integration (e.g., Gmail)
3. Copy the webhook URL
4. Add the URL to your Gmail API configuration
5. Configure the trigger types you want to monitor

### Testing Webhooks

```typescript
// Test custom webhook
const testResult = await testWebhook(webhookId)

// View execution history
const executions = await getWebhookExecutions(webhookId)
```

## Error Handling

### Common Error Scenarios

1. **Invalid Webhook URL**
   - Validates URL format
   - Ensures HTTPS protocol
   - Checks for valid domain

2. **Authentication Failures**
   - Handles expired tokens
   - Retries with refresh tokens
   - Logs authentication errors

3. **Payload Validation Errors**
   - Validates JSON structure
   - Checks required fields
   - Provides detailed error messages

4. **Rate Limiting**
   - Implements exponential backoff
   - Queues failed requests
   - Monitors rate limit headers

## Monitoring and Analytics

### Metrics Tracked

- **Total Integrations:** Number of available integrations
- **Active Webhooks:** Number of active webhook configurations
- **Total Triggers:** Sum of all trigger types across integrations
- **Setup Required:** Number of webhooks needing configuration

### Execution Monitoring

- **Success Rate:** Percentage of successful webhook executions
- **Response Times:** Average execution time in milliseconds
- **Error Rates:** Number of failed executions per webhook
- **Last Triggered:** Timestamp of most recent execution

## Best Practices

### 1. Webhook Design

- Use descriptive names for custom webhooks
- Include proper error handling in webhook logic
- Implement idempotency for webhook handlers
- Use appropriate HTTP status codes

### 2. Security

- Always use HTTPS for webhook URLs
- Implement webhook signature verification
- Use environment variables for sensitive data
- Regularly rotate API keys and tokens

### 3. Performance

- Keep webhook payloads small and focused
- Use async processing for long-running operations
- Implement proper timeout handling
- Monitor webhook execution times

### 4. Reliability

- Implement retry logic for failed webhooks
- Use dead letter queues for persistent failures
- Monitor webhook health and uptime
- Set up alerts for webhook failures

## Troubleshooting

### Common Issues

1. **Webhook Not Triggering**
   - Check webhook URL accessibility
   - Verify authentication credentials
   - Review webhook configuration

2. **Payload Format Issues**
   - Validate JSON structure
   - Check required fields
   - Review template variables

3. **Rate Limiting**
   - Monitor rate limit headers
   - Implement exponential backoff
   - Consider webhook batching

4. **Authentication Errors**
   - Verify API keys and tokens
   - Check token expiration
   - Review authentication headers

## Future Enhancements

### Planned Features

1. **Webhook Templates**
   - Pre-built webhook configurations
   - Industry-specific templates
   - Community webhook library

2. **Advanced Monitoring**
   - Real-time webhook health dashboard
   - Performance analytics
   - Predictive failure detection

3. **Webhook Marketplace**
   - Third-party webhook integrations
   - Custom webhook plugins
   - Webhook sharing and collaboration

4. **Enhanced Security**
   - Webhook signature verification
   - IP whitelisting
   - Advanced authentication methods

## Related Files

- `components/webhooks/CustomWebhookManager.tsx`
- `components/webhooks/IntegrationWebhookManager.tsx`
- `app/api/custom-webhooks/route.ts`
- `app/api/integration-webhooks/route.ts`
- `app/api/webhooks/[workflowId]/route.ts`
- `db/migrations/create_webhook_tables.sql`
- `db/migrations/create_integration_webhooks_table.sql`
- `lib/workflows/availableNodes.ts`
- `lib/integrations/availableIntegrations.ts` 