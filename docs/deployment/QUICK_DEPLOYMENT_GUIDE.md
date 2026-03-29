# Token Refresh Enhancement - Quick Deployment Guide

## 🚀 Deploy in 5 Minutes

### Step 1: Apply Database Migrations
```bash
cd /Users/nathanielstoddard/chainreact-app/chainreact-app-9e
supabase db push
```

**What this does**:
- Adds `consecutive_transient_failures` column to `integrations` table
- Adds `integration_warning` and `integration_rate_limit` notification types

### Step 2: Verify Migrations Applied
```sql
-- Check column exists
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'integrations'
AND column_name = 'consecutive_transient_failures';

-- Check notification types
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'notifications_type_check';
```

### Step 3: Deploy Code
```bash
git add .
git commit -m "feat: enhanced token refresh with notifications and failure tracking

- Cron runs every 5 minutes (was 20)
- Refresh tokens 10 min before expiry (was 30)
- Separate transient vs permanent failure tracking
- Send warning at 2nd failure, disconnect at 3rd
- Rate limit notifications for transient failures
- Email escalation on critical failures"

git push
```

### Step 4: Monitor First Run
After deployment, check cron job logs:
```
https://yourapp.com/api/cron/token-refresh?secret=YOUR_CRON_SECRET&verbose=true
```

Look for:
- ✅ Integrations being processed
- ✅ Failure classification (transient vs permanent)
- ✅ Notifications being sent
- ❌ Any errors in notification sending

---

## 🔍 Quick Verification Checklist

After deployment, verify:

### ✅ Cron Job Running
- [ ] Visit Vercel dashboard → Crons
- [ ] See token-refresh running every 5 minutes
- [ ] No errors in execution logs

### ✅ Database Schema
- [ ] `consecutive_transient_failures` column exists in `integrations` table
- [ ] Notification types include `integration_warning` and `integration_rate_limit`

### ✅ Notifications Working
- [ ] Cause an integration to fail (corrupt refresh token)
- [ ] After 2nd failure: Check for warning notification in database
- [ ] After 3rd failure: Check for disconnection notification

### ✅ Failure Tracking
```sql
SELECT provider, status, consecutive_failures, consecutive_transient_failures
FROM integrations
WHERE consecutive_failures > 0 OR consecutive_transient_failures > 0;
```

---

## 🎯 Expected Behavior After Deployment

### **Immediate Changes**:
1. Cron job will run every 5 minutes (instead of 20)
2. Tokens will refresh 10 minutes before expiry (instead of 30)
3. Failures will be classified as transient or permanent

### **Gradual Changes** (over next 24 hours):
1. Users with failing integrations will start receiving notifications
2. Rate-limited integrations won't be marked as disconnected
3. Transient failures will auto-recover without user action

---

## ⚠️ Important Notes

1. **Email Integration**: ✅ Fully integrated with Resend! Emails will be sent automatically on 3rd failure or invalid refresh token. See `RESEND_EMAIL_INTEGRATION_COMPLETE.md` for details.

2. **Existing Failed Integrations**: Already-failed integrations won't retroactively receive notifications. Only new failures trigger notifications.

3. **Migration Rollback** (if needed):
```sql
-- Rollback transient failures column
ALTER TABLE integrations DROP COLUMN IF EXISTS consecutive_transient_failures;

-- Rollback notification types
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
CHECK (type IN ('team_invitation', 'workflow_shared', 'execution_failed', 'integration_disconnected', 'system'));
```

---

## 📊 Success Metrics

Monitor these over next week:

1. **Premature disconnections** - Should decrease (transient failures won't disconnect)
2. **User notifications** - Should see warning notifications before disconnections
3. **Integration health** - More integrations stay connected longer
4. **Support tickets** - Fewer "my integration stopped working" tickets

---

## 🆘 If Something Goes Wrong

### **Cron job failing**:
```bash
# Check Vercel logs
vercel logs --since 1h

# Check for specific errors
vercel logs --since 1h | grep "token-refresh"
```

### **Notifications not sending**:
```sql
-- Check notification table
SELECT * FROM notifications
WHERE type IN ('integration_warning', 'integration_disconnected', 'integration_rate_limit')
ORDER BY created_at DESC LIMIT 10;
```

### **Too many notifications**:
Adjust thresholds in `/app/api/cron/token-refresh/route.ts`:
- Line 345: Warning notification (currently 2nd failure)
- Line 358: Disconnection notification (currently 3rd failure)
- Line 333: Rate limit notification (currently 5th transient failure)

---

**Need Help?** See full documentation: `TOKEN_REFRESH_ENHANCEMENT_COMPLETE.md`
