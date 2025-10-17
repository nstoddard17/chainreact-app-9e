# Discord Gateway - Railway Deployment Guide

## Prerequisites

1. **Discord Bot Token**
   - Go to https://discord.com/developers/applications
   - Select your bot application (or create one)
   - Go to "Bot" section
   - Copy the bot token
   - **Intents Required:** Enable "Message Content Intent" under Privileged Gateway Intents

2. **Your ChainReact App URL**
   - Your deployed Next.js app URL (e.g., `https://your-app.vercel.app`)

## Railway Setup (5 minutes)

### Step 1: Create Railway Account
1. Go to https://railway.app
2. Sign up with GitHub (recommended)
3. Verify your account

### Step 2: Create New Project
1. Click "New Project"
2. Select "Deploy from GitHub repo"
3. Connect your GitHub account if not already connected
4. Select your ChainReact repository
5. Railway will detect it's a Node.js project

### Step 3: Configure Root Directory
1. After selecting the repo, click on the service
2. Go to "Settings" tab
3. Scroll to "Build & Deploy" section
4. Set **Root Directory** to: `services/discord-gateway`
5. Set **Start Command** to: `npm start`

### Step 4: Set Environment Variables
1. Go to "Variables" tab
2. Add the following variables:

   **DISCORD_BOT_TOKEN**
   ```
   your-actual-discord-bot-token
   ```

   **NEXT_PUBLIC_SITE_URL**
   ```
   https://your-chainreact-app.vercel.app
   ```

3. Click "Add" for each variable

### Step 5: Deploy
1. Railway will automatically deploy when you add variables
2. Or click "Deploy" button manually
3. Wait for build to complete (~1-2 minutes)

### Step 6: Verify It's Running
1. Go to "Logs" tab
2. You should see:
   ```
   🔄 Connecting to Discord...
   ✅ Discord bot logged in successfully
   ✅ Discord Gateway connected as YourBot#1234
   📡 Forwarding messages to: https://your-app.vercel.app/api/webhooks/discord/hitl
   🟢 Monitoring X servers
   ```

## Alternative: Railway CLI (Optional)

If you prefer command line:

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Initialize project
cd services/discord-gateway
railway init

# Set environment variables
railway variables set DISCORD_BOT_TOKEN="your-token"
railway variables set NEXT_PUBLIC_SITE_URL="https://your-app.vercel.app"

# Deploy
railway up
```

## Troubleshooting

### "Invalid Token" Error
- Check that DISCORD_BOT_TOKEN is correct
- Make sure there are no extra spaces or quotes

### "Missing Intents" Error
- Go to Discord Developer Portal
- Bot Settings → Privileged Gateway Intents
- Enable "Message Content Intent"

### "Cannot connect to webhook" Error
- Verify NEXT_PUBLIC_SITE_URL is correct
- Test the webhook manually:
  ```bash
  curl -X POST https://your-app.vercel.app/api/webhooks/discord/hitl \
    -H "Content-Type: application/json" \
    -d '{"t":"MESSAGE_CREATE","d":{"content":"test"}}'
  ```

### Bot not responding to messages
- Check Railway logs for errors
- Verify bot is in the correct Discord server
- Verify bot has permissions to read messages in the channel

## Cost

**Railway Free Tier:**
- $5 free credit per month
- This gateway uses ~$0.50-$1.00/month
- More than enough for most use cases

**Paid Tier ($5/month):**
- If you exceed free tier
- 99.9% uptime SLA

## Updating the Gateway

When you push changes to GitHub:
1. Railway automatically detects the changes
2. Rebuilds and redeploys
3. Zero downtime deployment

Or manually redeploy:
1. Go to Railway dashboard
2. Click "Deploy" → "Redeploy"

## Monitoring

**Railway Dashboard:**
- View real-time logs
- Check memory/CPU usage
- Monitor uptime

**Discord Bot Status:**
- Bot shows as "Online" in Discord server
- Check Railway logs for connection confirmations

## Next Steps

Once deployed and running:
1. ✅ Run the HITL migration SQL in Supabase
2. ✅ Add OPENAI_API_KEY to your Next.js app
3. ✅ Test the HITL feature end-to-end

---

**Questions?** Check Railway docs: https://docs.railway.app
