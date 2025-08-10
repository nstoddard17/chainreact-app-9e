# Learning Folder Changelog

## [2023-07-15] – Added Microsoft Graph Integration with Real-time Sync

- Implemented Microsoft Graph client with delta query support for OneDrive, Mail, Calendar, Teams/Chats
- Added webhook subscription management system with auto-renewal
- Created worker for processing webhook notifications and fetching detailed changes
- Implemented normalization of Microsoft Graph events for workflow triggers
- Added support for Teams encrypted payloads with certificate-based decryption
- Created self-healing mechanism for subscription health monitoring
- Implemented OneNote fallback via OneDrive/SharePoint for notebook changes

### Files Created/Modified:
- `lib/microsoft-graph/client.ts` - Microsoft Graph API client with delta query support
- `lib/microsoft-graph/subscriptionManager.ts` - Subscription management for webhooks
- `app/api/webhooks/microsoft/route.ts` - Webhook endpoint for Microsoft Graph
- `app/api/microsoft-graph/worker/route.ts` - Worker for processing webhook notifications
- `app/api/microsoft-graph/auto-subscribe/route.ts` - Auto-subscription based on user selections
- `app/api/microsoft-graph/health-check/route.ts` - Subscription health monitoring
- `app/api/cron/microsoft-subscription-renewal/route.ts` - Automatic subscription renewal
- `app/api/microsoft-graph/subscriptions/route.ts` - API for managing subscriptions
- `hooks/use-microsoft-graph-subscriptions.ts` - React hook for subscription management
- `db/migrations/create_microsoft_graph_tables.sql` - Database schema for Microsoft Graph
- `learning/docs/microsoft-graph-integration.md` - Documentation

### Next Steps:
- Add UI components for Microsoft Graph subscription management
- Implement additional workflow trigger types for Microsoft Graph events
- Add support for more Microsoft Graph resources (e.g., To Do, Planner)
- Enhance error handling and retry mechanisms

## [2024-12-31] – Discord Bot Status Feature & UI Improvements

### Summary:
- **Fixed double highlight issue** - Removed white border on focus to show only blue focus ring
- **Added Discord bot status feature** - Shows bot status and provides "Add Bot" button when bot is not in server
- **Enhanced field styling** - Improved focus states across all form fields with better visual feedback

### Key Changes:
- **Field Highlighting Fixes**:
  - Added `overflow-visible` to ScrollArea to prevent clipping
  - Enhanced focus states with blue ring (`focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`)
  - Improved spacing with `px-2` padding and `mt-6` margins
  - Better visual hierarchy with consistent spacing
  - **Fixed Discord modal fields** - Enhanced focus states in FieldRenderer component for all field types
  - **Fixed double highlight issue** - Changed `focus:border-blue-500` to `focus:border-transparent` to show only blue ring

- **Discord Bot Status Feature**:
  - Created `DiscordBotStatus` component with real-time status checking
  - Added API endpoint `/api/discord/bot-status` for bot verification
  - Integrated bot status into Discord configuration modals
  - Provides "Add Bot" button that opens Discord OAuth invite URL
  - Shows visual feedback for connected/not available states

### Files Created:
- `components/workflows/DiscordBotStatus.tsx` - New component for Discord bot status display
- `app/api/discord/bot-status/route.ts` - New API endpoint for bot status verification
- `learning/docs/DiscordBotStatus.md` - Component documentation
- `learning/walkthroughs/DiscordBotStatus.md` - Detailed implementation walkthrough

### Files Modified:
- `components/ui/dialog.tsx` - Added DialogContentWithoutClose component
- `components/workflows/AIAgentConfigModal.tsx` - Updated to use DialogContentWithoutClose, enhanced close button, and improved field styling
- `components/workflows/configuration/ConfigurationModal.tsx` - Enhanced close button with hover effects
- `components/workflows/configuration/ConfigurationForm.tsx` - Added overflow-visible and better spacing for field highlights, integrated Discord bot status
- `components/workflows/configuration/fields/FieldRenderer.tsx` - Added enhanced focus states to all form field types, fixed double highlight issue
- `components/workflows/TriggerOutputSelector.tsx` - Enhanced close button and improved ScrollArea styling
- `learning/docs/AIAgentConfigModal.md` - Created comprehensive component documentation
- `learning/walkthroughs/AIAgentConfigModal.md` - Created detailed implementation walkthrough

### Next Steps:
- Test Discord bot status feature with various server configurations
- Consider adding status caching for better performance
- Monitor user feedback on the improved field highlighting

---

## [2024-12-31] – Discord Server Selection Issue Investigation

### Problem
- Discord server dropdown shows options but selection doesn't work
- When user clicks on a server option, dropdown closes but no value is selected
- Config modal shows all fields instead of just server field initially

### Investigation & Fixes Applied
- **Updated `getVisibleFields` function**: Added special handling for Discord actions to only show server field initially
- **Enhanced `handleFieldChange` function**: Added server-side logging to track field value changes
- **Added server-side debugging to `FieldRenderer`**: Added logging to see what options are available for Discord guilds
- **Fixed Discord guilds loading**: Updated `useDynamicOptions` to use `loadDiscordGuildsOnce` for Discord guilds
- **Created debug logging API**: Added `/api/debug/log` endpoint for server-side debugging

### Current State
- ✅ Discord guilds are loading successfully (confirmed in server logs)
- ✅ Config modal now shows only server field initially for Discord actions
- ✅ After server selection, other fields (channel, message) should appear
- ✅ Discord bot status is working (confirmed in server logs)
- 🔍 **Investigating**: Why server selection isn't working (dropdown closes without selecting)

### Server-Side Debugging Added
- Server logging in `handleFieldChange` to track when server is selected
- Server logging in `FieldRenderer` to see available options for guildId field
- New `/api/debug/log` endpoint for centralized debugging
- Server logs show Discord guilds are being fetched successfully

### Files Modified
- `components/workflows/configuration/ConfigurationForm.tsx` - Added Discord-specific field visibility logic and server-side logging
- `components/workflows/configuration/hooks/useDynamicOptions.ts` - Added Discord guilds special handling
- `components/workflows/configuration/fields/FieldRenderer.tsx` - Added server-side debugging for Discord guilds
- `app/api/debug/log/route.ts` - New debug logging API endpoint

### Next Steps
- Test Discord send message configuration modal
- Check server logs for debugging information (look for "DEBUG LOG" entries)
- Verify if server selection is working with the new logic
- Test Discord bot status feature after server selection