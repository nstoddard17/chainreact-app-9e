# OAuth Integration Localhost Support Guide

## Overview

This document lists which OAuth integrations support localhost redirect URIs for local development and which require HTTPS/public URLs.

## ✅ Integrations That Support Localhost

These integrations allow `http://localhost:3000` redirect URIs and work in local development:

### Fully Supported
- **Slack** - Supports localhost redirect URIs
- **Discord** - Fully supports localhost development
- **GitHub** - Native support for localhost OAuth
- **Google Services** (Gmail, Drive, Sheets, Docs, Calendar) - All Google services support localhost
- **Notion** - Supports localhost for development
- **Trello** - Allows localhost redirect URIs
- **Dropbox** - Supports localhost development
- **Box** - Allows localhost redirect URIs
- **HubSpot** - Supports localhost for development
- **Airtable** - Allows localhost redirect URIs
- **Mailchimp** - Supports localhost development
- **Shopify** - Supports localhost for draft apps
- **Microsoft Teams** - Supports localhost redirect URIs
- **OneDrive** - Supports localhost redirect URIs
- **Microsoft Outlook** - Supports localhost redirect URIs
- **Microsoft OneNote** - Supports localhost redirect URIs
- **GitLab** - Supports localhost development
- **Docker Hub** - Allows localhost redirect URIs
- **Kit (ConvertKit)** - Supports localhost development
- **Blackbaud** - Allows localhost redirect URIs
- **Gumroad** - Supports localhost development

## ❌ Integrations That DON'T Support Localhost

These integrations require HTTPS and don't allow localhost URLs. You'll need to use ngrok or deploy to a staging environment:

### Requires HTTPS/Public URL
- **Facebook** - Requires HTTPS for all redirect URIs (no localhost)
- **Instagram** - Requires HTTPS and verified domains
- **LinkedIn** - Production apps don't allow localhost
- **Twitter (X)** - Doesn't allow localhost URLs
- **TikTok** - Requires verified domains only
- **YouTube** - Requires verified domains for production apps
- **YouTube Studio** - Requires verified domains
- **Stripe** - Production mode requires HTTPS (test mode supports localhost)
- **PayPal** - Production doesn't allow localhost (sandbox mode does)

## Error Messages

When attempting to connect an unsupported integration from localhost, you'll see:

```
"[Provider] doesn't support localhost redirect URIs"

"The [Provider] OAuth provider requires HTTPS and doesn't allow localhost URLs. 
Please use ngrok or deploy to a staging environment to test [Provider] integration."
```

## Solutions for Unsupported Integrations

### Option 1: Use ngrok (Recommended)

1. Install ngrok:
   ```bash
   brew install ngrok
   ```

2. Start your dev server:
   ```bash
   npm run dev
   ```

3. Create ngrok tunnel:
   ```bash
   ngrok http 3000
   ```

4. Use the ngrok HTTPS URL (e.g., `https://abc123.ngrok.io`) to access your app

5. Add the ngrok redirect URI to the OAuth provider's settings

### Option 2: Deploy to Staging

Deploy your app to a staging environment with HTTPS:
- Vercel Preview Deployments
- Netlify Deploy Previews
- Heroku Review Apps
- Custom staging server with SSL

### Option 3: Use Test/Sandbox Mode

Some providers offer test modes that support localhost:
- **Stripe**: Use test mode API keys
- **PayPal**: Use sandbox environment

## Configuration Requirements

### For Supported Integrations

Add these redirect URIs to your OAuth app settings:
```
http://localhost:3000/api/integrations/[provider]/callback
https://[your-production-domain]/api/integrations/[provider]/callback
```

### For Unsupported Integrations

Only add production/ngrok URLs:
```
https://[your-production-domain]/api/integrations/[provider]/callback
https://[your-ngrok-url].ngrok.io/api/integrations/[provider]/callback
```

## Implementation Details

The application automatically:
1. Detects when running on localhost
2. Checks if the provider supports localhost
3. Shows an appropriate error message if unsupported
4. Uses `getBaseUrl()` to dynamically set redirect URIs

## Testing Strategy

### Local Development
1. Use supported integrations for most development
2. Use ngrok when testing unsupported integrations
3. Mock unsupported integrations if ngrok isn't available

### Staging/Production
1. All integrations work with proper HTTPS URLs
2. Ensure all redirect URIs are configured in OAuth apps
3. Test each integration after deployment

## Quick Reference Table

| Provider | Localhost Support | Notes |
|----------|------------------|--------|
| Slack | ✅ Yes | Full support |
| Discord | ✅ Yes | Full support |
| GitHub | ✅ Yes | Full support |
| Gmail/Google | ✅ Yes | All Google services |
| Notion | ✅ Yes | Full support |
| Facebook | ❌ No | Requires HTTPS |
| Instagram | ❌ No | Requires HTTPS |
| LinkedIn | ❌ No | Production apps only |
| Twitter | ❌ No | No localhost |
| TikTok | ❌ No | Verified domains only |
| Stripe | ⚠️ Partial | Test mode only |
| PayPal | ⚠️ Partial | Sandbox only |

## Troubleshooting

### "Provider doesn't support localhost" Error
- You're trying to connect an unsupported provider from localhost
- Solution: Use ngrok or test in staging/production

### "Invalid redirect URI" Error
- The redirect URI doesn't match what's configured in the OAuth app
- Solution: Add the exact URL to the provider's OAuth settings

### "HTTPS required" Error
- The provider requires secure connections
- Solution: Use ngrok to create an HTTPS tunnel

## Best Practices

1. **Development First**: Start with integrations that support localhost
2. **Use ngrok Early**: Set up ngrok for unsupported integrations early in development
3. **Document URLs**: Keep track of all redirect URIs configured for each provider
4. **Environment Variables**: Use different OAuth apps for dev/staging/production when possible
5. **Test Everything**: Test OAuth flows in all environments before shipping