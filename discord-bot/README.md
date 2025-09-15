# ChainReact Discord Bot Service

This is a standalone Discord bot service that maintains the persistent WebSocket connection required for Discord triggers in ChainReact workflows.

## Why a Separate Service?

Discord requires a persistent WebSocket connection (Gateway) to receive events. This doesn't work with serverless platforms like Vercel where functions have time limits. This bot service runs separately to maintain that connection 24/7.

## Setup

### Environment Variables

Create a `.env` file with:

```env
# Required
DISCORD_BOT_TOKEN=your_bot_token_here
CHAINREACT_WEBHOOK_URL=https://your-chainreact-app.vercel.app

# Optional (for health checks)
PORT=3002
```

### Local Development

```bash
cd discord-bot
npm install
npm start
```

## Deployment Options

### Option 1: Railway (Recommended - Easy & Free Tier)

1. Fork/push this code to GitHub
2. Go to [Railway](https://railway.app)
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your repo and the `discord-bot` directory
5. Add environment variables in Railway dashboard
6. Deploy!

Railway will automatically:
- Detect it's a Node.js app
- Install dependencies
- Run `npm start`
- Keep it running 24/7

### Option 2: Render

1. Go to [Render](https://render.com)
2. Create a new "Background Worker"
3. Connect your GitHub repo
4. Set root directory to `discord-bot`
5. Set build command: `npm install`
6. Set start command: `npm start`
7. Add environment variables
8. Deploy!

### Option 3: Heroku

Create a `Procfile` in the discord-bot directory:
```
worker: node index.js
```

Then:
```bash
heroku create your-app-name
heroku config:set DISCORD_BOT_TOKEN=your_token
heroku config:set CHAINREACT_WEBHOOK_URL=https://your-app.vercel.app
git push heroku main
heroku ps:scale worker=1
```

### Option 4: DigitalOcean App Platform

1. Create an App
2. Add a "Worker" component
3. Point to your GitHub repo's `discord-bot` directory
4. Set environment variables
5. Deploy

### Option 5: Docker (for VPS/EC2/etc)

Create a `Dockerfile`:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
CMD ["node", "index.js"]
```

Then:
```bash
docker build -t chainreact-discord-bot .
docker run -d \
  -e DISCORD_BOT_TOKEN=your_token \
  -e CHAINREACT_WEBHOOK_URL=https://your-app.vercel.app \
  --restart unless-stopped \
  chainreact-discord-bot
```

## Health Checks

The bot exposes a health endpoint at `http://localhost:PORT/health` that returns:
```json
{
  "status": "healthy",
  "connected": true,
  "sessionId": "...",
  "reconnectAttempts": 0,
  "timestamp": "2025-01-15T..."
}
```

Most hosting platforms can use this for monitoring.

## How It Works

1. Bot connects to Discord Gateway via WebSocket
2. Receives MESSAGE_CREATE events from Discord
3. Forwards them to your ChainReact app's `/api/workflow/discord` endpoint
4. Your ChainReact app processes the message and triggers workflows

## Troubleshooting

### Bot not receiving messages?
- Check bot has "Message Content Intent" enabled in Discord Developer Portal
- Verify bot is in your server with proper permissions
- Check bot token is correct

### Webhooks not triggering workflows?
- Verify CHAINREACT_WEBHOOK_URL is correct
- Check your ChainReact app is deployed and accessible
- Look at bot logs for webhook delivery errors

### Bot keeps disconnecting?
- Check your hosting platform doesn't have timeouts
- Ensure you're using a "worker" or "background" service type, not a web service
- Check Discord API status at https://discordstatus.com

## Monitoring

For production, consider adding:
- Logging service (Logtail, Papertrail, etc.)
- Uptime monitoring (UptimeRobot, Better Uptime, etc.)
- Error tracking (Sentry, Rollbar, etc.)