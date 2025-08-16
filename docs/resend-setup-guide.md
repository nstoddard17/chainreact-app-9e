# Resend Setup Guide for ChainReact

This guide walks you through setting up Resend for professional email delivery in ChainReact.

## Why Resend?

- **Developer-First**: Built by developers for developers with clean APIs
- **High Deliverability**: Better inbox placement than generic SMTP
- **React Email**: Professional templates with JSX/TSX
- **Analytics**: Real-time email tracking and insights
- **Scalable**: Pay-as-you-grow pricing model
- **Reliable**: 99.9% uptime SLA

## 1. Resend Account Setup

### Create Resend Account
1. Go to [resend.com](https://resend.com)
2. Sign up with your GitHub account or email
3. Verify your email address

### API Key Generation
1. Navigate to **API Keys** in your Resend dashboard
2. Click **Create API Key**
3. Name it "ChainReact Production" or similar
4. Copy the API key (starts with `re_`)

### Domain Configuration
1. Go to **Domains** in Resend dashboard
2. Click **Add Domain**
3. Enter your domain (e.g., `chainreact.app`)
4. Add the DNS records provided by Resend:
   - SPF record
   - DKIM record
   - DMARC record (optional but recommended)
5. Wait for DNS propagation (usually 5-15 minutes)
6. Click **Verify Domain** once DNS is configured

## 2. Environment Variables

Add to your environment variables (Vercel, .env.local, etc.):

```bash
# Resend Configuration
RESEND_API_KEY=re_your_api_key_here
NEXT_PUBLIC_SITE_URL=https://chainreact.app

# Optional: Custom from addresses
RESEND_FROM_EMAIL=ChainReact <noreply@chainreact.app>
RESEND_SUPPORT_EMAIL=ChainReact Support <support@chainreact.app>
```

## 3. Supabase Email Configuration

### Update Supabase SMTP Settings
1. Go to your Supabase dashboard
2. Navigate to **Authentication** → **Settings** → **SMTP Settings**
3. Configure with Resend SMTP:
   - **SMTP Host**: `smtp.resend.com`
   - **SMTP Port**: `587` (TLS) or `465` (SSL)
   - **SMTP User**: `resend`
   - **SMTP Password**: Your Resend API key
   - **Sender Email**: `noreply@yourdomain.com`
   - **Sender Name**: `ChainReact`

### Email Templates
1. Go to **Authentication** → **Email Templates**
2. Update templates to redirect to your custom pages:
   - **Confirm signup**: `{{ .SiteURL }}/auth/confirm`
   - **Reset password**: `{{ .SiteURL }}/auth/reset-password`
   - **Magic link**: `{{ .SiteURL }}/auth/confirm`

## 4. Implementation Files Created

### Email Templates (`/emails/`)
- `welcome.tsx` - Professional welcome/confirmation email
- `password-reset.tsx` - Password reset email

### Services (`/lib/services/`)
- `resend.ts` - Core Resend integration with helper functions

### API Routes (`/app/api/`)
- `emails/send/route.ts` - Custom email sending endpoint
- `auth/send-confirmation/route.ts` - Custom confirmation emails
- `auth/send-reset/route.ts` - Custom password reset emails

### Workflow Actions (`/lib/workflows/actions/`)
- `resend/sendEmail.ts` - Workflow action for sending emails

### Pages (`/app/auth/`)
- `confirm/page.tsx` - Professional email confirmation page
- `auth-code-error/page.tsx` - Error handling page

## 5. Email Features Implemented

### Authentication Emails
- Welcome/confirmation emails with ChainReact branding
- Password reset emails
- Custom confirmation and error pages

### Workflow Email Actions
- Send Email (Resend) action in workflow builder
- Variable substitution support (`{{variable}}` syntax)
- HTML and text content support
- Multiple recipients support
- Custom from addresses

### Organization Features
- Invitation emails updated to use Resend
- Professional invitation templates

## 6. Usage Examples

### Basic Email in Workflow
```javascript
// Configuration in workflow
{
  to: "user@example.com",
  subject: "Welcome {{name}}!",
  html: "<h1>Hello {{name}}</h1><p>Welcome to ChainReact!</p>",
  text: "Hello {{name}}, welcome to ChainReact!"
}
```

### Programmatic Email Sending
```typescript
import { sendCustomEmail } from '@/lib/services/resend'

const result = await sendCustomEmail({
  to: ['user1@example.com', 'user2@example.com'],
  subject: 'Workflow Completed',
  html: '<p>Your workflow has completed successfully!</p>',
})
```

### Authentication Email
```typescript
import { sendWelcomeEmail } from '@/lib/services/resend'

await sendWelcomeEmail({
  to: 'newuser@example.com',
  subject: 'Welcome to ChainReact'
}, {
  username: 'John',
  confirmationUrl: 'https://chainreact.app/auth/confirm?token=...'
})
```

## 7. Monitoring and Analytics

### Email Tracking
- Email delivery status
- Open rates (when supported by Resend)
- Click-through rates
- Bounce and complaint handling

### Logging
All emails are logged to the `email_logs` table with:
- User who sent the email
- Recipients
- Subject line
- Email ID from Resend
- Timestamp
- Delivery status

## 8. Best Practices

### Email Content
- Always provide both HTML and text versions
- Use responsive email templates
- Keep subject lines under 50 characters
- Include clear unsubscribe options for marketing emails

### Deliverability
- Use verified sender domains
- Maintain good sender reputation
- Monitor bounce rates
- Implement proper SPF, DKIM, and DMARC records

### Security
- Never log email content containing sensitive data
- Use environment variables for API keys
- Implement rate limiting for email endpoints
- Validate all email addresses before sending

### Performance
- Use bulk sending for multiple recipients
- Implement email queuing for high volume
- Cache email templates
- Monitor API rate limits

## 9. Testing

### Development Testing
```bash
# Test email functionality
npm run dev

# Send test email via API
curl -X POST http://localhost:3000/api/emails/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "test@example.com",
    "subject": "Test Email",
    "html": "<p>This is a test email</p>"
  }'
```

### Email Preview
Use React Email's preview functionality:
```bash
npx @react-email/render preview emails/welcome.tsx
```

## 10. Troubleshooting

### Common Issues
- **DNS not propagated**: Wait 24 hours for full propagation
- **API key invalid**: Regenerate key in Resend dashboard
- **Domain not verified**: Check DNS records are correctly added
- **Emails in spam**: Review sender reputation and authentication

### Debug Mode
Enable detailed logging by setting:
```bash
RESEND_DEBUG=true
```

## 11. Migration from Supabase Default

1. **Backup**: Export existing email logs
2. **Test**: Verify Resend setup in development
3. **Update**: Change Supabase SMTP settings
4. **Monitor**: Watch delivery rates and user feedback
5. **Optimize**: Adjust templates based on performance

## 12. Cost Estimation

Resend pricing (as of 2024):
- **Free tier**: 3,000 emails/month
- **Pro**: $20/month for 50,000 emails
- **Business**: $85/month for 200,000 emails
- **Enterprise**: Custom pricing

For ChainReact's expected volume, the Pro plan should be sufficient initially.

## 13. Next Steps

1. **Set up monitoring**: Implement email analytics dashboard
2. **Template optimization**: A/B test email templates
3. **Automation**: Set up email sequences for user onboarding
4. **Compliance**: Implement GDPR-compliant unsubscribe flows