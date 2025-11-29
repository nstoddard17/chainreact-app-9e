# Error Notifications Setup for Vercel

Complete guide for setting up error notifications (Email, SMS, Slack, Discord) on Vercel.

## Quick Start - Environment Variables for Vercel

### 1. Email (Resend) - Already Configured ✅

You should already have these in Vercel:
```
RESEND_API_KEY
RESEND_FROM_EMAIL (optional)
```

### 2. SMS (Twilio) - New Setup Required

**Add these 3 environment variables to Vercel:**

```
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER
```

### 3. Discord Bot - New Setup Required

**Add this 1 environment variable to Vercel:**

```
DISCORD_BOT_TOKEN
```

### 4. Slack - Already Configured ✅

Uses existing OAuth integration, no new env vars needed.

---

## Step-by-Step: Adding Twilio to Vercel

### Step 1: Install Twilio Package

Add Twilio to your dependencies:

```bash
npm install twilio
```

Then commit and push to trigger Vercel deployment:

```bash
git add package.json package-lock.json
git commit -m "Add Twilio for SMS notifications"
git push
```

### Step 2: Get Twilio Credentials

1. **Sign up for Twilio**: Go to [twilio.com/try-twilio](https://www.twilio.com/try-twilio)
   - Free trial includes $15 in credits
   - No credit card required initially

2. **Get your credentials from Console**:
   - Go to [console.twilio.com](https://console.twilio.com)
   - Find "Account Info" section on the dashboard
   - Copy:
     - **Account SID** (starts with `AC...`)
     - **Auth Token** (click to reveal)

3. **Get a Phone Number**:
   - In Twilio Console, go to **Phone Numbers → Manage → Buy a number**
   - Search for a number (US numbers are ~$1/month)
   - Or use the **free trial number** (can only send to verified numbers)
   - Copy the phone number in format: `+15551234567`

### Step 3: Add Environment Variables to Vercel

#### Option A: Via Vercel Dashboard (Recommended)

1. Go to your project in [vercel.com](https://vercel.com)
2. Click **Settings** tab
3. Click **Environment Variables** in sidebar
4. Add these 3 variables:

| Key | Value | Example |
|-----|-------|---------|
| `TWILIO_ACCOUNT_SID` | Your Account SID | `AC1234567890abcdef1234567890abcd` |
| `TWILIO_AUTH_TOKEN` | Your Auth Token | `your_auth_token_here` |
| `TWILIO_PHONE_NUMBER` | Your Twilio number | `+15551234567` |

5. Select **Production**, **Preview**, and **Development** for each
6. Click **Save**

#### Option B: Via Vercel CLI

```bash
vercel env add TWILIO_ACCOUNT_SID
# Paste your Account SID when prompted

vercel env add TWILIO_AUTH_TOKEN
# Paste your Auth Token when prompted

vercel env add TWILIO_PHONE_NUMBER
# Paste your phone number when prompted (e.g., +15551234567)
```

### Step 4: Redeploy

After adding environment variables:

```bash
# Trigger a new deployment
vercel --prod
```

Or just push a commit to trigger automatic deployment:

```bash
git commit --allow-empty -m "Redeploy with Twilio env vars"
git push
```

---

## Step-by-Step: Adding Discord Bot to Vercel

### Step 1: Create Discord Bot

1. **Go to Discord Developer Portal**: [discord.com/developers/applications](https://discord.com/developers/applications)

2. **Create New Application**:
   - Click "New Application"
   - Name it "ChainReact Notifications"
   - Click "Create"

3. **Create Bot**:
   - Go to "Bot" section in left sidebar
   - Click "Add Bot"
   - Click "Reset Token" and copy the token (starts with `MT...`)
   - ⚠️ **Save this token** - you can't see it again!

4. **Configure Bot Permissions**:
   - Scroll down to "Privileged Gateway Intents"
   - Enable: **Message Content Intent** (required to read messages)
   - Under "Bot Permissions", enable:
     - ✅ Send Messages
     - ✅ Read Message History
     - ✅ View Channels

5. **Invite Bot to Your Server**:
   - Go to "OAuth2" → "URL Generator"
   - Select scopes: **bot**
   - Select permissions: **Send Messages**, **Read Message History**, **View Channels**
   - Copy the generated URL
   - Paste in browser and select your Discord server
   - Click "Authorize"

### Step 2: Add Environment Variable to Vercel

**Via Vercel Dashboard:**

1. Go to **Settings → Environment Variables**
2. Add:

| Key | Value |
|-----|-------|
| `DISCORD_BOT_TOKEN` | Your bot token (MT...) |

3. Select all environments
4. Click **Save**

**Via Vercel CLI:**

```bash
vercel env add DISCORD_BOT_TOKEN
# Paste your bot token when prompted
```

### Step 3: Redeploy

```bash
vercel --prod
```

---

## Complete Environment Variables Checklist

Here's what you should have in Vercel after setup:

### ✅ Already Configured (Existing)

```bash
RESEND_API_KEY=re_xxxxxxxxxxxxx
RESEND_FROM_EMAIL=notifications@chainreact.app

# Slack OAuth (already working)
NEXT_PUBLIC_SLACK_CLIENT_ID=xxxxx
SLACK_CLIENT_SECRET=xxxxx

# Discord OAuth (already working)
NEXT_PUBLIC_DISCORD_CLIENT_ID=xxxxx
DISCORD_CLIENT_SECRET=xxxxx

# Supabase (already working)
NEXT_PUBLIC_SUPABASE_URL=xxxxx
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=xxxxx
SUPABASE_SECRET_KEY=xxxxx
```

### 🆕 New for Error Notifications

```bash
# Twilio SMS
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+15551234567

# Discord Bot
DISCORD_BOT_TOKEN=MTxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

## Testing Notifications on Vercel

### 1. Create a Test Workflow

1. Go to your production app: `https://your-app.vercel.app`
2. Create a new workflow
3. Go to Settings tab
4. Enable "Error Notifications"
5. Configure:
   - ✅ **Email**: Your email address
   - ✅ **SMS**: Your phone number (format: `+15551234567`)
   - ✅ **Slack**: Select a channel (connect Slack first if needed)
   - ✅ **Discord**: Select a channel (bot must be in server)

### 2. Trigger an Error

Create a workflow that will fail:

**Option A: Use an invalid action**
- Add a "Send Email" action
- Leave required fields empty
- Run the workflow

**Option B: Add a custom code node with error**
```javascript
throw new Error("Test notification error");
```

### 3. Check Notifications

Within seconds, you should receive notifications via all enabled channels:

- **Email**: Check your inbox
- **SMS**: Check your phone
- **Slack**: Check the selected channel
- **Discord**: Check the selected channel

### 4. Check Vercel Logs

Go to **Vercel Dashboard → Deployments → [Latest] → Functions**

Search for:
```
SMS sent successfully
Email sent successfully
Slack message sent successfully
Discord message sent successfully
```

---

## Vercel-Specific Notes

### Cold Starts

Serverless functions may have cold starts (1-3 seconds). This is normal and won't affect notification delivery.

### Function Timeout

Default Vercel timeout: **10 seconds** (Hobby) or **60 seconds** (Pro)

Notifications are sent asynchronously and won't block the response, but ensure your plan supports the function execution time.

### Environment Variable Updates

After adding/updating environment variables:
1. Variables are **NOT** automatically applied to existing deployments
2. You **MUST** redeploy to pick up new env vars
3. Use `vercel --prod` or push a new commit

### Secrets vs Environment Variables

In Vercel, there's no separate "secrets" concept - all environment variables are encrypted at rest and in transit.

Just use regular environment variables for all credentials.

---

## Troubleshooting on Vercel

### "Twilio credentials not configured"

**Check:**
1. Did you add all 3 Twilio env vars?
2. Did you redeploy after adding them?
3. Check Vercel logs to see if env vars are loaded

**Fix:**
```bash
vercel env ls  # List all env vars
vercel --prod  # Redeploy
```

### "Discord bot authentication failed"

**Check:**
1. Is `DISCORD_BOT_TOKEN` set correctly?
2. Is the bot in your Discord server?
3. Does the bot have "Send Messages" permission?

**Fix:**
- Verify token in Discord Developer Portal
- Re-invite bot to server
- Check channel permissions

### Function Timeout

If notifications are slow, check Vercel function logs:

```
Error: Function execution timed out
```

**Fix:**
- Upgrade to Pro plan (60s timeout)
- Or optimize notification sending (already async)

### SMS Only Sending to Verified Numbers (Trial Account)

Twilio trial accounts can only send SMS to verified numbers.

**Fix:**
1. Verify your phone in Twilio Console
2. Or upgrade to paid account (~$20 minimum)

---

## Cost Breakdown (Production)

### Vercel Hosting
- **Hobby**: Free (includes 100GB bandwidth)
- **Pro**: $20/month (1TB bandwidth, better functions)

### Twilio SMS
- **Phone Number**: ~$1/month
- **SMS**: $0.0075 per message
- **Example**: 200 error notifications/month = $2.50/month

### Resend Email
- **Free Tier**: 3,000 emails/month
- **Paid**: $20/month for 50,000 emails

### Slack & Discord
- **Free** (uses OAuth tokens and bot)

**Total Additional Cost: ~$3-4/month for SMS**

---

## Production Checklist

Before going live:

- [ ] `npm install twilio` committed and pushed
- [ ] All Twilio env vars added to Vercel Production
- [ ] Discord bot token added to Vercel Production
- [ ] Redeployed to Production environment
- [ ] Tested each notification channel
- [ ] Verified logs show successful sends
- [ ] Set up billing in Twilio (if using SMS)
- [ ] Verified Discord bot is in all relevant servers
- [ ] Documented phone number format for users (+1234567890)

---

## Example Vercel Environment Variables Setup

Here's what your Vercel Environment Variables page should look like:

```
Production | Preview | Development
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TWILIO_ACCOUNT_SID          ●  ●  ●     ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN           ●  ●  ●     ********************************
TWILIO_PHONE_NUMBER         ●  ●  ●     +15551234567
DISCORD_BOT_TOKEN           ●  ●  ●     ********************************
RESEND_API_KEY              ●  ●  ●     ********************************
NEXT_PUBLIC_SUPABASE_URL    ●  ●  ●     https://xxx.supabase.co
...
```

All sensitive values (tokens, keys) should be checked for all three environments.

---

## Getting Help

If you run into issues:

1. **Check Vercel Logs**: Dashboard → Deployments → [Latest] → Functions
2. **Check Application Logs**: Look for notification errors
3. **Verify Environment Variables**: Settings → Environment Variables
4. **Test Locally**: Use `vercel env pull` to test with production env vars

For Twilio issues: [twilio.com/console/support](https://www.twilio.com/console/support)
For Discord issues: [discord.com/developers/docs](https://discord.com/developers/docs)

---

You're all set! 🎉
