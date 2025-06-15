# OAuth Redirect URIs Reference

All OAuth integrations use the consistent format: `https://chainreact.app/api/integrations/[provider]/callback`

## Complete List of Redirect URIs

### Social Media Platforms
- **Twitter**: `https://chainreact.app/api/integrations/twitter/callback`
- **Facebook**: `https://chainreact.app/api/integrations/facebook/callback`
- **Instagram**: `https://chainreact.app/api/integrations/instagram/callback`
- **LinkedIn**: `https://chainreact.app/api/integrations/linkedin/callback`
- **TikTok**: `https://chainreact.app/api/integrations/tiktok/callback`
- **Discord**: `https://chainreact.app/api/integrations/discord/callback`

### Google Services
- **Google**: `https://chainreact.app/api/integrations/google/callback`
- **Gmail**: `https://chainreact.app/api/integrations/gmail/callback`
- **Google Drive**: `https://chainreact.app/api/integrations/google-drive/callback`
- **Google Sheets**: `https://chainreact.app/api/integrations/google-sheets/callback`
- **Google Docs**: `https://chainreact.app/api/integrations/google-docs/callback`
- **Google Calendar**: `https://chainreact.app/api/integrations/google-calendar/callback`
- **YouTube**: `https://chainreact.app/api/integrations/youtube/callback`

### Development & Productivity
- **GitHub**: `https://chainreact.app/api/integrations/github/callback`
- **GitLab**: `https://chainreact.app/api/integrations/gitlab/callback`
- **Slack**: `https://chainreact.app/api/integrations/slack/callback`
- **Notion**: `https://chainreact.app/api/integrations/notion/callback`
- **Trello**: `https://chainreact.app/api/integrations/trello/callback`
- **Airtable**: `https://chainreact.app/api/integrations/airtable/callback`

### Cloud Storage
- **Dropbox**: `https://chainreact.app/api/integrations/dropbox/callback`
- **OneDrive**: `https://chainreact.app/api/integrations/onedrive/callback`

### Business & Marketing
- **HubSpot**: `https://chainreact.app/api/integrations/hubspot/callback`
- **Mailchimp**: `https://chainreact.app/api/integrations/mailchimp/callback`
- **Shopify**: `https://chainreact.app/api/integrations/shopify/callback`

### Payment & Finance
- **Stripe**: `https://chainreact.app/api/integrations/stripe/callback`
- **PayPal**: `https://chainreact.app/api/integrations/paypal/callback`

### Microsoft Services
- **Teams**: `https://chainreact.app/api/integrations/teams/callback`
- **OneDrive**: `https://chainreact.app/api/integrations/onedrive/callback`

### Other Services
- **Docker**: `https://chainreact.app/api/integrations/docker/callback`

## Configuration Instructions

When setting up OAuth applications in each provider's developer portal, use the exact redirect URI format shown above. This ensures consistency across all integrations and prevents OAuth callback errors.

### Important Notes

1. **HTTPS Required**: All redirect URIs use HTTPS for security
2. **Exact Match**: The redirect URI must match exactly what's configured in the provider's app settings
3. **Case Sensitive**: Provider names in the URL are lowercase and match the internal provider identifiers
4. **No Trailing Slash**: Redirect URIs do not include a trailing slash

### Testing

For development and testing, you can use the debug endpoints:
- `/api/integrations/[provider]/debug` - Debug OAuth configuration
- `/api/integrations/[provider]/test-config` - Test provider configuration
