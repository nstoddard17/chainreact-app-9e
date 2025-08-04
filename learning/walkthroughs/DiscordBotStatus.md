# Discord Bot Status Feature Walkthrough

## Overview

The Discord Bot Status feature provides real-time feedback to users about whether the Discord bot is available in their selected server, and offers a convenient way to add the bot if it's missing.

## Problem Solved

**Before**: Users would configure Discord actions, save them, and only discover the bot wasn't in the server when the workflow failed to execute.

**After**: Users get immediate visual feedback about bot status and can add the bot directly from the configuration modal.

## Architecture

### 1. Frontend Component (`DiscordBotStatus.tsx`)

**Location**: `components/workflows/DiscordBotStatus.tsx`

**Key Features**:
- Real-time status checking via API calls
- Visual state management (loading, connected, not available)
- Direct integration with Discord's OAuth flow

**State Management**:
```typescript
const [status, setStatus] = useState<BotStatus | null>(null)
const [isLoading, setIsLoading] = useState(true)
```

**API Integration**:
```typescript
const response = await fetch(`/api/discord/bot-status?guildId=${guildId}`)
const data = await response.json()
```

### 2. Backend API (`/api/discord/bot-status/route.ts`)

**Location**: `app/api/discord/bot-status/route.ts`

**Key Functions**:
- `verifyBotInGuild()`: Checks bot membership and permissions
- Authentication and authorization
- Error handling and status reporting

**Bot Verification Methods**:
1. **Guild Members List**: Fetches all members and searches for bot
2. **Direct Member Check**: Fallback method for specific member lookup

**Permission Checking**:
```typescript
const hasAdminPerms = (BigInt(permissions) & BigInt(8)) === BigInt(8)
const hasSendMessages = (BigInt(permissions) & BigInt(2048)) === BigInt(2048)
const hasManageMessages = (BigInt(permissions) & BigInt(8192)) === BigInt(8192)
```

### 3. Integration with Configuration Modals

**Location**: `components/workflows/configuration/ConfigurationForm.tsx`

**Conditional Rendering**:
```tsx
{nodeInfo?.providerId === 'discord' && values.guildId && (
  <div className="mt-6 px-6">
    <DiscordBotStatus guildId={values.guildId} />
  </div>
)}
```

## Data Flow

1. **User selects Discord server** → `guildId` is set in form values
2. **Component mounts** → API call to check bot status
3. **API verifies bot** → Returns status with permissions
4. **Component renders** → Shows appropriate state (connected/not available)
5. **User clicks "Add Bot"** → Opens Discord OAuth URL in new tab

## Bot Invite URL Construction

```typescript
const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID
const permissions = '8' // Administrator
const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&scope=bot%20applications.commands`
```

**Permissions Breakdown**:
- `8`: Administrator (full access)
- `bot`: Bot scope (required for bot functionality)
- `applications.commands`: Slash commands scope

## Error Handling

### Frontend Errors
- Network failures → Shows "Failed to check bot status"
- Invalid guild ID → Shows "No guild ID provided"
- API errors → Displays specific error messages

### Backend Errors
- Missing bot credentials → Returns configuration error
- Guild access denied → Returns permission error
- Network timeouts → Returns verification failure

## Security Considerations

1. **Authentication**: API requires valid user session
2. **Authorization**: User must have Discord integration connected
3. **Rate Limiting**: API calls are limited to prevent abuse
4. **Error Sanitization**: Sensitive information is not exposed in errors

## Performance Optimizations

1. **Conditional Loading**: Component only loads when Discord server is selected
2. **Caching**: Bot status could be cached (future enhancement)
3. **Lazy Loading**: Component is imported only when needed

## Future Enhancements

1. **Status Caching**: Cache bot status for 5-10 minutes
2. **Permission Details**: Show specific missing permissions
3. **Auto-refresh**: Periodically check status after bot addition
4. **Multiple Guilds**: Support checking multiple servers at once

## Testing Scenarios

1. **Bot in server with permissions** → Green "Connected" state
2. **Bot in server without permissions** → Orange "Not Available" with permission error
3. **Bot not in server** → Orange "Not Available" with "Add Bot" button
4. **Invalid guild ID** → Error state with appropriate message
5. **Network failure** → Error state with retry option

## Integration Points

- **Configuration Modals**: Automatically shows in Discord action configs
- **Workflow Builder**: Provides immediate feedback during setup
- **Error Handling**: Integrates with existing error display systems
- **OAuth Flow**: Seamlessly connects to Discord's authorization system 