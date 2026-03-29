# Wait for Event - Documentation

## Overview

The **Wait for Event** node allows workflows to pause execution and wait for a specific event to occur before continuing. This enables powerful multi-step workflows that span across different user actions or external triggers.

## Use Cases

### Example 1: User Onboarding Flow
```
1. [Trigger] Form Submitted
2. [Action] Send Welcome Email
3. [Action] Wait for Event: "user.created"
4. [Action] Add to CRM
5. [Action] Send Activation Email
```

### Example 2: Payment Confirmation
```
1. [Trigger] Order Created
2. [Action] Reserve Inventory
3. [Action] Wait for Event: "payment.completed"
4. [Action] Fulfill Order
5. [Action] Send Shipping Confirmation
```

### Example 3: Multi-Step Approval
```
1. [Trigger] Document Submitted
2. [Action] Notify Manager
3. [Action] Wait for Event: "approval.granted"
4. [Action] Publish Document
5. [Action] Notify Team
```

## How It Works

### 1. Workflow Execution
When a workflow reaches a "Wait for Event" node:
- The execution **pauses** at that node
- A record is created in `waiting_executions` table
- The workflow status changes to "waiting"
- **All previous data is preserved** (trigger data, action outputs, etc.)

### 2. Event Reception
When an event arrives via `/api/workflows/events`:
- The system finds all waiting executions matching the event type
- Checks if the event data matches any specified conditions
- Resumes matching workflow executions

### 3. Workflow Resumption
Once resumed:
- The workflow continues from the next node after the wait
- **All original data is still available** (trigger, previous actions)
- **Event data is also available** as `event` in the context
- Execution continues normally until completion

## Configuration

### Event Types

#### 1. Webhook
Wait for a custom webhook to be called.

**Configuration:**
- **Webhook Path**: Custom path like `/resume-workflow` or `/order-completed`
- **Match Condition** (optional): JSON to filter which webhooks match

**Trigger webhook:**
```bash
POST /api/workflows/events
{
  "eventType": "webhook",
  "webhookPath": "/order-completed",
  "eventData": {
    "orderId": "12345",
    "amount": 99.99
  }
}
```

#### 2. Custom Event
Wait for a named custom event.

**Configuration:**
- **Event Name**: Name like `user.created`, `payment.completed`
- **Match Condition** (optional): Filter which events match

**Trigger event:**
```bash
POST /api/workflows/events
{
  "eventType": "custom_event",
  "eventName": "user.created",
  "eventData": {
    "userId": "user_123",
    "email": "user@example.com"
  }
}
```

#### 3. Integration Event
Wait for events from integrated services (Stripe, Slack, etc.).

**Configuration:**
- **Integration**: Select integration (stripe, slack, gmail, etc.)
- **Event**: Select specific event from that integration
- **Match Condition** (optional): Filter events

**Note:** Integration webhooks are automatically configured to send events to this endpoint.

### Match Conditions

Match conditions allow filtering which events resume the workflow. They are specified as JSON.

**Simple equality:**
```json
{
  "email": "{{trigger.email}}"
}
```
This will only match events where `eventData.email` equals the trigger email.

**Nested properties:**
```json
{
  "user.email": "{{trigger.email}}",
  "status": "completed"
}
```

**Operators:**
```json
{
  "email": { "$exists": true },
  "amount": { "$ne": 0 }
}
```

Available operators:
- `$exists`: Check if field exists
- `$ne`: Not equal
- `$eq`: Equal (same as simple equality)

### Timeout Configuration

**Timeout (hours):**
Specify how long to wait before timing out (leave empty for no timeout).

**On Timeout:**
- `fail`: Mark execution as failed
- `continue`: Continue workflow without event data
- `skip`: Skip remaining nodes and mark as completed

## Accessing Data

When the workflow resumes, you have access to:

### Original Trigger Data
```
{{trigger.email}}
{{trigger.formData}}
```

### Previous Action Outputs
```
{{sendWelcomeEmail.messageId}}
{{createUser.userId}}
```

### Event Data
```
{{event.userId}}
{{event.accountType}}
{{event.timestamp}}
```

### Wait Metadata
```
{{waitDuration}} - How long the workflow waited (in milliseconds)
```

## API Reference

### Send Event
**Endpoint:** `POST /api/workflows/events`

**Body:**
```json
{
  "eventType": "webhook" | "custom_event" | "integration_event",
  "webhookPath": "/your-path",  // For webhook events
  "eventName": "event.name",     // For custom events
  "provider": "stripe",          // For integration events
  "eventData": {
    // Your event payload
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Event processed - resumed 2 workflows",
  "resumed": 2,
  "failed": 0,
  "details": {
    "resumedExecutions": [
      { "executionId": "exec-123", "completed": true },
      { "executionId": "exec-456", "completed": true }
    ],
    "failedResumes": []
  }
}
```

### Check Timeouts (Cron)
**Endpoint:** `GET /api/cron/check-waiting-timeouts`

**Headers:**
```
Authorization: Bearer YOUR_CRON_SECRET
```

Set `CRON_SECRET` environment variable and configure a cron service (Vercel Cron, GitHub Actions, etc.) to call this endpoint every 5-10 minutes.

## Database Schema

### waiting_executions Table
```sql
CREATE TABLE waiting_executions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  workflow_id UUID NOT NULL,
  execution_id UUID NOT NULL,
  node_id TEXT NOT NULL,

  event_type TEXT NOT NULL,
  event_config JSONB NOT NULL,
  match_condition JSONB,

  paused_at TIMESTAMP NOT NULL,
  resumed_at TIMESTAMP,
  timeout_at TIMESTAMP,

  status TEXT NOT NULL, -- 'waiting', 'resumed', 'timed_out', 'cancelled'

  execution_data JSONB NOT NULL,
  resume_event_data JSONB,

  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);
```

## Best Practices

### 1. Use Match Conditions
Always use match conditions to ensure the right event resumes the right workflow:
```json
{
  "userId": "{{trigger.userId}}",
  "email": "{{trigger.email}}"
}
```

### 2. Set Timeouts
For production workflows, always set a reasonable timeout:
- User actions: 24-72 hours
- Payment confirmations: 1-2 hours
- API callbacks: 5-15 minutes

### 3. Handle Timeouts Gracefully
Choose the right timeout action:
- **fail**: When the event is critical (payment confirmation)
- **continue**: When you can proceed without the event (optional approval)
- **skip**: When the event is informational only

### 4. Event Data Structure
Keep event data consistent and well-structured:
```json
{
  "type": "user.created",
  "timestamp": "2024-01-01T12:00:00Z",
  "data": {
    "userId": "123",
    "email": "user@example.com"
  }
}
```

### 5. Monitor Waiting Executions
Regularly check the `waiting_executions` table for:
- Long-running waits
- Stuck executions
- Timeout patterns

## Troubleshooting

### Workflow Not Resuming
1. Check event type matches node configuration
2. Verify match condition is correct
3. Check logs for event reception: `[Events] Received event`
4. Verify waiting execution exists in database

### Multiple Workflows Resuming
- This is expected if multiple workflows are waiting for the same event
- Use more specific match conditions to target individual executions

### Timeout Not Working
- Ensure cron job is configured and running
- Check `CRON_SECRET` environment variable is set
- Verify `timeout_at` is set in `waiting_executions` table

## Advanced Use Cases

### Chained Wait for Events
You can have multiple "Wait for Event" nodes in one workflow:

```
1. [Trigger] Form Submitted
2. [Action] Send Verification Email
3. [Action] Wait for Event: "email.verified"
4. [Action] Create User Account
5. [Action] Wait for Event: "payment.completed"
6. [Action] Activate Premium Features
```

### Conditional Resumption
Use match conditions with dynamic values from previous steps:

```json
{
  "orderId": "{{createOrder.orderId}}",
  "amount": "{{calculateTotal.total}}",
  "status": "completed"
}
```

## Migration

To enable this feature, run the database migration:

```bash
supabase db push
```

This will create the `waiting_executions` table with all necessary indexes and policies.
