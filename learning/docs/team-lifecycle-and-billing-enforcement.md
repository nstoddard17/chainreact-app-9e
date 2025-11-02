# Team Lifecycle and Billing Enforcement System

**Last Updated:** November 3, 2025
**Status:** ✅ Implemented

## Overview

This document describes the complete data lifecycle management and billing enforcement system for teams in ChainReact, including:

1. **Team folder initialization** (root + trash folders)
2. **Workflow migration on team deletion** (moves to creator's folder)
3. **Grace period system** (5 days before suspension)
4. **Notification system** (alerts for owners)
5. **Execution guards** (prevent suspended team workflows)
6. **Cron enforcement** (automated suspension checks)

---

## Architecture

### Design Principles

✅ **Database-level cascade** for data integrity
✅ **Application-level pre-deletion checks** for user prompts
✅ **Grace period with notifications** (not immediate suspension)
✅ **Workflow preservation** (migrate, don't delete)
✅ **Non-blocking notifications** (don't fail operations)

### Industry Standards Followed

- **Notion**: Downgrade at end of billing cycle, 3-day grace period for block limits
- **Slack**: Downgrade to free retains 90 days of history, clear feature limitations
- **GitHub**: Clear communication about downgrades, data retention policies

---

## Database Schema

### New Columns Added

#### `workflow_folders` table
```sql
- is_trash BOOLEAN DEFAULT FALSE NOT NULL
- team_id UUID REFERENCES teams(id) ON DELETE CASCADE
```

#### `teams` table
```sql
- suspended_at TIMESTAMPTZ
- suspension_reason TEXT (enum: 'owner_downgraded', 'payment_failed', 'quota_exceeded', 'manual_suspension')
- grace_period_ends_at TIMESTAMPTZ
- suspension_notified_at TIMESTAMPTZ
```

#### `workflows` table
```sql
- team_id UUID REFERENCES teams(id) ON DELETE SET NULL
```

### New Tables

#### `team_suspension_notifications`
Tracks all notifications sent to team owners about suspensions.

```sql
CREATE TABLE team_suspension_notifications (
  id UUID PRIMARY KEY,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN (
    'grace_period_started',
    'grace_period_reminder_3_days',
    'grace_period_reminder_1_day',
    'team_suspended',
    'team_reactivated'
  )),
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

---

## Lifecycle Flows

### 1️⃣ Team Creation

**Trigger:** User creates a new team

**Automatic Actions:**
1. Team record created in `teams` table
2. **Database trigger fires** (`initialize_team_folders_trigger`)
3. Root folder created: `"{team_name}'s Workflows"`
4. Trash folder created: `"Trash"` (child of root)
5. Team creator added to `team_members` with role `'owner'`

**Files:**
- Migration: [`20251103000002_create_team_folder_initialization.sql`](../../supabase/migrations/20251103000002_create_team_folder_initialization.sql)
- Function: `initialize_team_folders()`

---

### 2️⃣ User Subscription Cancellation (Downgrade)

**Trigger:** Stripe webhook `customer.subscription.deleted`

**Flow:**
1. Stripe webhook received at [`/api/webhooks/stripe-billing`](../../app/api/webhooks/stripe-billing/route.ts)
2. User role downgraded to `'free'` in `user_profiles`
3. **NEW:** `handleUserDowngrade()` function called
4. Find all teams where `created_by = user_id`
5. For each team:
   - Set `grace_period_ends_at` = NOW() + 5 days
   - Set `suspension_reason` = `'owner_downgraded'`
6. **Database trigger fires** (`notify_grace_period_trigger`)
7. Notification created in `team_suspension_notifications`
8. Email sent to team owner (future: integrate with email service)

**Grace Period:** 5 days from cancellation

**Files:**
- Webhook: [`app/api/webhooks/stripe-billing/route.ts:460-511`](../../app/api/webhooks/stripe-billing/route.ts#L460-L511)
- Function: `handleUserDowngrade(userId, supabase)`

---

### 3️⃣ Grace Period Enforcement (Cron Job)

**Trigger:** Cron runs every 6 hours (`0 */6 * * *`)

**Flow:**
1. Cron calls [`/api/cron/check-team-suspensions`](../../app/api/cron/check-team-suspensions/route.ts)
2. Find teams where:
   - `suspended_at IS NULL` (not already suspended)
   - `grace_period_ends_at < NOW()` (grace period expired)
3. For each expired team:
   - Set `suspended_at` = NOW()
   - Create `team_suspended` notification
4. **Also check for upcoming expirations:**
   - 3 days before: Send reminder notification
   - 1 day before: Send urgent reminder notification
5. Return summary of actions taken

**Authorization:** Requires `CRON_SECRET` in headers or query params

**Files:**
- Cron route: [`app/api/cron/check-team-suspensions/route.ts`](../../app/api/cron/check-team-suspensions/route.ts)
- Vercel config: [`vercel.json:32-34`](../../vercel.json#L32-L34)

**Schedule:**
```json
{
  "path": "/api/cron/check-team-suspensions",
  "schedule": "0 */6 * * *"
}
```

---

### 4️⃣ Workflow Execution Guard

**Trigger:** User tries to execute a workflow

**Flow:**
1. Workflow execution starts at [`/api/workflows/execute`](../../app/api/workflows/execute/route.ts)
2. Workflow fetched from database
3. **NEW:** Check if `workflow.team_id` exists
4. If team exists:
   - Fetch team record
   - **If `suspended_at` is set:** Block execution, return 403 error
   - **If `grace_period_ends_at` is set:** Allow execution, log warning
5. Continue with normal execution

**Error Response (Suspended):**
```json
{
  "error": "This workflow belongs to team 'Acme Corp' which has been suspended due to: owner_downgraded",
  "suspendedAt": "2025-11-08T00:00:00Z",
  "suspensionReason": "owner_downgraded",
  "teamId": "uuid",
  "teamName": "Acme Corp"
}
```

**Files:**
- Execution route: [`app/api/workflows/execute/route.ts:174-214`](../../app/api/workflows/execute/route.ts#L174-L214)

---

### 5️⃣ Team Deletion (Workflow Migration)

**Trigger:** Team is deleted (via UI or API)

**Flow:**
1. DELETE request sent to team
2. **Database trigger fires BEFORE delete** (`migrate_workflows_before_team_delete`)
3. Function `migrate_team_workflows_to_creator()` executes:
   - Get or create creator's default folder
   - Find all workflows with `team_id = deleted_team.id`
   - For each workflow:
     - Set `team_id = NULL`
     - Set `folder_id = creator_default_folder_id`
   - Migrate team folders to creator's personal folders
4. Database cascade deletes:
   - Team members
   - Team folders (now migrated to creator)
   - Team invitations
5. Team record deleted

**Key Point:** Workflows are **NOT DELETED**, they are **MIGRATED** to the creator's root folder.

**Files:**
- Migration: [`20251103000003_create_workflow_migration_function.sql`](../../supabase/migrations/20251103000003_create_workflow_migration_function.sql)
- Function: `migrate_team_workflows_to_creator()`
- Helper: `get_or_create_user_default_folder(user_id)`

---

## API Endpoints

### Manual Suspension/Reactivation

**POST** `/api/teams/[id]/suspend`

Allows team owners/admins or platform admins to manually suspend or reactivate a team.

**Request Body:**
```json
{
  "action": "suspend" | "unsuspend",
  "reason": "owner_downgraded" | "payment_failed" | "quota_exceeded" | "manual_suspension",
  "gracePeriodDays": 5
}
```

**Response (Suspend):**
```json
{
  "success": true,
  "message": "Grace period set for 5 days",
  "gracePeriodEndsAt": "2025-11-08T00:00:00Z",
  "suspensionReason": "manual_suspension"
}
```

**Response (Unsuspend):**
```json
{
  "success": true,
  "message": "Team successfully reactivated"
}
```

**Authorization:**
- User must be team owner/admin, OR
- User must have `user_profiles.admin = true`

**Files:**
- Route: [`app/api/teams/[id]/suspend/route.ts`](../../app/api/teams/[id]/suspend/route.ts)

---

## UI Components

### `BillingWarningBanners` (Recommended)

**Unified component that shows all billing-related warnings in priority order.**

**Usage:**
```tsx
// In dashboard or main layout
<BillingWarningBanners userId={user.id} />
```

**Shows (in priority order):**
1. **Subscription Expiring Soon** (5-7 days before renewal)
2. **Teams in Grace Period** (after downgrade)
3. **Suspended Teams** (after grace period expires)

**Files:**
- Component: [`components/dashboard/BillingWarningBanners.tsx`](../../components/dashboard/BillingWarningBanners.tsx)

---

### `SubscriptionExpirationBanner`

**Shows warning when subscription will expire soon (industry best practice: 5-7 days before).**

**Usage:**
```tsx
<SubscriptionExpirationBanner userId={user.id} />
```

**Shows when:**
- Subscription is set to cancel at period end
- Current period ends in 7 days or less
- User has teams (affected resources)

**Features:**
- 🟡 **7-5 days:** Yellow warning with clock icon
- 🟠 **4-2 days:** Orange urgent warning
- 🔴 **0-1 days:** Red critical warning (animated pulse)
- Shows teams count and what will happen
- One-click "Reactivate Subscription" button
- Calls `/api/billing/subscriptions/[id]/reactivate`

**Files:**
- Component: [`components/billing/SubscriptionExpirationBanner.tsx`](../../components/billing/SubscriptionExpirationBanner.tsx)

---

### `TeamSuspensionBanner`

**Displays warning banners for teams in grace period or suspended (after downgrade).**

**Usage:**
```tsx
// In team pages
<TeamSuspensionBanner teamId={team.id} />

// In dashboard (shows all user's teams)
<TeamSuspensionBanner userId={user.id} />
```

**Features:**
- Shows suspended teams with red alert
- Shows grace period teams with yellow/orange alert (urgent if ≤2 days)
- Calculates days remaining
- Provides action buttons:
  - "Upgrade Now" → `/settings/billing`
  - "View Team Details" → `/teams/[id]`
  - "View Workflows" → `/workflows`

**Files:**
- Component: [`components/teams/TeamSuspensionBanner.tsx`](../../components/teams/TeamSuspensionBanner.tsx)

---

## Notifications System

### Notification Types

1. **`grace_period_started`** - Sent immediately when grace period begins
2. **`grace_period_reminder_3_days`** - Sent when 3 days remain
3. **`grace_period_reminder_1_day`** - Sent when 1 day remains (urgent)
4. **`team_suspended`** - Sent when team is suspended
5. **`team_reactivated`** - Sent when team is reactivated

### Database Function

**`create_suspension_notification(team_id, user_id, notification_type, metadata)`**

Creates a notification record in `team_suspension_notifications`.

**Example:**
```sql
SELECT create_suspension_notification(
  '123e4567-e89b-12d3-a456-426614174000'::uuid,
  '987fbc97-4bed-5078-9f07-9141ba07c9f3'::uuid,
  'grace_period_started',
  '{"team_name": "Acme Corp", "days_remaining": 5}'::jsonb
);
```

### Future Integration

**Email Service (TODO):**
- Integrate with SendGrid/Postmark
- Send email when notification is created
- Include CTA buttons in email
- Track email opens/clicks

**In-App Notifications (TODO):**
- Add notification bell icon to header
- Show unread count
- Link to team settings or billing page

---

## Migration Guide

### Step 1: Apply Database Migrations

Run these migrations **IN ORDER**:

```bash
# Migration 1: Add columns
supabase db push 20251103000001_add_team_lifecycle_columns.sql

# Migration 2: Team folder initialization
supabase db push 20251103000002_create_team_folder_initialization.sql

# Migration 3: Workflow migration on deletion
supabase db push 20251103000003_create_workflow_migration_function.sql

# Migration 4: Notification system
supabase db push 20251103000004_create_suspension_notifications_table.sql
```

**Or push all at once:**
```bash
supabase db push
```

### Step 2: Set Environment Variables

Add to your `.env.local` or Vercel environment:

```bash
CRON_SECRET=<generate-random-secret>
```

**Generate secret:**
```bash
openssl rand -base64 32
```

### Step 3: Deploy to Vercel

Deploy the updated codebase. Vercel will automatically:
- Register the new cron job from `vercel.json`
- Start running it every 6 hours

### Step 4: Verify Cron Job

Check Vercel dashboard → Your Project → Cron Jobs

You should see:
```
/api/cron/check-team-suspensions - Every 6 hours
```

### Step 5: Test the Flow

**Test Grace Period:**
1. Create a test team
2. Call API: `POST /api/teams/[id]/suspend` with `action: "suspend"`, `gracePeriodDays: 1`
3. Check `TeamSuspensionBanner` shows warning
4. Wait for cron to run (or call manually)
5. Verify team is suspended after 1 day

**Test Workflow Execution Guard:**
1. Suspend a test team
2. Try to execute a workflow belonging to that team
3. Should receive 403 error with suspension details

**Test Workflow Migration:**
1. Create test team with workflows
2. Delete the team
3. Check creator's default folder - workflows should be there

---

## Troubleshooting

### Issue: Teams not getting suspended after grace period

**Check:**
1. Cron job is running: Vercel dashboard → Cron Jobs
2. `CRON_SECRET` is set correctly
3. Check logs for cron execution errors
4. Manually call: `GET /api/cron/check-team-suspensions?secret=YOUR_SECRET`

### Issue: Notifications not created

**Check:**
1. Database trigger exists: `notify_grace_period_trigger`
2. Function exists: `create_suspension_notification`
3. Check database logs for trigger errors
4. Verify `team_suspension_notifications` table exists

### Issue: Workflows still executing for suspended teams

**Check:**
1. Verify `workflow.team_id` is set correctly
2. Check `team.suspended_at` is not null
3. Review logs in [`/api/workflows/execute`](../../app/api/workflows/execute/route.ts)
4. Ensure execution guard code is deployed

### Issue: Workflows not migrated on team deletion

**Check:**
1. Database trigger exists: `migrate_workflows_before_team_delete`
2. Function exists: `migrate_team_workflows_to_creator()`
3. Check if creator has default folder (should auto-create)
4. Review database logs for trigger errors

---

## Testing Checklist

Before marking as complete, verify:

- [ ] Creating a team automatically creates root + trash folders
- [ ] User downgrade triggers 5-day grace period
- [ ] Grace period notification is created
- [ ] Banner shows in UI for teams in grace period
- [ ] Cron job suspends teams after grace period expires
- [ ] Suspended teams block workflow execution (403 error)
- [ ] Deleting a team migrates workflows to creator's folder
- [ ] Reactivating a team clears suspension and grace period
- [ ] Manual suspension via API works
- [ ] Reminders sent 3 days and 1 day before suspension

---

## Future Enhancements

### Priority 1 (High Impact)
1. **Email notifications** - Integrate with SendGrid for email alerts
2. **In-app notification center** - Bell icon with unread count
3. **Team transfer** - Allow owner to transfer team to another user
4. **Batch operations** - Suspend/unsuspend multiple teams at once

### Priority 2 (Nice to Have)
5. **Grace period extension** - Admin can extend grace period
6. **Audit log** - Track all suspension/reactivation events
7. **Self-service reactivation** - One-click upgrade + reactivate
8. **Webhook events** - Send webhooks when team is suspended/reactivated

### Priority 3 (Future)
9. **Downgrade preview** - Show what will happen before confirming
10. **Team archival** - Archive instead of delete (with restoration option)
11. **Partial suspension** - Suspend only workflows, keep data accessible
12. **Custom grace periods** - Set different grace periods per plan

---

## Related Documentation

- [Workspace Team Isolation Implementation](./workspace-team-isolation-implementation.md)
- [Template Quick Reference](./template-quick-reference.md)
- [Billing Integration Guide](./billing-integration-guide.md) *(TODO)*

---

## Summary

This system implements a **user-friendly, revenue-protecting billing enforcement** with:

✅ **5-day grace period** (industry standard)
✅ **Clear notifications** (3-day and 1-day reminders)
✅ **Workflow preservation** (migrate, don't delete)
✅ **Execution guards** (prevent suspended workflows)
✅ **Automated enforcement** (cron job every 6 hours)
✅ **Database-level integrity** (cascades + triggers)
✅ **Manual override** (admin can suspend/reactivate)

**Result:** Users get fair warning, admins have control, revenue is protected, data is never lost.
