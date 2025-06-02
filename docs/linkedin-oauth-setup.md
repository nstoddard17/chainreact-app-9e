# LinkedIn OAuth Setup Guide

## Common Issues and Solutions

### 1. "LinkedIn Network Will Be Back Soon" Error
This error typically occurs when:
- The OAuth URL is malformed
- LinkedIn detects suspicious activity
- The redirect URI doesn't match exactly
- The client ID is incorrect

### 2. Required LinkedIn App Settings

In your LinkedIn Developer Console:

**App Settings:**
- App name: ChainReact
- Company: Your company
- Privacy policy URL: https://chainreact.app/privacy
- App logo: Upload your logo

**Auth Settings:**
- Authorized redirect URLs: `https://chainreact.app/api/integrations/linkedin/callback`
- Client ID: Copy to NEXT_PUBLIC_LINKEDIN_CLIENT_ID
- Client Secret: Copy to LINKEDIN_CLIENT_SECRET

**Products:**
- Sign In with LinkedIn (required)
- Share on LinkedIn (for posting)
- Marketing Developer Platform (for company pages)

### 3. Required Scopes
- `r_liteprofile` - Basic profile info
- `r_emailaddress` - Email address
- `w_member_social` - Post on behalf of user

### 4. Environment Variables
\`\`\`
NEXT_PUBLIC_LINKEDIN_CLIENT_ID=your_client_id
LINKEDIN_CLIENT_SECRET=your_client_secret
\`\`\`

### 5. Testing
1. Make sure your app is in "Development" mode initially
2. Add your LinkedIn account as a test user
3. Test the OAuth flow
4. Apply for production access when ready

### 6. Common Fixes
- Ensure redirect URI matches exactly (no trailing slash)
- Use HTTPS for all URLs
- Don't include extra parameters in OAuth URL
- Make sure app is approved for the scopes you're requesting
