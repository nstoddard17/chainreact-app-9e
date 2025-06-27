# Database Fix Instructions

## Problem
Marcus Leonard's user profile shows `provider: 'Email'` instead of `'google'` even though he has Google identities.

## Solution
Run these SQL commands in your database to fix the issue:

### Option 1: Fix Marcus Leonard specifically
```sql
UPDATE user_profiles 
SET 
  provider = 'google',
  updated_at = NOW()
WHERE id = '3d0c4fed-5e0e-43f2-b037-c64ce781e008';
```

### Option 2: Fix all users with Google identities
```sql
UPDATE user_profiles 
SET 
  provider = 'google',
  updated_at = NOW()
WHERE id IN (
  SELECT au.id 
  FROM auth.users au 
  WHERE au.identities IS NOT NULL 
    AND au.identities::text LIKE '%google%'
)
AND (provider = 'Email' OR provider = 'email');
```

### Option 3: Run the comprehensive fix script
Use the `scripts/fix-all-google-providers.sql` file which includes:
- Viewing current state
- Updating all Google users
- Updating all email users
- Showing final results

## Verification
After running the fix, verify the change:
```sql
SELECT 
  id,
  full_name,
  provider,
  updated_at
FROM user_profiles 
WHERE id = '3d0c4fed-5e0e-43f2-b037-c64ce781e008';
```

## Future Prevention
The code has been updated to:
1. Always update `user_profiles.provider` when users sign in with Google
2. Use `user_profiles` table as the authoritative source for provider information
3. Remove dependency on `auth.users` metadata for provider information

## Package Manager Issue Fixed
- Removed `pnpm-lock.yaml` to avoid conflicts
- Using `npm` instead of `pnpm`
- All dependencies are now properly installed 