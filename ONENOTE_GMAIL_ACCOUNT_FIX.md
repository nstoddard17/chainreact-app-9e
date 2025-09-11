# OneNote with Gmail Account - The Real Issue & Solution

## The Problem
You're using a **Gmail account** (`chainreactapp@gmail.com`) as a Microsoft account. This is a "Microsoft Consumer Account" which has different requirements than regular Microsoft accounts.

## Why It's Failing
1. **Azure AD apps don't fully support consumer accounts with Gmail addresses**
2. **OneNote API requires special handling for consumer accounts**
3. **The token is valid for basic Graph API (User, Drive) but NOT for OneNote**

## The Solution

You have three options:

### Option 1: Use a Native Microsoft Account (Easiest)
1. Create a new Microsoft account using an @outlook.com email
2. Sign into OneNote with this account
3. Create a test notebook
4. Use this account for your OneNote integration instead

### Option 2: Register App for Consumer Accounts (Recommended)
Microsoft consumer accounts need apps registered differently:

1. **Go to the Microsoft Application Registration Portal**
   - Visit: https://apps.dev.microsoft.com
   - Sign in with a Microsoft account (not your Gmail)

2. **Register a New Application**
   - Click "Add an app"
   - Give it a name: "ChainReact OneNote Consumer"
   - Note the Application ID (this is your new Client ID)

3. **Generate a New Password**
   - Under "Application Secrets", click "Generate New Password"
   - Save this (it's your new Client Secret)

4. **Add Platform**
   - Click "Add Platform" → "Web"
   - Add redirect URL: `https://chainreact.app/api/integrations/onenote/callback`
   - Or for local: `http://localhost:3000/api/integrations/onenote/callback`

5. **Add Microsoft Graph Permissions**
   - Under "Microsoft Graph Permissions"
   - Add Delegated Permissions:
     - User.Read
     - Notes.Create
     - Notes.Read
     - Notes.ReadWrite
     - Notes.ReadWrite.All
     - Files.Read
     - offline_access

6. **Update Your .env.local**
   ```
   ONENOTE_CLIENT_ID=your-new-consumer-app-id
   ONENOTE_CLIENT_SECRET=your-new-consumer-app-secret
   ```

7. **Reconnect OneNote**
   - Disconnect current integration
   - Connect again with the new app credentials

### Option 3: Multi-Tenant Azure AD App (Advanced)
Configure your existing Azure AD app for multi-tenant with consumer support:

1. **In Azure Portal**
   - Go to your app registration
   - Under "Authentication"
   - Set "Supported account types" to:
     "Accounts in any organizational directory and personal Microsoft accounts"

2. **Add Consumer Redirect URI**
   - Add a new redirect URI with type "Web"
   - Use the exact callback URL

3. **Update Manifest**
   - Go to "Manifest" in Azure Portal
   - Set `"signInAudience": "AzureADandPersonalMicrosoftAccount"`

4. **Wait and Reconnect**
   - Wait 10-15 minutes for changes to propagate
   - Clear all cookies for login.microsoftonline.com
   - Reconnect OneNote

## Quick Test

After making changes, test with this command:
```bash
node test-onenote-fresh.mjs
```

You should see:
- ✅ User Profile works
- ✅ OneDrive works
- ✅ OneNote Service works
- ✅ OneNote Notebooks works

## Why This Happens

Microsoft has two separate identity systems:
1. **Azure AD** - For work/school accounts
2. **Microsoft Account** - For consumer accounts

When you use a Gmail address as a Microsoft account, it's treated as a consumer account. Consumer accounts:
- Need apps registered at apps.dev.microsoft.com (not Azure Portal)
- Use different OAuth endpoints internally
- Have different permission models for some APIs like OneNote

## The Simplest Fix

If you just want to test quickly:
1. Create a free @outlook.com email
2. Sign into OneNote with it
3. Use that account for testing

This avoids all the consumer account complications.