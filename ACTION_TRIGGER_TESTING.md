# Action & Trigger Testing Implementation

## Overview

This document describes the testing system implemented for workflow actions and triggers during the configuration phase. Based on industry standards (Zapier, Make.com), we've implemented **real API testing** for actions and **configuration validation** for triggers.

---

## 🎯 How It Works

### For **Actions** (e.g., Slack Send Message, Gmail Send Email)

**During the Testing Phase:**
1. ✅ **Real API Call** - Sends an actual test message/email
2. ✅ **Test Badge** - Message includes "🧪 ChainReact Test" badge
3. ✅ **Result Storage** - Test data stored in node for verification
4. ✅ **Error Reporting** - Failures show detailed error dialog with reporting option

**Example: Slack Send Message**
```
🧪 ChainReact Test Message

Your actual message content here...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔬 This is a test from ChainReact
Your workflow is configured correctly! This test confirms your Slack integration works.

ChainReact Test • You can safely delete this message
```

### For **Triggers** (e.g., Gmail New Email)

**During the Testing Phase:**
1. ✅ **Validate Config** - Ensures required fields are set
2. ✅ **Verify Integration** - Checks integration is connected
3. ❌ **No Webhook Creation** - Webhooks created on activation, not testing

**Why no real testing for triggers?**
- Can't simulate external events (e.g., receiving an email)
- Webhook URLs don't exist until workflow is activated
- Would require complex cleanup logic

---

## 📁 Files Created

### 1. Action Test Service
**File:** `/lib/workflows/testing/ActionTestService.ts`

**Purpose:** Executes real API calls to test actions

**Key Methods:**
- `testAction()` - Main entry point, routes to provider-specific tests
- `testSlackAction()` - Tests Slack send message
- `testGmailAction()` - Tests Gmail send email
- `testDiscordAction()` - Tests Discord send message

**Example Usage:**
```typescript
const result = await actionTestService.testAction({
  userId: 'user_123',
  workflowId: 'wf_456',
  nodeId: 'node_789',
  nodeType: 'slack_action_send_message',
  providerId: 'slack',
  config: { channel: 'C123', message: 'Hello!' },
  integrationId: 'int_abc'
})

// Result:
// {
//   success: true,
//   message: '✅ Test message sent to Slack!',
//   testData: {
//     ts: '1234567890.123456',
//     channel: 'C123',
//     messagePreview: 'Hello!...'
//   }
// }
```

### 2. Test API Endpoints

**File:** `/app/api/workflows/test/slack/send-message/route.ts`

**Purpose:** Handles Slack test message requests

**Request Body:**
```json
{
  "integrationId": "int_abc",
  "channel": "C123456",
  "message": "Your message",
  "attachments": [],
  "isTest": true
}
```

**Response:**
```json
{
  "success": true,
  "ts": "1234567890.123456",
  "channel": "C123456",
  "message": {...}
}
```

**Test Message Format:**
- Prepends "🧪 ChainReact Test Message" to content
- Adds green attachment with test instructions
- Includes metadata: `{ event_type: 'chainreact_test' }`

### 3. WorkflowBuilderV2 Integration

**File:** `/components/workflows/builder/WorkflowBuilderV2.tsx`

**Changes:**
- Added import: `import { actionTestService } from '@/lib/workflows/testing/ActionTestService'`
- Replaced fake test (`const testSuccess = true`) with real testing
- Distinguishes between triggers (validate only) and actions (real test)
- Stores test results in node data
- Shows error toast on failure

**Testing Flow:**
```
TESTING_NODE state
  ↓
Check if trigger or action
  ↓
Trigger: Validate config (check connection exists)
Action: Call actionTestService.testAction()
  ↓
Success: Store testData in node, mark as 'passed'
Failure: Store error in node, mark as 'failed', show toast
```

### 4. Error Reporting UI

**File:** `/components/workflows/errors/TestErrorDialog.tsx`

**Purpose:** Shows error details and allows users to report issues

**Features:**
- Displays error code and message
- Provides context-aware suggestions (e.g., "Check channel exists")
- Collects user feedback (description, email)
- Sanitizes config before sending (removes tokens)
- Shows success confirmation
- Auto-closes after submission

**Suggestions Logic:**
```typescript
if (error.message.includes('channel')) {
  suggestions.push('Verify the channel exists in your workspace')
  suggestions.push('Check that the bot has been invited to the channel')
}

if (error.message.includes('permission')) {
  suggestions.push('Check that you have permission to perform this action')
  suggestions.push('Try reconnecting your integration')
}
```

### 5. Error Reporting API

**File:** `/app/api/error-reports/route.ts`

**Purpose:** Stores error reports and notifies team

**Features:**
- Sanitizes config (removes access tokens, API keys, secrets)
- Stores in `error_reports` table
- Optionally sends webhook notification to team (Discord/Slack)
- Logs all reports for debugging

**Webhook Notification** (if `ERROR_REPORTS_WEBHOOK_URL` env var set):
```json
{
  "embeds": [{
    "title": "🚨 Test Error Report",
    "color": 16711680,
    "fields": [
      { "name": "Error", "value": "`TEST_FAILED`: Channel not found" },
      { "name": "Node", "value": "slack - send_message" },
      { "name": "User Email", "value": "user@example.com" },
      { "name": "Description", "value": "Trying to send to #general" }
    ]
  }]
}
```

### 6. Database Migration

**File:** `/supabase/migrations/20250102000000_create_error_reports.sql`

**Table Schema:**
```sql
CREATE TABLE error_reports (
  id UUID PRIMARY KEY,
  error_code TEXT NOT NULL,
  error_message TEXT NOT NULL,
  error_details JSONB,
  node_type TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  config JSONB, -- Sanitized, no tokens
  user_description TEXT,
  user_email TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

**Indexes:**
- `idx_error_reports_created_at` - Sort by most recent
- `idx_error_reports_provider_id` - Filter by provider
- `idx_error_reports_error_code` - Group similar errors

---

## 🔄 Testing Flow (End-to-End)

### Example: "Send email to Slack" Workflow

**1. User Creates Workflow**
```
User: "When I get an email, send it to Slack"
Agent: Creates plan with 2 nodes:
  - Gmail "New Email" Trigger
  - Slack "Send Message" Action
```

**2. Configuration Phase**
```
Node 1 (Gmail Trigger):
  - User selects connection
  - User configures filters (optional)
  - System validates connection exists ✅
  - Node marked as 'passed'

Node 2 (Slack Action):
  - User selects channel (#general)
  - User writes message: "New email from {{trigger.from}}"
  - System sends REAL test message to Slack
  - Message appears in #general with test badge
  - Test result stored: { ts: '...', channel: 'C123' }
  - Node marked as 'passed' ✅
```

**3. Workflow Activation**
```
User clicks "Activate"
  ↓
Trigger Lifecycle Manager
  ↓
Gmail: Create watch subscription (webhook)
  ↓
Store in trigger_resources table
  ↓
Workflow is live! 🎉
```

---

## ⚠️ Error Handling

### Test Failure Scenarios

**Scenario 1: Invalid Channel**
```
Error: "channel_not_found"
Message: "Channel C12345 not found"

Suggestions:
- Verify the channel exists in your workspace
- Check that the bot has been invited to the channel

User can:
✅ Report issue to ChainReact
✅ Try again with different channel
✅ Cancel and fix manually
```

**Scenario 2: Expired Integration**
```
Error: "invalid_auth"
Message: "The token has been revoked"

Suggestions:
- Your integration may have expired
- Go to Settings → Integrations to reconnect

User can:
✅ Report issue
✅ Reconnect integration
✅ Cancel workflow creation
```

**Scenario 3: Permission Denied**
```
Error: "missing_scope"
Message: "Missing permission: chat:write"

Suggestions:
- Check that you have permission to post messages
- Try reconnecting with correct permissions

User can:
✅ Report issue with permission details
✅ Reconnect with full scopes
```

---

## 🛠️ Manual Actions Required

### 1. Database Migration

Run the migration to create the `error_reports` table:

```bash
# Link to your Supabase project (if not done)
supabase link --project-ref xzwsdwllmrnrgbltibxt

# Apply migration
supabase db push
```

### 2. Environment Variables (Optional)

**For Error Notifications:**
```env
# Discord/Slack webhook URL for error notifications
ERROR_REPORTS_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

If not set, errors are only stored in database.

---

## 📊 Industry Comparison

| Feature | Zapier | Make.com | ChainReact |
|---------|--------|----------|------------|
| **Action Testing** | ✅ Real API calls | ✅ Real API calls | ✅ Real API calls |
| **Test Badges** | ✅ Metadata only | ✅ Visual badges | ✅ Visual badges + metadata |
| **Trigger Testing** | ✅ Find historical data | ✅ "Choose where to start" | ✅ Validate config |
| **Error Reporting** | ❌ No user reporting | ❌ No user reporting | ✅ Full reporting system |
| **Test Data Storage** | ✅ Yes | ✅ Yes | ✅ Yes |

**ChainReact Advantages:**
1. ✅ Error reporting with user feedback
2. ✅ Context-aware suggestions
3. ✅ Team notifications for critical errors
4. ✅ Detailed test result storage

---

## 🔮 Future Enhancements

### Phase 2 (Optional):
1. **Test Button in Configuration Modal** - Let users manually trigger tests
2. **Load Sample Data for Triggers** - Fetch recent trigger events (like Make.com's "Choose where to start")
3. **Test Result Display on Nodes** - Show test data in node cards
4. **Retry with Modifications** - Quick edit + retest flow
5. **Test History** - Track all test attempts
6. **Bulk Testing** - Test all nodes at once

### Phase 3 (Advanced):
1. **AI-Generated Test Data** - Smart placeholders for variables
2. **Test Scheduling** - Periodic health checks for active workflows
3. **Test Analytics** - Most common failures, success rates
4. **Integration Health Monitoring** - Proactive expiration warnings

---

## 📝 Notes for Developers

### Adding Support for New Actions

1. **Update ActionTestService.ts:**
```typescript
case 'your-provider':
  return await this.testYourProviderAction(context)
```

2. **Create Test API Endpoint:**
```
/app/api/workflows/test/your-provider/action-name/route.ts
```

3. **Add Test Badge:**
```typescript
const testMessage = isTest ? `🧪 ChainReact Test\n\n${message}` : message
```

4. **Return Test Data:**
```typescript
return {
  success: true,
  message: '✅ Test successful!',
  testData: { id: '...', timestamp: '...' }
}
```

### Common Issues

**Issue 1: Tests Always Fail**
- Check integration is connected
- Verify access token is valid
- Ensure required scopes are granted

**Issue 2: Test Messages Don't Show Badge**
- Check `isTest: true` in API request
- Verify badge logic in test endpoint

**Issue 3: Error Reports Not Saved**
- Run database migration
- Check Supabase connection
- Verify RLS policies

---

## ✅ Testing Checklist

Before deploying, verify:
- [ ] Database migration applied
- [ ] Slack test endpoint works
- [ ] Error dialog shows on failures
- [ ] Error reports save to database
- [ ] Test badges appear in Slack
- [ ] Trigger validation works
- [ ] Toast notifications show
- [ ] Optional: Webhook notifications work

---

**Last Updated:** January 2, 2025
**Author:** Claude (AI Assistant)
**Status:** ✅ Implementation Complete
