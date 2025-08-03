---
title: Webhook System Architecture
date: 2025-01-02
component: WebhookSystem
---

# Webhook System Architecture

## Overview

The ChainReact webhook system provides a standardized way to handle incoming webhooks from various third-party services including Google services, Discord, Slack, GitHub, Notion, and more. The system is designed to be scalable, secure, and maintainable.

## Architecture

### Webhook Endpoints

The system uses a standardized URL pattern for all webhook endpoints:

```
https://chainreact.app/api/webhooks/[provider]
```

#### Google Services
- **Google (Drive, Calendar, Docs, Sheets)**: `https://chainreact.app/api/webhooks/google`
- **Gmail**: `https://chainreact.app/api/webhooks/gmail`

#### Other Providers
- **Discord**: `https://chainreact.app/api/webhooks/discord`
- **Slack**: `https://chainreact.app/api/webhooks/slack`
- **GitHub**: `https://chainreact.app/api/webhooks/github`
- **Notion**: `https://chainreact.app/api/webhooks/notion`

### Core Components

#### 1. API Routes (`app/api/webhooks/`)
- `google/route.ts` - Handles Google Cloud Pub/Sub events
- `gmail/route.ts` - Handles Gmail watch API events
- `[provider]/route.ts` - Generic handler for other providers

#### 2. Verification (`lib/webhooks/`)
- `verification.ts` - Generic webhook signature verification
- `google-verification.ts` - Google-specific verification
- `gmail-verification.ts` - Gmail-specific verification

#### 3. Processing (`lib/webhooks/`)
- `processor.ts` - Generic event processing
- `google-processor.ts` - Google service event processing
- `gmail-processor.ts` - Gmail event processing

#### 4. Utilities (`lib/webhooks/`)
- `event-logger.ts` - Webhook event logging and monitoring
- `task-queue.ts` - Background task processing
- `registration.ts` - Webhook registration utilities

### Database Schema

#### Tables
- `webhook_event_logs` - Detailed webhook event logs
- `webhook_events` - Stored webhook events
- `webhook_tasks` - Background processing tasks
- `webhook_registrations` - Active webhook registrations

## Features

### 1. Authentication & Security
- **Signature Verification**: Each provider has specific signature verification
- **Environment-based Secrets**: Webhook secrets stored in environment variables
- **Request Validation**: Comprehensive request validation and sanitization

### 2. Event Processing
- **Service Detection**: Automatic detection of service type from event data
- **Event Routing**: Events routed to appropriate handlers based on provider
- **Error Handling**: Comprehensive error handling with logging

### 3. Background Processing
- **Task Queue**: Long-running tasks queued for background processing
- **Priority System**: Tasks can have high, normal, or low priority
- **Retry Logic**: Failed tasks can be retried with exponential backoff

### 4. Monitoring & Logging
- **Event Logging**: All webhook events logged with detailed metadata
- **Performance Tracking**: Processing time and performance metrics
- **Error Tracking**: Comprehensive error logging and monitoring

## Usage

### Registering Webhooks

```typescript
import { registerWebhook } from '@/lib/webhooks/registration'

// Register Google Drive webhook
await registerWebhook({
  provider: 'google',
  service: 'drive',
  webhookUrl: 'https://chainreact.app/api/webhooks/google',
  events: ['file.created', 'file.updated', 'file.deleted'],
  secret: process.env.GOOGLE_WEBHOOK_SECRET
})

// Register Discord webhook
await registerWebhook({
  provider: 'discord',
  webhookUrl: 'https://chainreact.app/api/webhooks/discord',
  events: ['MESSAGE_CREATE', 'GUILD_MEMBER_ADD'],
  secret: process.env.DISCORD_WEBHOOK_SECRET
})
```

### Processing Events

Events are automatically processed based on their provider and type. The system includes handlers for:

#### Google Services
- **Drive**: File creation, updates, deletion
- **Calendar**: Event creation, updates, deletion
- **Docs**: Document changes, comments
- **Sheets**: Spreadsheet changes, cell updates

#### Gmail
- **Messages**: New messages, modifications, deletions
- **Labels**: Label additions, removals
- **Attachments**: Attachment additions

#### Other Providers
- **Discord**: Messages, member joins/leaves
- **Slack**: Messages, channel events, team events
- **GitHub**: Issues, pull requests, pushes
- **Notion**: Page events, database events

### Background Processing

```typescript
import { queueWebhookTask } from '@/lib/webhooks/task-queue'

// Queue a task for background processing
await queueWebhookTask({
  provider: 'gmail',
  service: 'gmail',
  eventType: 'message.new',
  eventData: messageData,
  requestId: 'unique-request-id',
  priority: 'high'
})
```

## Configuration

### Environment Variables

```bash
# Webhook Secrets
GOOGLE_WEBHOOK_SECRET=your_google_secret
GMAIL_WEBHOOK_TOKEN=your_gmail_token
DISCORD_WEBHOOK_SECRET=your_discord_secret
SLACK_WEBHOOK_SECRET=your_slack_secret
GITHUB_WEBHOOK_SECRET=your_github_secret
NOTION_WEBHOOK_SECRET=your_notion_secret

# Cron Job
CRON_SECRET=your_cron_secret
```

### Database Migration

Run the webhook tables migration:

```sql
-- Apply the migration
\i db/migrations/create_webhook_tables.sql
```

## Monitoring

### Health Checks

Each webhook endpoint provides a health check:

```bash
# Check Google webhook health
curl https://chainreact.app/api/webhooks/google

# Check Gmail webhook health
curl https://chainreact.app/api/webhooks/gmail

# Check generic provider health
curl https://chainreact.app/api/webhooks/discord
```

### Task Processing

Process background tasks via cron job:

```bash
# Trigger task processing
curl -X POST https://chainreact.app/api/cron/process-webhook-tasks \
  -H "Authorization: Bearer $CRON_SECRET"
```

## Security Considerations

1. **Signature Verification**: All webhooks verify signatures to prevent spoofing
2. **Rate Limiting**: Implement rate limiting to prevent abuse
3. **Input Validation**: All webhook data is validated and sanitized
4. **Error Handling**: Sensitive information is not exposed in error messages
5. **Database Security**: Row Level Security (RLS) policies protect webhook data

## Future Enhancements

1. **Webhook Management UI**: Admin interface for managing webhook registrations
2. **Real-time Monitoring**: WebSocket-based real-time webhook monitoring
3. **Advanced Retry Logic**: Configurable retry policies with dead letter queues
4. **Webhook Analytics**: Detailed analytics and reporting on webhook usage
5. **Multi-tenant Support**: Organization-specific webhook configurations 