# Vercel Cron Job Setup Checklist

## ✅ Current Status: MOSTLY WORKING

Your Vercel cron job setup is **mostly correct** but needs a few adjustments to work reliably.

## 🔧 Required Fixes

### 1. Environment Variables (CRITICAL)
Make sure these are set in your Vercel dashboard:
- `NEXT_PUBLIC_SUPABASE_URL` ✅ (should be set)
- `SUPABASE_SERVICE_ROLE_KEY` ✅ (should be set)
- `CRON_SECRET` ✅ (should be set)

### 2. Vercel Plan (CRITICAL)
- **Upgrade to a paid Vercel plan** (Pro or higher)
- Cron jobs are only available on paid plans
- Free plan doesn't support cron jobs

### 3. vercel.json Configuration ✅
Your `vercel.json` is correctly configured:
\`\`\`json
{
  "crons": [
    {
      "path": "/api/cron/refresh-tokens",
      "schedule": "*/30 * * * *"
    }
  ]
}
\`\`\`

### 4. API Route Configuration ✅
Your `/api/cron/refresh-tokens/route.ts` is correctly configured:
- Accepts Vercel cron headers (`x-vercel-cron: 1`)
- Has proper authentication fallback
- Includes timeout handling
- Has comprehensive logging

### 5. Database Schema ✅
Your database has the required tables:
- `token_refresh_logs` table exists
- `integrations` table has required columns
- Proper indexes are in place

## 🧪 Testing Results

### ✅ Working Endpoints:
- `/api/cron/test-refresh` - Returns 200 OK
- `/api/cron/refresh-tokens` with Vercel header - Returns 200 OK
- `/api/cron/debug-integrations` - Returns 200 OK

### ✅ Authentication:
- Vercel cron header authentication works
- Secret-based authentication works
- Invalid secrets are properly rejected

## 🚀 Deployment Steps

### 1. Deploy to Vercel
\`\`\`bash
vercel --prod
\`\`\`

### 2. Verify Environment Variables
In Vercel dashboard, confirm all required environment variables are set:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` 
- `CRON_SECRET`

### 3. Upgrade Vercel Plan
- Go to Vercel dashboard
- Upgrade to Pro plan or higher
- Cron jobs require paid plan

### 4. Monitor Cron Jobs
After deployment and plan upgrade:
- Check Vercel dashboard → Functions tab
- Look for cron job status
- Monitor function logs

## 🔍 Troubleshooting

### If Cron Jobs Don't Run:

1. **Check Vercel Plan**
   - Must be on paid plan (Pro or higher)
   - Free plan doesn't support cron jobs

2. **Check Environment Variables**
   - All required variables must be set
   - No typos in variable names

3. **Check Deployment**
   - Ensure latest code is deployed
   - Check for deployment errors

4. **Check Function Logs**
   - Go to Vercel dashboard → Functions
   - Look for cron job execution logs
   - Check for errors

### If Cron Jobs Run But Fail:

1. **Check Database Connection**
   - Verify Supabase credentials
   - Check network connectivity

2. **Check Integration Data**
   - Some integrations may have invalid data
   - Check for malformed refresh tokens

3. **Check Timeouts**
   - Function has 30-second timeout per integration
   - Large numbers of integrations may cause issues

## 📊 Monitoring

### Vercel Dashboard:
- Functions tab shows cron job status
- Function logs show execution details
- Error logs show failures

### Database Monitoring:
\`\`\`sql
-- Check recent cron job runs
SELECT * FROM token_refresh_logs 
ORDER BY executed_at DESC 
LIMIT 10;

-- Check token health
SELECT * FROM token_health_summary;
\`\`\`

## 🎯 Expected Behavior

Once properly configured:
1. Cron job runs every 30 minutes automatically
2. Processes integrations that need token refresh
3. Logs results to `token_refresh_logs` table
4. Updates integration status as needed
5. Handles errors gracefully

## ⚠️ Known Issues Fixed

1. **Redundant Database Query** ✅ Fixed
   - Removed unused query that could cause issues

2. **Timeout Handling** ✅ Implemented
   - 30-second timeout per integration refresh
   - Prevents hanging on problematic integrations

3. **Error Handling** ✅ Implemented
   - Comprehensive error logging
   - Graceful failure handling
   - Retry logic with exponential backoff

## 🚀 Next Steps

1. **Deploy the latest code** (with the redundant query fix)
2. **Upgrade Vercel plan** to Pro or higher
3. **Verify environment variables** are set correctly
4. **Monitor the first few cron job runs**
5. **Check database logs** for successful execution

Your setup is very close to working! The main issue is likely the Vercel plan upgrade requirement.
