# Error Notifications Setup Guide

This guide covers setting up error notifications for workflows using Email, SMS, Slack, and Discord.

## Overview

When a workflow fails, ChainReact can automatically send notifications through multiple channels based on user preferences configured in the Settings tab.

## Architecture

```
Workflow Error
    ↓
errorHandler.ts (orchestrator)
    ↓
┌─────────┬──────────┬──────────┬──────────┐
│  Email  │   SMS    │  Slack   │ Discord  │
└─────────┴──────────┴──────────┴──────────┘
```

## Environment Variables

### Required for Email (Resend)

Already configured - Resend is installed in your `package.json`.

```bash
RESEND_API_KEY=re_xxxxxxxxxxxxx
RESEND_FROM_EMAIL=notifications@chainreact.app  # Optional, defaults to this
```

**Get API Key:**
1. Go to [resend.com](https://resend.com)
2. Sign up/login
3. Create API key
4. Add to `.env.local`

---

### Required for SMS (Twilio)

**Install Twilio:**
```bash
npm install twilio
```

**Environment Variables:**
```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+1234567890
```

**Get Credentials:**
1. Go to [twilio.com/console](https://www.twilio.com/console)
2. Sign up/login
3. Get your Account SID and Auth Token from the dashboard
4. Buy a phone number or use trial number
5. Add to `.env.local`

**Cost:**
- ~$1/month for phone number
- ~$0.0075 per SMS

---

### Required for Slack

**Already configured** - Uses existing Slack OAuth integration.

No additional environment variables needed. Users connect their Slack workspace via OAuth in the app.

---

### Required for Discord

**Environment Variables:**
```bash
DISCORD_BOT_TOKEN=MTxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Get Bot Token:**
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create New Application
3. Go to "Bot" section
4. Click "Reset Token" and copy
5. Enable these bot permissions:
   - Send Messages
   - Read Message History
   - View Channels
6. Add to `.env.local`

**Invite Bot to Server:**
```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=3072&scope=bot
```

---

## Complete .env.local Example

```bash
# Email (Resend) - Already configured
RESEND_API_KEY=re_xxxxxxxxxxxxx
RESEND_FROM_EMAIL=notifications@chainreact.app

# SMS (Twilio) - New
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+15551234567

# Discord Bot - New
DISCORD_BOT_TOKEN=MTxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Slack - Already configured via OAuth
# No additional env vars needed
```

---

## Testing Notifications

### 1. Set up a test workflow with error notifications enabled

1. Go to workflow Settings tab
2. Enable "Error Notifications"
3. Configure channels:
   - **Email**: Enter your email
   - **SMS**: Enter phone in format `+1234567890`
   - **Slack**: Select a channel (must be connected first)
   - **Discord**: Select a channel (must be connected first)

### 2. Trigger a workflow error

Create a workflow that will fail:
- Add an action that requires a missing field
- Or use an invalid API endpoint
- Run the workflow

### 3. Check notifications

You should receive notifications via all enabled channels with:
- Workflow name
- Error message
- Timestamp
- Workflow ID
- Link to view workflow (email/Slack/Discord)

---

## Notification Format Examples

### Email
```
Subject: Workflow Failed: Send Welcome Email

Workflow "Send Welcome Email" encountered an error

Error Details:
Failed to send email: Invalid API key

Workflow ID: 123e4567-e89b-12d3-a456-426614174000
Time: 1/15/2025, 3:45:23 PM

View this workflow: https://chainreact.app/workflows/builder/123e4567...
```

### SMS
```
ChainReact Alert: Workflow "Send Welcome Email" failed. Error: Failed to send email: Invalid API key
```

### Slack
Rich formatted message with:
- Header: "⚠️ Workflow Error Alert"
- Workflow name and time
- Error in code block
- "View Workflow" button

### Discord
Embed with:
- Title: "⚠️ Workflow Error Alert"
- Color: Red
- Fields for workflow, time, error
- Timestamp

---

## Implementation Details

### Files Created

```
lib/notifications/
├── email.ts         - Resend email service
├── sms.ts           - Twilio SMS service
├── slack.ts         - Slack API integration
├── discord.ts       - Discord bot integration
└── errorHandler.ts  - Main orchestrator
```

### How It Works

1. **Workflow fails** in execution engine
2. **Catch block** in `/app/api/workflows/execute/route.ts`
3. **Fetches workflow** with settings
4. **Calls `sendWorkflowErrorNotifications()`**
5. **Orchestrator** checks which channels are enabled
6. **Sends notifications** in parallel (non-blocking)
7. **Logs results** for each channel

### Error Handling

- Notification failures don't block workflow error response
- Each channel handles errors independently
- All errors logged for debugging
- Graceful degradation if credentials missing

---

## Troubleshooting

### Email not sending
- Check `RESEND_API_KEY` is valid
- Verify domain is verified in Resend dashboard
- Check logs for API errors

### SMS not sending
- Verify `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`
- Check phone number format: `+1234567890`
- Ensure Twilio account has credits
- Trial accounts can only send to verified numbers

### Slack not sending
- User must have Slack connected via OAuth
- Channel ID must be valid
- Bot must be invited to the channel
- Check Slack token hasn't expired

### Discord not sending
- Verify `DISCORD_BOT_TOKEN` is correct
- Ensure bot is in the server
- Bot must have "Send Messages" permission in channel
- Channel ID must be valid

---

## Cost Estimates

### Email (Resend)
- Free tier: 3,000 emails/month
- Paid: $20/month for 50,000 emails

### SMS (Twilio)
- Phone number: ~$1/month
- SMS: ~$0.0075 per message
- Example: 100 errors/month = ~$1.75/month

### Slack
- Free (uses OAuth)

### Discord
- Free (uses bot)

**Total estimated cost for moderate usage: ~$3-5/month**

---

## Security Notes

- **Never log tokens** in error notifications
- **SMS messages** are truncated to 160 chars (with error preview)
- **Email HTML** is sanitized
- **Slack/Discord** use user's own OAuth tokens
- **Phone numbers** validated to E.164 format
- All credentials stored in environment variables, never in code

---

## Future Enhancements

When you add more notification channels (WhatsApp, Teams, PagerDuty, etc.), update the Settings UI to use a searchable dropdown instead of toggle switches.

Recommended UI change at 6+ channels:
- Switch from toggles to multi-select Combobox
- Group by category (Messaging, Team Chat, Incident Management)
- Add search functionality

See `components/workflows/builder/SettingsTab.tsx` for current implementation.
