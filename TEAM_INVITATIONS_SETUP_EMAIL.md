# Team Invitations - Email Integration Guide

This document covers the email notification feature for team invitations using Resend.

## What Changed

The team invitation system now sends **both** in-app notifications AND professional email notifications when a user is invited to join a team.

## Prerequisites

### 1. Resend API Key

You need a Resend account and API key:

1. Sign up at [resend.com](https://resend.com)
2. Get your API key from the dashboard
3. Add to your environment variables:

```bash
# .env.local (Development)
RESEND_API_KEY=re_xxxxxxxxxxxxx

# Vercel/Production
# Add via dashboard or CLI
```

### 2. Email Domain (Production Only)

For production:
- Verify your domain in Resend dashboard
- Update `from` address in [lib/services/resend.ts:315](lib/services/resend.ts#L315)
- Default: `ChainReact <noreply@chainreact.app>`

For development/testing:
- Resend allows test emails without domain verification
- Use your own email for testing

## Features

### Email Template

Professional React Email template includes:
- ChainReact branding with gradient header
- Inviter's name and email
- Team name and description
- Role badge (Member, Manager, Admin)
- Role description
- Direct "Accept Invitation" button
- Expiration date
- Reply-to set to inviter's email

### When Emails Are Sent

Emails are sent automatically when:
1. Team admin/manager/owner invites a user
2. Inviter has Pro+ plan
3. User search finds valid account

### Email Flow

```
User A invites User B
    ↓
System creates invitation + notification
    ↓
Email sent via Resend
    ↓
User B receives email with accept link
    ↓
User B clicks "Accept Invitation"
    ↓
Redirected to app, added to team
```

## Testing

### Development Testing

1. **Set API key**:
   ```bash
   echo "RESEND_API_KEY=re_xxxxx" >> .env.local
   ```

2. **Restart dev server**:
   ```bash
   npm run dev
   ```

3. **Send test invitation**:
   - Invite yourself or a test account
   - Check email inbox
   - Click "Accept Invitation" button

### Production Testing

1. Verify domain in Resend
2. Deploy with RESEND_API_KEY
3. Test with real user email
4. Monitor Resend dashboard for delivery

## Troubleshooting

### Email Not Received

1. **Check spam folder**
2. **Verify API key**:
   ```bash
   # Development
   cat .env.local | grep RESEND_API_KEY

   # Production
   # Check Vercel environment variables
   ```

3. **Check server logs**:
   ```bash
   # Look for "Team invitation email sent successfully"
   # or "Error sending invitation email"
   ```

4. **Test Resend connection**:
   ```typescript
   // Create test API route: app/api/test-email/route.ts
   import { sendTeamInvitationEmail } from '@/lib/services/resend'

   export async function GET() {
     const result = await sendTeamInvitationEmail(
       'your@email.com', // Your email
       'Test User',
       'Test Inviter',
       'inviter@test.com',
       'Test Team',
       'member',
       'https://chainreact.app',
       new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
     )

     return Response.json(result)
   }
   ```

   Visit `/api/test-email` and check your inbox.

### Common Errors

#### "Invalid API key"
- **Cause**: Wrong or missing RESEND_API_KEY
- **Fix**: Verify API key in environment variables
- **Check**: `process.env.RESEND_API_KEY` in server logs

#### "Domain not verified"
- **Cause**: Using custom domain in production without verification
- **Fix**: Verify domain in Resend dashboard
- **Or**: Use default `noreply@chainreact.app` (if verified)

#### "Rate limit exceeded"
- **Cause**: Too many emails sent (Resend free plan limit)
- **Fix**: Wait for rate limit reset or upgrade plan
- **Prevention**: Don't spam test invitations

#### "Email sent but not showing in inbox"
- **Cause**: Email in spam or delivery delay
- **Fix**: Check spam folder, wait 1-2 minutes
- **Check**: Resend dashboard for delivery status

### Email Fails But Invitation Still Works

This is **by design**. If the email fails:
- Invitation is still created
- In-app notification is still sent
- User can accept via app
- Error is logged but request succeeds

This ensures the core functionality works even if email service is down.

## Customization

### Change Email Template

Edit [emails/team-invitation.tsx](emails/team-invitation.tsx):

```typescript
// Customize colors
const button = {
  backgroundColor: '#7c3aed', // Change button color
  // ...
}

// Customize text
<Text>Join {teamName} to start building workflows together.</Text>
```

### Change Email Subject

Edit [lib/services/resend.ts:317](lib/services/resend.ts#L317):

```typescript
subject: `${inviterName} invited you to join ${teamName} on ChainReact`,
```

### Change From Address

Edit [lib/services/resend.ts:315](lib/services/resend.ts#L315):

```typescript
from: 'ChainReact <noreply@chainreact.app>',
// Or use your verified domain:
from: 'ChainReact <invites@yourdomain.com>',
```

### Add Reply-To

Already configured! Emails have `replyTo` set to inviter's email.

## Monitoring

### Resend Dashboard

Monitor email delivery in [Resend Dashboard](https://resend.com/emails):
- See all sent emails
- Delivery status
- Open/click rates (if enabled)
- Bounce/spam reports

### Server Logs

Logs include:
```
Team invitation email sent successfully: <email-id>
```

Or on error:
```
Error sending invitation email: <error-message>
```

## Cost

Resend pricing (as of 2024):
- **Free**: 100 emails/day
- **Pro**: $20/month - 10,000 emails/month
- **Enterprise**: Custom pricing

For most apps, free tier is sufficient during development.

## Security

- API key stored in environment variables (never in code)
- No sensitive data logged
- Reply-to allows invitee to contact inviter directly
- Emails include expiration date
- Invitation links include UUID (not guessable)

## Future Enhancements

Potential improvements:
- [ ] Email templates for other notifications
- [ ] Email preferences (opt-out)
- [ ] Email delivery tracking
- [ ] Reminder emails for pending invitations
- [ ] Bulk invitation emails
- [ ] Custom email templates per team

## Related Files

**Email Template**:
- [emails/team-invitation.tsx](emails/team-invitation.tsx) - React Email template

**Email Service**:
- [lib/services/resend.ts](lib/services/resend.ts) - Resend client + send functions

**API Integration**:
- [app/api/teams/[id]/members/route.ts](app/api/teams/[id]/members/route.ts) - Invitation API with email

**Documentation**:
- [TEAM_INVITATIONS_SETUP.md](TEAM_INVITATIONS_SETUP.md) - Main setup guide
