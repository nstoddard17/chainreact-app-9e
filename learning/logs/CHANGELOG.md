# Learning Folder Changelog

## [2024-12-19] – OAuth Callback Standardization Fix

### Problem
- Inconsistent popup response implementations across different OAuth callbacks
- Some callbacks used custom JavaScript instead of the centralized `createPopupResponse` utility
- Missing localStorage communication in custom callback implementations
- Potential for OAuth confusion due to inconsistent error handling
- Provider validation missing in callbacks, leading to cross-provider confusion

### Solution
- Standardized all OAuth callbacks to use the centralized `createPopupResponse` utility
- Updated custom callback implementations (Trello, Slack, Shopify) to use COOP-safe communication
- Added localStorage communication to all callbacks for better reliability
- Ensured consistent error handling and user experience across all providers
- Added provider validation in callbacks to prevent cross-provider confusion
- Enhanced state object to include provider information for validation

### Implementation Details
- Updated `app/api/integrations/shopify/callback/route.ts` to use centralized utility
- Enhanced `app/api/integrations/trello/callback/route.ts` with localStorage communication
- Fixed `app/api/integrations/slack/callback/route.ts` to use consistent error handling
- Added provider validation in `app/api/integrations/google-calendar/callback/route.ts`
- Enhanced state object in OAuth URL generation to include provider information
- All callbacks now use the same communication pattern for reliability

### Benefits
- Consistent OAuth experience across all providers
- Better COOP policy compatibility
- More reliable popup communication
- Reduced risk of OAuth confusion and multiple popups
- Prevents cross-provider confusion (Google Calendar vs Microsoft Outlook)

### Files Modified:
- `app/api/integrations/shopify/callback/route.ts` - Standardized to use createPopupResponse
- `app/api/integrations/trello/callback/route.ts` - Added localStorage communication
- `app/api/integrations/slack/callback/route.ts` - Fixed error handling consistency
- `app/api/integrations/google-calendar/callback/route.ts` - Added provider validation
- `app/api/integrations/auth/generate-url/route.ts` - Enhanced state object with provider info

## [2024-12-19] – OAuth Provider Confusion Fix

### Problem
- When reconnecting Google Calendar, it would sometimes redirect to Microsoft Outlook
- OAuth URLs were being mixed up between different providers
- Browser was opening new tabs instead of popups for OAuth flows

### Solution
- Separated OAuth URL generation for each Google service (no more case grouping)
- Added validation to ensure Google Calendar URLs are actually for Google
- Improved provider name normalization and validation
- Added timestamp to prevent OAuth URL caching
- Cleared localStorage items with matching prefixes before opening popups
- Created debug tools for OAuth URL generation and testing

### Implementation Details
- Modified `app/api/integrations/auth/generate-url/route.ts` to handle each Google service separately
- Enhanced `reconnectIntegration` in `stores/integrationStore.ts` with better validation
- Added URL verification before opening OAuth popups
- Created debug endpoints and pages for OAuth testing

### Benefits
- Prevents provider confusion between Google Calendar and Microsoft Outlook
- More reliable OAuth reconnection flow
- Better error handling and debugging capabilities
- Improved user experience with consistent OAuth provider selection

### Files Modified:
- `app/api/integrations/auth/generate-url/route.ts` - Separated OAuth URL generation
- `stores/integrationStore.ts` - Added validation and improved popup handling
- `app/api/debug-oauth-redirect/route.ts` (new) - Debug endpoint for OAuth URLs
- `app/debug-oauth/page.tsx` (new) - Debug page for testing OAuth flows

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

## [2024-12-19] – Complete COOP Policy Fix: Removed All popup.closed Checks

- **Removed all `popup.closed` checks** from `stores/integrationStore.ts` to eliminate COOP policy errors
- **Updated `isPopupValid` function** to simply check if popup exists, not if it's closed
- **Simplified popup closing logic** to use try-catch blocks without closed checks
- **Relied entirely on localStorage polling and message events** for OAuth communication
- **Updated `resetConnectionState` method** to remove popup.closed validation

### Files Modified:
- `stores/integrationStore.ts` - Removed all popup.closed checks and simplified popup validation

### Technical Details:
- COOP policy blocks `window.closed` checks between different origins
- OAuth popups now rely on localStorage polling and postMessage for communication
- Popup closing operations wrapped in try-catch to handle COOP restrictions gracefully
- This eliminates the "Cross-Origin-Opener-Policy policy would block the window.closed call" error

### Next Steps:
- Monitor OAuth flow reliability with localStorage-only communication
- Consider implementing timeout-based cleanup for abandoned popups

## [2024-12-19] – Fixed Multiple OAuth Popups Issue

- **Problem**: Multiple OAuth popups were appearing when users tried to connect integrations
- **Root Cause**: Global popup management variables (`currentOAuthPopup`, `windowHasLostFocus`) were not being properly updated when new popups were created
- **Solution**: 
  - Added `closeExistingPopup()` helper function to properly close existing popups before opening new ones
  - Updated `connectIntegration` and `reconnectIntegration` methods to call `closeExistingPopup()` before creating new popups
  - Added proper global popup reference management (`currentOAuthPopup = popup`) when new popups are created
  - Added `currentOAuthPopup = null` reset in all success/error/cancel handlers for both message events and localStorage polling
  - Updated `resetConnectionState` to use the new helper function

### Files Modified:
- `stores/integrationStore.ts` - Added proper popup management to prevent multiple popups

### Next Steps:
- Monitor for any remaining popup-related issues
- Consider adding additional safeguards for edge cases