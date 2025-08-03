---
title: Integration Webhooks System
date: 2025-01-02
component: IntegrationWebhooks
---

# Integration Webhooks System

The Integration Webhooks system provides a comprehensive interface for managing webhook configurations for all available integrations in ChainReact.

## Overview

The system consists of:
- **API Endpoint**: `/api/integration-webhooks` - Returns webhook configurations for all available integrations
- **Frontend Component**: `IntegrationWebhookManager` - Displays webhook configurations in a user-friendly interface
- **Configuration Source**: `availableIntegrations.ts` - Defines all available integrations and their capabilities

## Architecture

### API Layer (`app/api/integration-webhooks/route.ts`)

The API endpoint provides webhook configurations by:

1. **Database First**: Attempts to query existing webhook configurations from the `integration_webhooks` table
2. **Fallback Generation**: If no database data exists, generates webhook configurations from available integrations
3. **Dynamic Configuration**: Creates appropriate webhook URLs, trigger types, and setup instructions for each integration

### Key Features

- **Automatic Webhook URL Generation**: Each integration gets appropriate webhook URLs based on their API specifications
- **Trigger Type Mapping**: Defines specific trigger types for each integration (e.g., `gmail_trigger_new_email`)
- **Setup Instructions**: Provides step-by-step instructions for configuring webhooks in external platforms
- **Status Tracking**: Tracks webhook status (active/inactive/error) and execution metrics

### Integration Categories

The system supports integrations across multiple categories:

- **Communication**: Gmail, Slack, Discord, Microsoft Teams, Outlook
- **Productivity**: Google Calendar, Google Sheets, Google Drive, Google Docs, Notion, Trello
- **Social Media**: Twitter, Facebook, Instagram, TikTok, LinkedIn, YouTube
- **Development**: GitHub, GitLab
- **Business**: HubSpot, Airtable, Mailchimp, Shopify, Stripe, PayPal
- **Storage**: OneDrive, Dropbox, Box
- **AI & Logic**: AI Agent, Logic & Control

## Usage

### API Response Format

```typescript
interface IntegrationWebhook {
  id: string
  user_id: string
  provider_id: string
  webhook_url: string
  trigger_types: string[]
  integration_config: Record<string, any>
  external_config: {
    type: string
    setup_required: boolean
    instructions: string
    integration_name: string
    category: string
    capabilities: string[]
  }
  status: 'active' | 'inactive' | 'error'
  last_triggered: string | null
  trigger_count: number
  error_count: number
  created_at: string
  updated_at: string
}
```

### Frontend Integration

The `IntegrationWebhookManager` component provides:

- **Table View**: Displays all webhook configurations in a sortable table
- **Details Dialog**: Shows detailed setup instructions and webhook URLs
- **Copy Functionality**: Easy copying of webhook URLs to clipboard
- **Status Indicators**: Visual status badges for each webhook
- **Execution History**: Tracks webhook execution history and errors

## Configuration

### Adding New Integrations

To add a new integration to the webhook system:

1. **Update `availableIntegrations.ts`**: Add the integration configuration
2. **Add Webhook URL**: Update the `getWebhookUrl()` function with the appropriate URL
3. **Define Trigger Types**: Add trigger types to the `getTriggerTypes()` function
4. **Provide Setup Instructions**: Add instructions to the `getSetupInstructions()` function

### Example Integration Addition

```typescript
// In availableIntegrations.ts
newIntegration: {
  id: "new-integration",
  name: "New Integration",
  description: "Description of the integration",
  category: "category",
  capabilities: ["capability1", "capability2"],
  scopes: ["scope1", "scope2"],
  isAvailable: true,
  requiresClientId: "NEW_INTEGRATION_CLIENT_ID",
  requiresClientSecret: "NEW_INTEGRATION_CLIENT_SECRET",
  color: "#000000",
  docsUrl: "https://docs.example.com",
  authType: "oauth"
}

// In the API route, add to the mapping functions:
const webhookUrls = {
  // ... existing URLs
  'new-integration': 'https://api.newintegration.com/webhooks'
}

const triggerTypes = {
  // ... existing types
  'new-integration': ['new-integration_trigger_event1', 'new-integration_trigger_event2']
}

const instructions = {
  // ... existing instructions
  'new-integration': 'Set up New Integration webhooks in your account'
}
```

## Error Handling

The system includes robust error handling:

- **Database Errors**: Gracefully falls back to generated configurations
- **Authentication Errors**: Returns proper 401 responses
- **Missing Integrations**: Provides default configurations for unknown integrations
- **Type Safety**: TypeScript ensures proper type checking throughout

## Future Enhancements

- **Database Persistence**: Run migrations to create the `integration_webhooks` table
- **Webhook Execution Tracking**: Implement actual webhook endpoint handlers
- **Real-time Monitoring**: Add live webhook execution monitoring
- **Webhook Templates**: Create reusable webhook configuration templates
- **Advanced Analytics**: Add detailed webhook performance analytics 