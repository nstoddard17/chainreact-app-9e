# Azure Portal Setup Guide for Microsoft Graph Webhooks

This guide will walk you through setting up your Azure App Registration to enable Microsoft Graph webhooks for Outlook, Calendar, OneDrive, and other Microsoft services.

## Prerequisites

- Access to Azure Portal (https://portal.azure.com)
- Your app registration ID: `48cb932a-3213-415b-919f-7ff2235c25b7`
- Your client secret: `[YOUR_CLIENT_SECRET]` (check your environment variables)

## Step 1: Access Your App Registration

1. Go to [Azure Portal](https://portal.azure.com)
2. Sign in with your Microsoft account
3. Navigate to **Azure Active Directory** > **App registrations**
4. Find your app: `48cb932a-3213-415b-919f-7ff2235c25b7`
5. Click on the app name to open its configuration

## Step 2: Configure Authentication

1. In the left sidebar, click **Authentication**
2. Under **Platform configurations**, click **Add a platform**
3. Select **Web**
4. Add the following redirect URIs:
   - `https://chainreact.app/api/auth/microsoft/callback`
   - `http://localhost:3000/api/auth/microsoft/callback` (for development)
5. Under **Implicit grant and hybrid flows**, check:
   - ✅ **Access tokens**
   - ✅ **ID tokens**
6. Click **Configure**
7. Click **Save**

## Step 3: Configure API Permissions

1. In the left sidebar, click **API permissions**
2. Click **Add a permission**
3. Select **Microsoft Graph**
4. Choose **Delegated permissions**
5. Add the following permissions:

### Mail Permissions
- `Mail.Read` - Read user mail
- `Mail.ReadWrite` - Read and write user mail
- `Mail.Send` - Send mail as user

### Calendar Permissions
- `Calendars.Read` - Read user calendars
- `Calendars.ReadWrite` - Read and write user calendars
- `Calendars.Read.Shared` - Read calendars shared with user

### Files Permissions
- `Files.Read` - Read user files
- `Files.ReadWrite` - Read and write user files
- `Files.Read.All` - Read all files user can access
- `Files.ReadWrite.All` - Read and write all files user can access

### User Permissions
- `User.Read` - Sign in and read user profile
- `User.ReadWrite` - Read and write user profile

### Subscription Permissions
- `Subscription.Read.All` - Read all subscriptions
- `Subscription.ReadWrite.All` - Read and write all subscriptions

6. Click **Add permissions**
7. Click **Grant admin consent** (requires admin privileges)
8. Click **Yes** to confirm

## Step 4: Configure Certificates & Secrets

1. In the left sidebar, click **Certificates & secrets**
2. Under **Client secrets**, verify your secret exists:
   - **Name**: (your secret name)
   - **Value**: `[YOUR_CLIENT_SECRET]` (check your environment variables)
   - **Expires**: (check expiration date)

If the secret doesn't exist or has expired:
1. Click **New client secret**
2. Add a description (e.g., "Webhook Integration")
3. Choose expiration (recommend 24 months)
4. Click **Add**
5. **Copy the value immediately** (you won't see it again)
6. Update your environment variables with the new secret

## Step 5: Configure Expose an API

1. In the left sidebar, click **Expose an API**
2. Click **Set** next to **Application ID URI**
3. Enter: `api://chainreact.app`
4. Click **Save**
5. Under **Scopes**, click **Add a scope**
6. Configure the scope:
   - **Scope name**: `access_as_user`
   - **Who can consent**: **Admins and users**
   - **Admin consent display name**: `Access ChainReact as user`
   - **Admin consent description**: `Allow ChainReact to access Microsoft Graph on behalf of the signed-in user`
   - **User consent display name**: `Access ChainReact as you`
   - **User consent description**: `Allow ChainReact to access Microsoft Graph on your behalf`
   - **State**: **Enabled**
7. Click **Add scope**

## Step 6: Configure Manifest (Optional but Recommended)

1. In the left sidebar, click **Manifest**
2. Find the `accessTokenAcceptedVersion` property
3. Ensure it's set to `2` (for v2 tokens)
4. If not, change it to `2`
5. Click **Save**

## Step 7: Configure Branding & Properties

1. In the left sidebar, click **Branding & properties**
2. Update the following:
   - **Display name**: `ChainReact Microsoft Integration`
   - **Home page URL**: `https://chainreact.app`
   - **Terms of service URL**: `https://chainreact.app/terms`
   - **Privacy statement URL**: `https://chainreact.app/privacy`
3. Click **Save**

## Step 8: Test the Configuration

After completing the setup, test your configuration:

### Test Webhook Endpoint
```bash
curl -X GET https://chainreact.app/api/webhooks/microsoft
```

Expected response:
```json
{
  "status": "healthy",
  "provider": "microsoft",
  "timestamp": "2024-01-XX..."
}
```

### Test Subscription Creation (requires authentication)
```bash
curl -X POST https://chainreact.app/api/microsoft-graph/subscriptions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "resource": "me/mailFolders('\''Inbox'\'')/messages",
    "changeType": "created,updated",
    "expirationDateTime": "2024-01-15T10:00:00Z"
  }'
```

## Step 9: Create Your First Subscription

Once everything is configured, you can create subscriptions for:

### Outlook Email
- **Resource**: `me/mailFolders('Inbox')/messages`
- **Change Type**: `created,updated`
- **Description**: Triggers when new emails arrive or existing emails are modified

### Calendar Events
- **Resource**: `me/events`
- **Change Type**: `created,updated,deleted`
- **Description**: Triggers when calendar events are created, updated, or deleted

### OneDrive Files
- **Resource**: `me/drive/root/children`
- **Change Type**: `created,updated,deleted`
- **Description**: Triggers when files in OneDrive are created, updated, or deleted

## Troubleshooting

### Common Issues

1. **"Insufficient privileges" error**
   - Ensure admin consent has been granted for all permissions
   - Contact your Azure admin if you don't have admin privileges

2. **"Invalid redirect URI" error**
   - Verify the redirect URI is exactly: `https://chainreact.app/api/auth/microsoft/callback`
   - Check for typos or extra spaces

3. **"Invalid client secret" error**
   - Verify the client secret in your environment variables
   - Generate a new secret if the current one has expired

4. **"Subscription creation failed" error**
   - Ensure all required permissions are granted
   - Check that the webhook endpoint is accessible
   - Verify the user has consented to the required permissions

### Verification Checklist

- [ ] App registration exists and is accessible
- [ ] Authentication is configured with correct redirect URIs
- [ ] All required API permissions are granted
- [ ] Admin consent is granted for all permissions
- [ ] Client secret is valid and not expired
- [ ] Application ID URI is configured
- [ ] Webhook endpoint is accessible
- [ ] Subscription management endpoints are deployed

## Security Best Practices

1. **Rotate client secrets regularly** (every 12-24 months)
2. **Use least privilege principle** - only grant necessary permissions
3. **Monitor app usage** in Azure portal
4. **Enable audit logs** for security monitoring
5. **Use conditional access policies** if available
6. **Regularly review and remove unused permissions**

## Support

If you encounter issues:
1. Check the Azure portal for error messages
2. Review the Microsoft Graph documentation
3. Check your application logs for detailed error information
4. Contact Microsoft support if needed

---

**Note**: This setup enables Microsoft Graph webhooks for your ChainReact application. Once configured, users can authenticate with Microsoft and create subscriptions to receive real-time notifications for Outlook, Calendar, OneDrive, and other Microsoft services.
