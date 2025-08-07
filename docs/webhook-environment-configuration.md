# Webhook Environment Configuration

This document explains how to configure webhook URLs for different environments (development, staging, production) in ChainReact.

## Overview

The webhook system automatically adjusts URLs based on your environment, allowing you to:
- **Development**: Test webhooks locally with localhost or ngrok
- **Production**: Use production URLs automatically
- **Staging**: Use custom URLs for testing environments

## Environment Variable Priority

The system uses the following priority order for determining webhook base URLs:

1. **`NEXT_PUBLIC_WEBHOOK_BASE_URL`** (highest priority)
   - Explicit webhook base URL override
   - Use for ngrok testing or custom webhook endpoints

2. **`NEXT_PUBLIC_BASE_URL`**
   - General base URL override
   - Affects all URLs, not just webhooks

3. **`NEXT_PUBLIC_APP_URL`**
   - Default app URL
   - Set in Vercel environment variables for production

4. **Environment Detection**
   - Automatically detects localhost, ngrok, or production domains
   - Falls back to production URL if no environment variables are set

5. **Production Fallback**
   - Defaults to `https://chainreact.app` if no other configuration is found

## Setup Instructions

### 1. Local Development

For basic local development, no additional configuration is needed:

```bash
# Start development server
npm run dev

# Webhook URLs will automatically use:
# http://localhost:3000/api/workflow/{provider}
```

### 2. ngrok Testing

For testing webhooks with external services:

```bash
# Install ngrok
npm install -g ngrok

# Start ngrok tunnel
ngrok http 3000

# Copy the ngrok URL (e.g., https://abc123.ngrok.io)

# Add to .env.local
NEXT_PUBLIC_WEBHOOK_BASE_URL=https://abc123.ngrok.io

# Restart development server
npm run dev
```

### 3. Production Configuration

In your Vercel environment variables:

```env
NEXT_PUBLIC_APP_URL=https://chainreact.app
```

Webhook URLs will automatically use:
```
https://chainreact.app/api/workflow/{provider}
```

### 4. Custom Staging Environment

For custom staging environments:

```env
NEXT_PUBLIC_WEBHOOK_BASE_URL=https://staging.chainreact.app
```

## Webhook URL Format

All webhook URLs follow this format:
```
{baseUrl}/api/workflow/{provider}
```

### Available Providers

| Provider | URL Pattern | Description |
|----------|-------------|-------------|
| Gmail | `/api/workflow/gmail` | Gmail webhook triggers |
| Slack | `/api/workflow/slack` | Slack webhook triggers |
| Discord | `/api/workflow/discord` | Discord webhook triggers |
| GitHub | `/api/workflow/github` | GitHub webhook triggers |
| Notion | `/api/workflow/notion` | Notion webhook triggers |
| HubSpot | `/api/workflow/hubspot` | HubSpot webhook triggers |
| Google Calendar | `/api/workflow/google-calendar` | Google Calendar triggers |
| Google Drive | `/api/workflow/google-drive` | Google Drive triggers |
| Google Sheets | `/api/workflow/google-sheets` | Google Sheets triggers |
| Microsoft Teams | `/api/workflow/teams` | Microsoft Teams triggers |
| Twitter | `/api/workflow/twitter` | Twitter webhook triggers |
| Facebook | `/api/workflow/facebook` | Facebook webhook triggers |
| Instagram | `/api/workflow/instagram` | Instagram webhook triggers |
| LinkedIn | `/api/workflow/linkedin` | LinkedIn webhook triggers |
| TikTok | `/api/workflow/tiktok` | TikTok webhook triggers |
| Trello | `/api/workflow/trello` | Trello webhook triggers |
| Airtable | `/api/workflow/airtable` | Airtable webhook triggers |

## Testing Webhooks

### 1. Using the Webhook Configuration Panel

Navigate to `/webhooks` in your application and use the Configuration tab to:
- View environment-specific webhook URLs
- Copy URLs to clipboard
- See current environment status
- Get setup instructions

### 2. Using Postman

1. Create a new POST request
2. Set the URL to your webhook endpoint
3. Add appropriate headers (Content-Type: application/json)
4. Send test payloads

### 3. Using webhook.site

1. Visit [webhook.site](https://webhook.site)
2. Copy the provided URL
3. Use it as a webhook endpoint for testing
4. Forward requests to your local webhook URL

### 4. Using ngrok Inspector

When using ngrok, visit `http://localhost:4040` to:
- Inspect incoming webhook requests
- Replay requests
- View request/response details

## Environment Detection

The system automatically detects your environment:

### Development Detection
- `localhost` or `127.0.0.1` hostnames
- `NODE_ENV=development`
- ngrok URLs (contains `ngrok.io` or `ngrok-free.app`)

### Production Detection
- `chainreact.app` domain
- Vercel preview domains (contains `vercel.app`)
- `NODE_ENV=production`

## Troubleshooting

### Webhook URLs Not Updating

1. **Check environment variables**:
   ```bash
   node scripts/setup-webhook-testing.js
   ```

2. **Restart development server** after changing environment variables

3. **Clear browser cache** if testing in the browser

### ngrok Not Working

1. **Check ngrok installation**:
   ```bash
   ngrok version
   ```

2. **Verify ngrok is running**:
   ```bash
   ngrok http 3000
   ```

3. **Check ngrok inspector** at `http://localhost:4040`

### Production Webhooks Not Receiving

1. **Verify Vercel environment variables**:
   - `NEXT_PUBLIC_APP_URL` should be set to `https://chainreact.app`

2. **Check webhook registration**:
   - Ensure webhooks are properly registered in external services
   - Verify webhook URLs are correct

3. **Monitor webhook logs**:
   - Check application logs for webhook processing
   - Verify webhook endpoints are responding

## Best Practices

### 1. Environment Separation

- **Never use production URLs in development**
- **Use environment variables for configuration**
- **Test webhooks thoroughly before production**

### 2. Security

- **Use HTTPS for all production webhooks**
- **Validate webhook signatures when possible**
- **Monitor webhook logs for suspicious activity**

### 3. Testing

- **Test webhooks in development first**
- **Use ngrok for external service testing**
- **Verify webhook payloads match expected format**

### 4. Monitoring

- **Monitor webhook success/failure rates**
- **Set up alerts for webhook failures**
- **Log webhook processing for debugging**

## Scripts

### Setup Script

Run the setup script to check your configuration:

```bash
node scripts/setup-webhook-testing.js
```

### Show Webhook URLs

View current webhook URLs:

```bash
node scripts/show-simple-webhook-urls.js
```

### Test Production URLs

Test URL generation for different environments:

```bash
node scripts/test-production-urls.js
```

## Examples

### Development with localhost
```env
# .env.local
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Webhook URLs:
```
http://localhost:3000/api/workflow/gmail
http://localhost:3000/api/workflow/slack
```

### Development with ngrok
```env
# .env.local
NEXT_PUBLIC_WEBHOOK_BASE_URL=https://abc123.ngrok.io
```

Webhook URLs:
```
https://abc123.ngrok.io/api/workflow/gmail
https://abc123.ngrok.io/api/workflow/slack
```

### Production
```env
# Vercel environment variables
NEXT_PUBLIC_APP_URL=https://chainreact.app
```

Webhook URLs:
```
https://chainreact.app/api/workflow/gmail
https://chainreact.app/api/workflow/slack
```

### Staging
```env
# Staging environment variables
NEXT_PUBLIC_WEBHOOK_BASE_URL=https://staging.chainreact.app
```

Webhook URLs:
```
https://staging.chainreact.app/api/workflow/gmail
https://staging.chainreact.app/api/workflow/slack
```
