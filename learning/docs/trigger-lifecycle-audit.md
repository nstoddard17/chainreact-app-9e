# Trigger Lifecycle Audit

**Created**: 2025-10-03
**Purpose**: Audit ALL trigger types to ensure they follow proper activation/deactivation lifecycle

## Core Principle

**ALL triggers MUST follow this pattern:**
1. **Workflow Activated** → Create/register ALL resources needed for trigger (webhooks, subscriptions, polling jobs, etc.)
2. **Workflow Deactivated** → Clean up ALL resources for that trigger
3. **Workflow Reactivated** → Recreate everything fresh from scratch

## Current State Analysis

### Triggers That Use Webhooks (External Registration Required)

| Provider | Trigger Type | Status | Implementation |
|----------|-------------|--------|----------------|
| **Airtable** | New Record, Record Updated, Table Deleted | ✅ **COMPLETE** | `AirtableTriggerLifecycle.ts` |
| **Discord** | Message Sent, Member Join, Slash Command | ✅ **COMPLETE** | `DiscordTriggerLifecycle.ts` |
| **Gmail** | New Email | ✅ **COMPLETE** | `GoogleApisTriggerLifecycle.ts` |
| **Google Calendar** | Event Created, Updated | ✅ **COMPLETE** | `GoogleApisTriggerLifecycle.ts` |
| **Google Drive** | File Created, Modified | ✅ **COMPLETE** | `GoogleApisTriggerLifecycle.ts` |
| **Google Sheets** | Row Added, Updated | ✅ **COMPLETE** | `GoogleApisTriggerLifecycle.ts` |
| **Google Docs** | Document Modified | ✅ **COMPLETE** | `GoogleApisTriggerLifecycle.ts` |
| **Microsoft Outlook** | New Email | ✅ **COMPLETE** | `MicrosoftGraphTriggerLifecycle.ts` |
| **Microsoft Teams** | Message Sent, Channel Created | ✅ **COMPLETE** | `MicrosoftGraphTriggerLifecycle.ts` |
| **Microsoft OneDrive** | File Created, Modified | ✅ **COMPLETE** | `MicrosoftGraphTriggerLifecycle.ts` |
| **Dropbox** | File Added, Modified | ⏸️ **PENDING** | Not yet implemented |
| **Trello** | Card Created, Moved | ⏸️ **PENDING** | Not yet implemented |
| **Slack** | Message Posted, Reaction Added | ✅ **COMPLETE** | `SlackTriggerLifecycle.ts` |
| **Stripe** | Payment Received, Subscription Created | ✅ **COMPLETE** | `StripeTriggerLifecycle.ts` |
| **Shopify** | Order Created, Product Updated | ✅ **COMPLETE** | `ShopifyTriggerLifecycle.ts` |
| **HubSpot** | Contact Created, Deal Updated | ⏸️ **PENDING** | Not yet implemented |

### Triggers That Use Polling (No External Registration)

| Provider | Trigger Type | Current Behavior | Needs Fix? |
|----------|-------------|------------------|------------|
| **Schedule** | Cron/Interval | ✅ No external resources | ❌ No |
| **Manual** | Manual execution | ✅ No external resources | ❌ No |
| **Webhook** | Generic webhook | ✅ Just receives, no registration | ❌ No |

## Critical Issues Found

### Issue #1: Microsoft Graph Auto-Subscribe
**Location**: `/app/api/microsoft-graph/auto-subscribe/route.ts`

**Problem**: Creates subscriptions when user connects integration, NOT when workflow is activated

**Impact**:
- Wastes resources (subscriptions exist even if no workflows use them)
- Creates unnecessary webhook noise
- Requires 3-day renewal for unused subscriptions
- Database bloat

**Fix Required**:
1. Remove auto-subscribe from integration connection flow
2. Move subscription creation to workflow activation
3. Track which workflow owns which subscription
4. Clean up subscriptions on workflow deactivation

### Issue #2: Inconsistent Trigger Registration Pattern
**Location**: Multiple providers

**Problem**: Some triggers register on workflow activation (Airtable, Discord), others register on integration connection (Microsoft Graph)

**Impact**:
- Confusing for developers
- Maintenance nightmare
- Duplicate subscription issues
- Resource waste

**Fix Required**: Standardize ALL triggers to use workflow activation pattern

## Proposed Solution

### 1. Create Universal Trigger Lifecycle Manager

Refactor `TriggerWebhookManager` into `TriggerLifecycleManager` that handles:
- Webhook-based triggers (Airtable, Discord, Slack, etc.)
- Subscription-based triggers (Microsoft Graph, Google APIs)
- Polling-based triggers (if any)

### 2. Standard Interface for All Triggers

```typescript
interface TriggerLifecycle {
  // Called when workflow is activated
  onActivate(workflowId: string, userId: string, config: any): Promise<void>

  // Called when workflow is deactivated
  onDeactivate(workflowId: string, userId: string): Promise<void>

  // Called when workflow is deleted
  onDelete(workflowId: string, userId: string): Promise<void>

  // Called to check health
  checkHealth(workflowId: string, userId: string): Promise<boolean>
}
```

### 3. Provider-Specific Implementations

Each provider implements the interface:
- **Airtable**: Register/unregister webhook with base
- **Microsoft Graph**: Create/delete subscription
- **Google APIs**: Create/delete push notifications
- **Discord**: Register/unregister slash commands
- **Schedule**: No-op (no external resources)

### 4. Workflow Activation Flow

```typescript
// When status changes to 'active'
async function activateWorkflow(workflowId: string) {
  const triggers = getWorkflowTriggers(workflowId)

  for (const trigger of triggers) {
    const lifecycle = getTriggerLifecycle(trigger.providerId)
    await lifecycle.onActivate(workflowId, userId, trigger.config)
  }
}

// When status changes to 'draft' or 'paused'
async function deactivateWorkflow(workflowId: string) {
  const triggers = getWorkflowTriggers(workflowId)

  for (const trigger of triggers) {
    const lifecycle = getTriggerLifecycle(trigger.providerId)
    await lifecycle.onDeactivate(workflowId, userId)
  }
}
```

## Database Schema Changes Needed

### Add workflow_id to Subscription Tables

```sql
ALTER TABLE microsoft_graph_subscriptions
ADD COLUMN workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE;

CREATE INDEX idx_subscriptions_workflow ON microsoft_graph_subscriptions(workflow_id);
```

### Similar for Other Providers
- Airtable webhooks
- Google API subscriptions
- Any other provider-specific resources

## Implementation Checklist

- [ ] Create `TriggerLifecycleManager` class
- [ ] Define `TriggerLifecycle` interface
- [ ] Implement lifecycle for each provider:
  - [ ] Microsoft Graph (Outlook, Teams, OneDrive, OneNote)
  - [ ] Google APIs (Gmail, Calendar, Drive, Sheets, Docs)
  - [ ] Airtable (already mostly done)
  - [ ] Discord (already mostly done)
  - [ ] Slack
  - [ ] Dropbox
  - [ ] Trello
  - [ ] Stripe
  - [ ] Shopify
  - [ ] HubSpot
- [ ] Add workflow_id to all subscription/webhook tables
- [ ] Update workflow activation endpoint to call lifecycle manager
- [ ] Update workflow deactivation endpoint to call lifecycle manager
- [ ] Update workflow deletion endpoint to call lifecycle manager
- [ ] Remove auto-subscribe from integration connection flows
- [ ] Test complete lifecycle for each provider
- [ ] Document new pattern in CLAUDE.md

## Testing Protocol

For each trigger type:
1. ✅ Connect integration (NO resources should be created)
2. ✅ Create workflow with trigger (NO resources should be created yet)
3. ✅ Activate workflow → Resources SHOULD be created
4. ✅ Verify trigger works (send test notification)
5. ✅ Deactivate workflow → Resources SHOULD be cleaned up
6. ✅ Verify trigger stops working (no notifications received)
7. ✅ Reactivate workflow → Resources SHOULD be recreated
8. ✅ Delete workflow → Resources SHOULD be cleaned up
9. ✅ Disconnect integration → All resources for user SHOULD be cleaned up

## Timeline Estimate

- **Audit remaining triggers**: 1-2 hours
- **Design TriggerLifecycleManager**: 1 hour
- **Implement Microsoft Graph lifecycle**: 2-3 hours
- **Implement other providers**: 4-6 hours
- **Database migrations**: 1 hour
- **Testing**: 3-4 hours
- **Documentation**: 1 hour

**Total**: 13-18 hours of work

## Priority

🚨 **HIGH PRIORITY** - This is a fundamental architectural issue affecting:
- Resource waste
- Database bloat
- Duplicate notification issues
- User experience (workflows triggering when they shouldn't)
- Billing (if you charge for workflow executions)
