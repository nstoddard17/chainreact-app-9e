# Learning Folder Changelog

## [2024-12-19] – OAuth Flow COOP Policy Fix

### Problem
- Cross-Origin-Opener-Policy (COOP) policy was blocking `window.closed` checks in OAuth popups
- Error: `Cross-Origin-Opener-Policy policy would block the window.closed call`
- This caused OAuth flows to fail or redirect to incorrect providers

### Solution
- Implemented dual-channel communication between OAuth popup and main window:
  1. Primary: `postMessage` API for direct communication (when available)
  2. Fallback: `localStorage` for COOP-safe communication
- Updated `createPopupResponse.ts` to store OAuth responses in localStorage
- Modified integration store to check localStorage for OAuth responses
- Added try-catch blocks around `popup.closed` checks as a fallback

### Implementation Details
- Added unique storage keys with timestamps for each OAuth response
- Implemented prefix-based localStorage scanning to find responses
- Added proper cleanup of localStorage items after processing
- Maintained backward compatibility with existing message event handlers

### Benefits
- More reliable OAuth flow that works with strict browser security policies
- No more COOP policy errors in the console
- Prevents redirection to incorrect providers (e.g., Microsoft Outlook instead of Google Calendar)
- Better user experience with clearer error handling

### Files Modified:
- `lib/utils/createPopupResponse.ts` - Added localStorage storage for OAuth responses
- `stores/integrationStore.ts` - Added localStorage checking for OAuth responses
- `next.config.mjs` - Added COOP header configuration (long-term fix)

## [2024-12-19] – OAuth Environment Variable Issue Resolved

### Problem Resolution
- **Issue**: `client_id=undefined` in OAuth URL causing "The OAuth client was not found" error
- **Root Cause**: Client-side OAuth URL generation using `process.env.GOOGLE_CLIENT_ID` without `NEXT_PUBLIC_` prefix
- **Solution**: Migrated Google Sign-In to server-side OAuth flow

### Implementation Details
- **Created** `app/actions/google-auth.ts` - Server action for secure OAuth URL generation
- **Updated** `stores/authStore.ts` - Now uses server action instead of client-side OAuth
- **Fixed** database schema issue - Removed non-existent `user_id` column from `pkce_flow` table
- **Simplified** environment variables - Only need `GOOGLE_CLIENT_ID` (server-side)

### Benefits
- More secure OAuth implementation (client ID not exposed in browser)
- Simplified environment variable management
- Consistent with integration OAuth pattern
- Better error handling and user experience

### Files Modified:
- `app/actions/google-auth.ts` (new)
- `stores/authStore.ts`