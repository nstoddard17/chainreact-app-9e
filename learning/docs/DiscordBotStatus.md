---
title: Discord Bot Status Component
date: 2024-12-31
component: DiscordBotStatus
---

# Discord Bot Status Component

A React component that displays the status of the Discord bot in a specific guild and provides functionality to add the bot if it's not present.

## Features

- **Real-time Status Check**: Verifies if the bot is a member of the specified Discord server
- **Permission Validation**: Checks if the bot has necessary permissions (Send Messages, Manage Messages, or Administrator)
- **Add Bot Button**: Provides a direct link to add the bot to the server with proper permissions
- **Visual Feedback**: Shows different states with appropriate colors and icons

## Props

```typescript
interface DiscordBotStatusProps {
  guildId?: string    // Discord guild/server ID
  className?: string  // Additional CSS classes
}
```

## Usage

```tsx
import DiscordBotStatus from '@/components/workflows/DiscordBotStatus'

// In a configuration modal
<DiscordBotStatus guildId="123456789012345678" />
```

## States

### Loading State
- Shows a spinner with "Checking bot status..." text
- Appears while the API call is in progress

### Connected State (Green)
- Shows green card with checkmark icon
- Displays "Discord Bot Ready" with "Connected" badge
- Indicates bot is in server and has required permissions

### Not Available State (Orange)
- Shows orange alert with warning icon
- Displays "Discord Bot Not Available" with error message
- Includes "Add Bot" button that opens Discord invite URL

## API Integration

The component calls `/api/discord/bot-status?guildId={guildId}` to check bot status.

### API Response
```typescript
{
  isInGuild: boolean
  hasPermissions: boolean
  error?: string
}
```

## Bot Invite URL

When the "Add Bot" button is clicked, it opens:
```
https://discord.com/api/oauth2/authorize?client_id={CLIENT_ID}&permissions=8&scope=bot%20applications.commands
```

This grants the bot Administrator permissions (8) and includes bot and applications.commands scopes.

## Integration with Configuration Modals

The component is automatically shown in Discord action configuration modals when:
- `nodeInfo.providerId === 'discord'`
- `values.guildId` is selected

This provides immediate feedback to users about bot availability before they attempt to save or test the configuration. 