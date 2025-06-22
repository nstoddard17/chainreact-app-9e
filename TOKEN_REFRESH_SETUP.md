# Token Refresh System Setup Guide

## ✅ What's Already Done
- Database schema with tracking columns
- Updated cron job with proper refresh token expiration logic
- Admin monitoring dashboard
- API endpoints for stats and manual refresh

## 🚀 Final Setup Steps

### 1. Set Up Vercel Cron Job
In your Vercel dashboard:
1. Go to your project settings
2. Navigate to "Functions" → "Cron Jobs"
3. Add a new cron job:
   - **Function**: `/api/cron/refresh-tokens-simple`
   - **Schedule**: `0 */6 * * *` (every 6 hours)
   - **Description**: "Refresh OAuth tokens"

### 2. Test the System
\`\`\`bash
# Test the cron job manually
curl "https://your-domain.com/api/cron/refresh-tokens-simple?secret=YOUR_CRON_SECRET"

# Check the monitoring dashboard
curl "https://your-domain.com/api/admin/token-refresh-stats"
\`\`\`

### 3. Monitor Token Health
- Visit `/admin/token-health` to see the dashboard
- Set up alerts when `needs_attention` count gets high
- Monitor provider-specific failure rates

### 4. Environment Variables Required
Make sure these are set in Vercel:
- `CRON_SECRET` - Secret for authenticating cron jobs
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key for admin operations

## 🔧 How It Works

### Token Refresh Logic
1. **Refresh Token Priority**: Checks if refresh token expires within 30 minutes
2. **Access Token Check**: Refreshes if access token expires within 30 minutes
3. **Failure Tracking**: Tracks consecutive failures and marks for reauthorization after 3 failures
4. **Complete Data Storage**: Stores all token metadata including expiration times

### Monitoring
- Real-time dashboard at `/admin/token-health`
- API endpoint for programmatic monitoring
- Tracks success/failure rates by provider
- Shows recent failures with reasons

### Manual Operations
- Trigger refresh manually from dashboard
- View detailed failure reasons
- Monitor provider-specific health

## 🚨 Alerts to Set Up
- When `needs_attention` > 10
- When any provider has >50% failure rate
- When no refreshes happened in last 12 hours

## 📊 Key Metrics to Watch
- **Connected**: Should be majority of integrations
- **Needs Attention**: Should stay low (<5% of total)
- **24h Refreshes**: Should show regular activity
- **Provider Health**: Watch for patterns in specific providers
