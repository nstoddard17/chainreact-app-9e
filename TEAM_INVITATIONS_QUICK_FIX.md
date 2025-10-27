# Team Invitations - Quick Fix Guide

## Issues Fixed

### 1. ✅ Changed from Plan Check to Role Check
- Now checks `user_profiles.role` instead of `user_profiles.plan`
- Both inviter AND invitee must NOT have role = 'free'

### 2. ✅ Added Missing Column
- Created migration to add `action_label` column to notifications table

## What You Need to Do

### Step 1: Push Migrations

```bash
supabase db push
```

This will:
- Create `team_invitations` table
- Create/update `notifications` table with `action_label` column
- Set up all RLS policies

### Step 2: Test the Role Restrictions

**Test 1: Free User Trying to Invite**
```
Expected Error: "Team invitations require a paid plan. Please upgrade your account."
```

**Test 2: Inviting a Free User**
```
Expected Error: "[User Name] is on the free plan. Users must have a paid plan to be invited to teams."
```

**Test 3: Both Users NOT Free**
```
Expected: Invitation sent successfully!
- Email notification sent
- In-app notification created
```

### Step 3: Check Server Logs

When you send an invitation, you should see:

```bash
# Debug log showing the invitee's role
Invitee profile: { id: '...', email: '...', role: 'free', has_role_field: true }
```

If `role` is null or the field doesn't exist, there's a schema issue.

## Role Values

Valid roles (from your existing code):
- `'free'` - NOT allowed for team invitations
- `'owner'` - Allowed
- `'admin'` - Allowed
- `'member'` - Allowed
- Any other non-'free' value - Allowed

## Migration Files

1. **Main migration**: `20251027113409_create_team_invitations_and_notifications.sql`
   - Creates team_invitations table
   - Creates notifications table
   - RLS policies

2. **Fix migration**: `20251027115058_fix_notifications_add_action_label.sql`
   - Adds action_label column

## Quick Test SQL

To test with your current users:

```sql
-- Check current roles
SELECT id, email, role FROM user_profiles;

-- Update a user to free (for testing error)
UPDATE user_profiles SET role = 'free' WHERE email = 'test@example.com';

-- Update users to allow invitations (for testing success)
UPDATE user_profiles SET role = 'member' WHERE email IN ('user1@example.com', 'user2@example.com');
```

## Troubleshooting

### "Could not find the 'action_label' column"
- **Solution**: Run `supabase db push`

### Invitations still work for free users
- **Check**: User's role in database: `SELECT role FROM user_profiles WHERE email = 'test@example.com'`
- **Fix**: Make sure migrations are pushed
- **Debug**: Check server logs for the "Invitee profile" debug line

### "User not found" error
- **Cause**: User doesn't exist in user_profiles table
- **Fix**: Make sure the user has signed up and has a profile

## What Changed From Original

**Before** (checking plan):
```typescript
if (!inviterProfile.plan || inviterProfile.plan === 'free') {
  return errorResponse("Team invitations require a Pro plan or higher...")
}
```

**After** (checking role):
```typescript
if (!inviterProfile.role || inviterProfile.role === 'free') {
  return errorResponse("Team invitations require a paid plan...")
}
```

Same logic, different column!
