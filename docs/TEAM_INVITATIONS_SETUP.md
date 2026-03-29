# Team Invitations Setup Guide

This guide covers the complete in-app team invitation system with plan restrictions and notifications.

## Overview

The team invitation system allows Pro+ users to invite other ChainReact users to join their teams. Invitations are sent as in-app notifications, and members must accept before joining.

## Features

✅ In-app notifications for invitations
✅ Plan restriction - requires Pro plan or higher
✅ Accept/Reject invitation flow
✅ Auto-expire after 7 days
✅ Prevent duplicate invitations
✅ Real-time notification badge
✅ Email-based user search

## Database Setup

### Step 1: Run the Migration

```bash
supabase db push
```

This will create:
- `team_invitations` table with RLS policies
- `notifications` table with RLS policies
- Helper functions for expiring old invitations
- Indexes for performance

### Step 2: Verify Tables

Check that these tables exist in your Supabase dashboard:

**team_invitations**
- id (UUID)
- team_id (UUID)
- inviter_id (UUID)
- invitee_id (UUID)
- role (TEXT)
- status (TEXT) - pending, accepted, rejected, expired
- invited_at, responded_at, expires_at (TIMESTAMPTZ)

**notifications**
- id (UUID)
- user_id (UUID)
- type (TEXT)
- title (TEXT)
- message (TEXT)
- action_url (TEXT)
- metadata (JSONB)
- read (BOOLEAN)
- created_at (TIMESTAMPTZ)

## UI Integration

### Step 1: Add Notifications Dropdown to Layout

Add the notifications dropdown to your app's main layout/navigation:

```tsx
import { NotificationsDropdown } from "@/components/notifications/NotificationsDropdown"

// In your header/navbar component:
<NotificationsDropdown />
```

This will show:
- Bell icon with unread count badge
- Dropdown with latest 50 notifications
- Mark as read functionality
- Delete notifications
- Auto-refresh every 30 seconds

### Step 2: Create Invitations Page (Optional)

If you want a dedicated page to view all invitations:

```tsx
// app/teams/invitations/page.tsx
"use client"

import { useEffect, useState } from "react"
import { TeamInvitationCard } from "@/components/teams/TeamInvitationCard"
import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"

export default function TeamInvitationsPage() {
  const [invitations, setInvitations] = useState([])

  useEffect(() => {
    fetchInvitations()
  }, [])

  const fetchInvitations = async () => {
    const response = await fetch('/api/notifications?unread=true')
    const { notifications } = await response.json()

    const inviteNotifications = notifications.filter(
      n => n.type === 'team_invitation'
    )
    // Fetch full invitation details if needed
  }

  return (
    <NewAppLayout title="Team Invitations">
      <div className="grid gap-4">
        {invitations.map(invitation => (
          <TeamInvitationCard
            key={invitation.id}
            invitation={invitation}
            onUpdate={fetchInvitations}
          />
        ))}
      </div>
    </NewAppLayout>
  )
}
```

## How It Works

### Invitation Flow

1. **Team Admin Sends Invitation**
   - Admin must be on Pro+ plan
   - Searches for user by email
   - Selects role (member, manager, admin)
   - Clicks "Invite Member"

2. **System Creates Records**
   - Creates `team_invitations` record with status "pending"
   - Creates `notifications` record for invitee
   - Links invitation to notification via metadata

3. **Invitee Receives Notification**
   - Bell icon shows unread count
   - Notification appears in dropdown
   - Can click to view invitation details

4. **Invitee Responds**
   - **Accept**: Added to team, invitation marked "accepted"
   - **Reject**: Invitation marked "rejected"
   - **Ignore**: Auto-expires after 7 days

5. **Cleanup**
   - Read notifications deleted after 30 days (optional cron job)
   - Expired invitations marked automatically

## Plan Restrictions

The invitation API checks the inviter's plan:

```typescript
if (!inviterProfile || inviterProfile.plan === 'free') {
  return errorResponse("Team invitations require a Pro plan or higher. Please upgrade your account.", 403)
}
```

Valid plans for team invitations:
- `starter`
- `professional`
- `team`
- `enterprise`

**NOT allowed:**
- `free`

## API Endpoints

### Send Invitation
```
POST /api/teams/[id]/members
Body: { user_id: string, role: string }
```

### Accept Invitation
```
POST /api/teams/invitations/[id]
```

### Reject Invitation
```
DELETE /api/teams/invitations/[id]
```

### Get Notifications
```
GET /api/notifications?unread=true
```

### Mark as Read
```
PATCH /api/notifications
Body: { notification_ids: string[] } or { mark_all: true }
```

## Testing

### Test the Complete Flow

1. **Setup Test Users**
   - User A: Pro plan (inviter)
   - User B: Any plan (invitee)

2. **Send Invitation**
   ```bash
   # As User A
   1. Go to /teams/[your-team-slug]/members
   2. Click "Invite Member"
   3. Enter User B's email
   4. Select role
   5. Click "Invite Member"
   ```

3. **Check Notification**
   ```bash
   # As User B
   1. Look for red badge on bell icon
   2. Click bell to see notification
   3. Click notification to view invitation
   ```

4. **Accept/Reject**
   ```bash
   # As User B
   1. Click "Accept" or "Decline"
   2. Should redirect to team page (if accepted)
   3. Bell badge should update
   ```

### Test Plan Restrictions

```bash
# As Free Plan User
1. Try to invite a member
2. Should see error: "Team invitations require a Pro plan or higher"
```

### Test Edge Cases

1. **Duplicate Invitation**
   - Try inviting same user twice
   - Should see: "An invitation is already pending for this user"

2. **Already a Member**
   - Try inviting existing team member
   - Should see: "User is already a member of this team"

3. **User Not Found**
   - Enter email that doesn't exist
   - Should see: "User not found with that email. They need to create a ChainReact account first."

## Troubleshooting

### Invitations Not Appearing

1. Check database:
   ```sql
   SELECT * FROM team_invitations WHERE invitee_id = 'user-id';
   ```

2. Check notifications:
   ```sql
   SELECT * FROM notifications WHERE user_id = 'user-id';
   ```

3. Check RLS policies:
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'team_invitations';
   ```

### Plan Check Failing

1. Verify user's plan in database:
   ```sql
   SELECT id, email, plan FROM user_profiles WHERE id = 'user-id';
   ```

2. Update plan if needed:
   ```sql
   UPDATE user_profiles SET plan = 'professional' WHERE id = 'user-id';
   ```

### Notifications Not Showing

1. Check service client has permissions
2. Verify notification was created in database
3. Check browser console for API errors
4. Verify RLS policies allow reading

## Future Enhancements

- [ ] Email notifications (in addition to in-app)
- [ ] Team invitation links (no account required)
- [ ] Batch invitations (invite multiple users at once)
- [ ] Invitation templates
- [ ] Slack/Discord notification integrations
- [ ] Invitation analytics dashboard

## Security Notes

- All APIs check authentication via Supabase auth
- RLS policies prevent viewing other users' invitations
- Plan checks happen on server-side (not client-side)
- Invitees can only update their own invitations
- Inviters can only create invitations for teams they admin

## Database Cleanup (Optional)

Add these to a cron job or scheduled function:

```sql
-- Expire old invitations (run daily)
SELECT expire_old_team_invitations();

-- Clean up old read notifications (run weekly)
SELECT cleanup_old_notifications();
```

## Support

If you encounter issues:
1. Check the [troubleshooting section](#troubleshooting)
2. Review server logs for API errors
3. Check Supabase dashboard for RLS policy errors
4. Verify all migrations ran successfully
