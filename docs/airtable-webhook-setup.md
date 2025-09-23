# Airtable Webhook Setup for Local Development

## Issue
Airtable webhooks require HTTPS URLs, but local development runs on HTTP (http://localhost:3000).

## Solutions

### Option 1: Use ngrok (Recommended for Testing)
1. Install ngrok: `brew install ngrok` (macOS) or download from https://ngrok.com
2. Start your dev server: `npm run dev`
3. In another terminal, start ngrok: `ngrok http 3000`
4. Copy the HTTPS URL (e.g., `https://abc123.ngrok-free.app`)
5. Add to your `.env.local`:
   ```
   NEXT_PUBLIC_WEBHOOK_HTTPS_URL=https://abc123.ngrok-free.app
   ```
6. Restart your dev server
7. Reconnect Airtable integration to register webhooks with the HTTPS URL

### Option 2: Use Production/Staging URL
If you have a staging environment with HTTPS:
1. Set `NEXT_PUBLIC_APP_URL` in `.env.local` to your staging URL
2. Ensure your staging environment can receive and process the webhooks

### Option 3: Skip Webhooks in Development
For development without webhooks, you can:
1. Test actions manually without triggers
2. Use the test execution feature to simulate webhook payloads

## Environment Variables

- `NEXT_PUBLIC_WEBHOOK_HTTPS_URL`: HTTPS URL for webhooks (e.g., from ngrok)
- `NEXT_PUBLIC_APP_URL`: Production/staging URL (fallback if no webhook URL set)

## Webhook URL Priority
1. `NEXT_PUBLIC_WEBHOOK_HTTPS_URL` (if set and Airtable provider)
2. `NEXT_PUBLIC_APP_URL` (if HTTPS and Airtable provider)
3. Production URL (`https://chainreact.app`) as last resort for Airtable
4. Normal `getWebhookBaseUrl()` for other providers

## Debugging
The webhook registration will log the URL being used:
```
📢 Webhook notification URL: https://...
```

If you see a warning about HTTPS requirements, set up one of the solutions above.