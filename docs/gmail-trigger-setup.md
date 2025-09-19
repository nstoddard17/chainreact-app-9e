# Gmail Trigger Setup Guide

## Current Issue
Gmail triggers are not working because the webhook registration is incomplete. The system only stores webhook configuration in the database but doesn't actually set up Gmail's push notifications.

## What's Been Fixed
1. Created `lib/webhooks/gmail-watch-setup.ts` with functions to:
   - Set up Gmail watch via `gmail.users.watch()` API
   - Stop Gmail watch when workflow is deactivated
   - Handle token refresh automatically

2. Updated `lib/webhooks/triggerWebhookManager.ts` to:
   - Call `setupGmailWatch()` when Gmail trigger is registered
   - Store watch metadata (historyId, expiration) in webhook config

## What Still Needs to Be Done

### 1. Set Up Google Cloud Pub/Sub
Gmail doesn't send webhooks directly to your server. Instead, it uses Google Cloud Pub/Sub as an intermediary:

1. **Create a Google Cloud Project** (if not already done)
2. **Enable Gmail API and Pub/Sub API** in the Google Cloud Console
3. **Create a Pub/Sub Topic** for Gmail notifications:
   ```bash
   gcloud pubsub topics create gmail-notifications
   ```
4. **Grant Gmail permission to publish to your topic**:
   ```bash
   gcloud pubsub topics add-iam-policy-binding gmail-notifications \
     --member="serviceAccount:gmail-api-push@system.gserviceaccount.com" \
     --role="roles/pubsub.publisher"
   ```
5. **Create a Pub/Sub subscription** that pushes to your webhook endpoint:
   ```bash
   gcloud pubsub subscriptions create gmail-push-subscription \
     --topic=gmail-notifications \
     --push-endpoint=https://your-domain.com/api/webhooks/gmail
   ```

### 2. Add Environment Variable
Add to your `.env.local`:
```
GMAIL_PUBSUB_TOPIC=projects/YOUR_PROJECT_ID/topics/gmail-notifications
```

### 3. Create Webhook Endpoint
Create `/app/api/webhooks/gmail/route.ts` to receive Pub/Sub notifications:
```typescript
export async function POST(request: Request) {
  // Parse Pub/Sub message
  const body = await request.json()
  const message = body.message

  if (!message) {
    return NextResponse.json({ error: 'Invalid message' }, { status: 400 })
  }

  // Decode the message data
  const decodedData = Buffer.from(message.data, 'base64').toString()
  const gmailNotification = JSON.parse(decodedData)

  // Process the Gmail notification
  // gmailNotification will contain: { emailAddress, historyId }

  // Fetch the actual changes using historyId
  // Trigger matching workflows

  return NextResponse.json({ success: true })
}
```

### 4. Implement Watch Renewal
Gmail watches expire after 7 days. You need to:
1. Create a cron job that runs daily
2. Check for watches expiring within 24 hours
3. Renew them by calling `setupGmailWatch()` again

### 5. Handle Workflow Activation
When a workflow with Gmail trigger is activated:
1. Check if Gmail integration is connected ✓
2. Call webhook registration API ✓
3. Set up Gmail watch (now implemented) ✓
4. Store watch metadata ✓

When workflow is deactivated:
1. Stop the Gmail watch using `stopGmailWatch()`
2. Clean up webhook config

## Testing
1. Set up Google Cloud Pub/Sub as described above
2. Add the environment variable
3. Create the webhook endpoint
4. Activate a workflow with Gmail trigger
5. Send a test email
6. Check logs to see if Pub/Sub notification is received

## Additional Notes
- Gmail API has rate limits, so batch operations when possible
- Watches need to be renewed before expiration
- Each user can only have one active watch per Gmail account
- The watch monitors all changes to the specified labels (default: INBOX)

## References
- [Gmail Push Notifications Guide](https://developers.google.com/gmail/api/guides/push)
- [Google Cloud Pub/Sub Documentation](https://cloud.google.com/pubsub/docs)
- [Gmail API Watch Method](https://developers.google.com/gmail/api/reference/rest/v1/users/watch)