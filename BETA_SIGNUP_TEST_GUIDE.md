# Beta Signup Flow Testing Guide

## Setup Instructions

### 1. Apply Database Changes

First, apply the database trigger that ensures beta user profiles are created:

```bash
# Run this SQL in your Supabase SQL editor
# File: beta-user-profile-trigger.sql
```

This trigger:
- Automatically creates user profiles for beta testers
- Sets role to 'beta-pro'
- Auto-confirms email addresses
- Updates beta_testers table to 'converted' status

### 2. Database Requirements

Ensure these tables exist:
- `beta_testers` - Stores beta tester invitations
- `user_profiles` - Stores user profile data including usernames

## Testing Process

### Step 1: Create Beta Invitation

1. In your database, insert a beta tester record:

```sql
INSERT INTO beta_testers (email, status, expires_at, max_workflows, max_executions_per_month)
VALUES (
  'testbeta@example.com',
  'active',
  NOW() + INTERVAL '30 days',
  50,
  5000
);
```

### Step 2: Generate Invitation Link

Use the admin API or manually create:

```javascript
const signupToken = Buffer.from(`testbeta@example.com:${Date.now()}`).toString('base64')
const signupUrl = `http://localhost:3000/auth/beta-signup?token=${signupToken}&email=${encodeURIComponent('testbeta@example.com')}`
```

Update the beta_testers record with the token:

```sql
UPDATE beta_testers
SET signup_token = 'YOUR_GENERATED_TOKEN'
WHERE email = 'testbeta@example.com';
```

### Step 3: Test the Flow

1. **Navigate to the signup URL**
   - Should see "Verified Beta Invitation" badge
   - Email field should be pre-filled and disabled

2. **Fill out the form**
   - Full Name: Test User
   - Username: testuser123 (real-time availability checking)
   - Password: TestPass123!
   - Confirm Password: TestPass123!

3. **Submit the form**
   - Account creation with retry logic (up to 3 attempts)
   - Profile creation with username and beta-pro role
   - Auto sign-in after successful creation
   - Direct redirect to dashboard (no setup-username page)

### Step 4: Verify Success

Check these items after signup:

1. **Auth User Created**
   ```sql
   SELECT * FROM auth.users WHERE email = 'testbeta@example.com';
   ```
   - Should have `is_beta_tester: true` in metadata

2. **User Profile Created**
   ```sql
   SELECT * FROM user_profiles WHERE username = 'testuser123';
   ```
   - Should have role = 'beta-pro'
   - Username should be set

3. **Beta Tester Status Updated**
   ```sql
   SELECT * FROM beta_testers WHERE email = 'testbeta@example.com';
   ```
   - Status should be 'converted'
   - conversion_date should be set

4. **Dashboard Access**
   - User should land directly on dashboard
   - No redirect to setup-username page

## Error Scenarios to Test

### 1. Invalid Token
- Use an incorrect token in the URL
- Should show "Invalid Invitation" message

### 2. Expired Invitation
- Set expires_at to past date
- Should show "Invitation Expired" message

### 3. Already Converted
- Try using same invitation twice
- Should show "Already Signed Up" message

### 4. Username Taken
- Try a username that already exists
- Real-time feedback should show red X
- Submit button should be disabled

### 5. Profile Creation Failure
- If profile creation fails after 3 retries:
  - User sees error message
  - Account creation is prevented
  - User can try again

## Middleware Behavior

The updated middleware provides:
- **Grace period for beta users**: 60 seconds for profile creation
- **No immediate redirect**: Beta users won't be forced to setup-username
- **Proper role detection**: Checks for 'beta-pro' role in profiles

## Console Logs to Monitor

During testing, watch for these console logs:

```javascript
// Beta signup page
"Token validation:" // Shows token decode details
"Attempting to create profile (attempt X/3)" // Retry attempts
"Profile created and verified successfully:" // Success confirmation
"Final profile check passed:" // Before redirect

// Middleware
"[Middleware] Username check:" // Shows user state
"[Middleware] New beta user, profile still being created" // Grace period active
```

## Common Issues and Solutions

| Issue | Solution |
|-------|----------|
| Redirect to setup-username | Check if profile creation succeeded, verify middleware logs |
| Token validation fails | Ensure token matches email and is stored in database |
| Username always unavailable | Check if user_profiles table has proper indexes |
| Profile creation fails | Verify RLS policies allow service role to create profiles |
| Auto sign-in fails | Check if email confirmation is working for beta users |

## Success Criteria

✅ Beta tester receives email with valid invitation link
✅ Token validation passes on beta-signup page
✅ Username availability checking works in real-time
✅ Account creation succeeds with retry logic
✅ Profile is created with username and beta-pro role
✅ User is automatically signed in
✅ User lands directly on dashboard
✅ No redirect to setup-username page
✅ Beta tester status updated to 'converted'

## Rollback Instructions

If issues occur, you can rollback:

1. Remove the database trigger:
   ```sql
   DROP TRIGGER IF EXISTS ensure_beta_user_profile_trigger ON auth.users;
   DROP FUNCTION IF EXISTS public.ensure_beta_user_profile();
   ```

2. Revert to previous beta-signup page version
3. Revert middleware changes

## Notes

- The system includes multiple failsafes to ensure profile creation
- Retry logic with exponential backoff prevents race conditions
- Grace period in middleware prevents premature redirects
- Database trigger acts as final safety net for profile creation