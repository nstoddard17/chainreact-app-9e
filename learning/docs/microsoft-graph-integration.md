---
title: Microsoft Graph Integration
date: 2023-07-15
component: MicrosoftGraphIntegration
---

# Microsoft Graph Integration

This document describes the Microsoft Graph integration implementation in ChainReact, focusing on real-time data synchronization, webhook handling, and normalized event processing.

## Architecture Overview

The Microsoft Graph integration consists of several key components:

1. **Subscription Manager**: Creates and manages webhook subscriptions to Microsoft Graph resources
2. **Webhook Handler**: Receives and processes notifications from Microsoft Graph
3. **Worker**: Fetches detailed changes using delta queries and other APIs
4. **Client**: Handles API communication with Microsoft Graph
5. **Event Normalizer**: Transforms Microsoft data into a standard format for workflows

## Data Sources and Synchronization

### OneDrive
- Uses delta queries to track created/updated/deleted files and folders
- Supports both root-level and specific folder monitoring
- Normalizes file events for workflow triggers

### Mail
- Uses delta queries to detect new and updated messages
- Tracks flagged/important messages
- Normalizes mail events for workflow triggers

### Calendar
- Uses delta queries to track created/updated/canceled events
- Normalizes calendar events for workflow triggers

### Teams/Chats
- Lists messages for created/edited/deleted content
- Supports decryption of encrypted payloads when configured
- Normalizes message events for workflow triggers

### OneNote
- Uses a fallback approach via OneDrive/SharePoint
- Schedules delta queries for pages/sections to fill gaps
- Normalizes OneNote events for workflow triggers

## Webhook Subscription Flow

1. **User Connection**: When a user connects their Microsoft account, they select which resources to monitor
2. **Auto-Subscribe**: The system creates appropriate webhook subscriptions based on user selections
3. **Renewal**: Subscriptions are automatically renewed before expiration
4. **Health Checks**: Background processes monitor subscription health and self-heal when issues occur

## Event Processing Pipeline

1. **Webhook Notification**: Microsoft Graph sends a notification when a resource changes
2. **Queue Processing**: The notification is validated and added to a processing queue
3. **Delta Query**: The worker fetches detailed changes using delta queries
4. **Normalization**: Events are normalized into a standard format
5. **Workflow Triggers**: Normalized events trigger appropriate workflows

## Teams Encrypted Payload Handling

For Microsoft Teams with encrypted payloads:

1. **Configuration**: Certificate and private key are configured via environment variables
2. **Decryption**: Encrypted payloads are automatically decrypted when present
3. **Fallback**: If decryption fails, a placeholder is used and logged

## Self-Healing Mechanism

The integration includes a robust self-healing mechanism:

1. **Health Checks**: Regular checks verify subscription status
2. **Auto-Renewal**: Expiring subscriptions are automatically renewed
3. **Error Notifications**: Users are notified of persistent issues
4. **Recovery**: The system attempts to recreate failed subscriptions

## Database Schema

The integration uses several database tables:

- `microsoft_graph_subscriptions`: Stores webhook subscription details
- `microsoft_webhook_queue`: Queue for processing webhook notifications
- `microsoft_webhook_dedup`: Deduplication table to prevent duplicate processing
- `microsoft_graph_delta_tokens`: Stores delta tokens for incremental syncing
- `microsoft_graph_events`: Stores normalized events for workflow triggers

## User Experience

- Users can select which Microsoft resources to monitor during connection
- A status display shows subscription health (Active/Renewing/Error)
- Users receive notifications for subscription issues
- Background processes handle renewal and health checks without user intervention

## Security Considerations

- Webhook validation uses client state verification
- Teams message decryption uses secure certificate/key handling
- Access tokens are securely stored and refreshed
- All API requests use proper authentication

## Limitations

- Microsoft Graph subscriptions expire after 3 days and must be renewed
- Some resources have limitations on subscription capabilities
- Teams encrypted payloads require certificate configuration
- OneNote has limited direct webhook support and uses a fallback approach
