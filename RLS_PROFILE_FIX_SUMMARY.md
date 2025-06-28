# RLS Profile Access Fix Summary

## Problem
The application was experiencing profile fetch errors due to Row Level Security (RLS) policies on the `user_profiles` table. The errors occurred because:

1. **Timing Issue**: When users first sign up, they might not have a profile record yet
2. **RLS Policy Restriction**: The RLS policy `auth.uid() = id` fails when there's no matching record
3. **Fallback Logic**: The original code tried to fetch a profile first, then create one if it failed, but this approach doesn't work well with RLS

## Root Cause
The RLS policies were working correctly, but the application logic was trying to fetch profiles that didn't exist yet. This created a chicken-and-egg problem where:
- User needs a profile to pass RLS checks
- But profile can't be created because RLS blocks the operation
- Leading to infinite fallback loops

## Solution Implemented

### 1. Modified Auth Store Logic (`stores/authStore.ts`)
- **Changed from fetch-then-create to upsert-first approach**
- Uses Supabase's `upsert()` operation which handles both INSERT and UPDATE
- The `onConflict: 'id'` parameter ensures existing profiles are updated, new ones are created
- This works with RLS because the operation is atomic and the user is creating their own profile

### 2. Improved Error Handling
- Added proper null checks for the `profile` variable
- Implemented multiple fallback strategies
- Ensured all code paths properly initialize the profile variable
- Added timeout protection for database operations

### 3. RLS Policy Fix (`scripts/fix-user-profiles-rls.sql`)
- Cleaned up existing conflicting policies
- Created three clear policies:
  - `Users can read their own profile` (SELECT)
  - `Users can update their own profile` (UPDATE)  
  - `Users can insert their own profile` (INSERT)
- All policies use `auth.uid() = id` which works correctly with upsert operations

## Key Changes Made

### In `stores/authStore.ts`:
```typescript
// OLD: Try to fetch, then create if fails
const profileResult = await supabase
  .from('user_profiles')
  .select(...)
  .eq('id', session.user.id)
  .single()

// NEW: Use upsert to create or get existing profile
const upsertResult = await supabase
  .from('user_profiles')
  .upsert(createProfileData, { 
    onConflict: 'id',
    ignoreDuplicates: false 
  })
  .select(...)
  .single()
```

### In Database:
```sql
-- Clean, simple RLS policies
CREATE POLICY "Users can read their own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile" ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
```

## Benefits of This Solution

1. **Maintains Security**: RLS policies remain active and functional
2. **Handles New Users**: Works correctly for first-time users without profiles
3. **Atomic Operations**: Upsert ensures data consistency
4. **Better Performance**: Single database operation instead of fetch-then-create
5. **Robust Error Handling**: Multiple fallback strategies ensure the app doesn't break

## Testing

1. Run the SQL script `scripts/fix-user-profiles-rls.sql` in your Supabase dashboard
2. Test with both new and existing users
3. Verify that profile creation and updates work correctly
4. Check that users can only access their own profiles (security test)

## Files Modified

- `stores/authStore.ts` - Updated profile fetching logic
- `scripts/fix-user-profiles-rls.sql` - New RLS policy fix
- `scripts/test-user-profiles-rls.sql` - Test script for verification

## Next Steps

1. Deploy the updated auth store code
2. Run the RLS fix script in your Supabase database
3. Test the authentication flow with new users
4. Monitor for any remaining profile-related errors 