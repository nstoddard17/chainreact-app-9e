# Discord Invite Role Assignment Setup

This feature allows your Discord bot to automatically assign roles to users when they join using specific invite links.

## Features

1. **Automatic Role Assignment**: Assign roles based on which invite link was used
2. **User Joined Trigger**: New workflow trigger that fires when users join your Discord server
3. **Invite Tracking**: Track which invite code was used when a member joins
4. **Assign Role Action**: New workflow action to assign roles to Discord users

## Setup Instructions

### 1. Environment Variables

Add these to your `.env.local` file:

```env
# For internal use - auto-assign role based on specific invite
DISCORD_AUTO_ROLE_INVITE=your_invite_code_here  # The invite code (without discord.gg/)
DISCORD_AUTO_ROLE_ID=role_id_here               # The Discord role ID to assign
DISCORD_GUILD_ID=server_id_here                 # Your Discord server ID
```

### 2. Database Setup

Run the migration to create the invite-role mappings table:

```bash
npx supabase migration up
```

### 3. Discord Bot Permissions

The bot uses permission integer: `4002221251362807`

This includes the specific permissions you selected (WITHOUT Administrator):
- Managing server, roles, and channels
- Tracking invites and members
- Sending messages and managing content
- Webhooks and integrations
- Moderation capabilities (kick, ban, moderate members)
- Events and insights access

### 4. Invite Your Bot

If you haven't already, invite your bot to your Discord server with the proper permissions:

1. Go to Discord Developer Portal
2. Select your application
3. Go to OAuth2 > URL Generator
4. Select scopes: `bot`, `applications.commands`
5. For permissions, either:
   - Use the permission calculator and select all needed permissions
   - Or use this direct URL format:
   ```
   https://discord.com/api/oauth2/authorize?client_id=YOUR_BOT_CLIENT_ID&permissions=4002221251362807&scope=bot%20applications.commands
   ```
6. Replace `YOUR_BOT_CLIENT_ID` with your actual bot's client ID
7. Use the generated URL to invite the bot

## Using in Workflows

### User Joined Trigger

Create a workflow with the "User Joined Server" trigger:

1. Add Discord "User Joined Server" trigger
2. Select your Discord server
3. Optionally filter by specific invite code
4. Access invite data in subsequent actions:
   - `memberId` - The user who joined
   - `inviteCode` - The invite code used
   - `inviteUrl` - Full invite URL
   - `inviterTag` - Who created the invite

### Assign Role Action

Use the "Assign Role" action to give roles to users:

1. Add Discord "Assign Role" action
2. Select the server
3. Select or use a variable for the user ID
4. Select the role to assign

## Example Workflow

**Welcome Flow with Role Assignment:**

1. **Trigger**: User Joined Server
   - Server: Your Discord Server

2. **Action**: Assign Role
   - Server: {{trigger.guildId}}
   - User: {{trigger.memberId}}
   - Role: "Member" role

3. **Action**: Send Channel Message
   - Channel: #welcome
   - Message: "Welcome {{trigger.memberTag}} to the server!"

## API Endpoints

### Get Discord Roles
```
GET /api/integrations/discord/roles?guildId={guildId}&userId={userId}
```

### Get Discord Invites
```
GET /api/integrations/discord/data?type=discord_invites&guildId={guildId}&userId={userId}
```

## Troubleshooting

### Bot doesn't track invites
- Ensure bot has "Manage Guild" permission
- Check that bot was in the server before invites were created
- Try restarting the bot to refresh invite cache

### Roles not being assigned
- Verify bot has "Manage Roles" permission
- Ensure bot's role is higher than the role being assigned
- Check that the role ID is correct

### Member join not triggering
- Confirm workflow is active
- Check that guild ID matches in trigger configuration
- Verify bot is online and connected

## Security Notes

- The bot only assigns roles you've configured
- Invite tracking requires bot to cache invite data
- Role assignments are logged for audit purposes
- Database stores invite-role mappings securely with RLS