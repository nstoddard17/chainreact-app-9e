# Post-Deployment Monitoring Guide

This guide outlines what to monitor and how to respond after deploying to production.

## Monitoring Windows

### Critical Window: 0-15 Minutes
**Action**: Active monitoring required, be ready to rollback

### Important Window: 15 Minutes - 1 Hour
**Action**: Continue monitoring, test features, check integrations

### Validation Window: 1-24 Hours
**Action**: Periodic checks, monitor error rates, review user feedback

### Post-Mortem: 24+ Hours
**Action**: Review metrics, document issues, update processes

---

## 0-15 Minutes: Critical Window

### Deployment Status

**Vercel Dashboard**
1. Go to Vercel Dashboard → Deployments
2. Verify latest deployment shows "Ready"
3. Check build logs for warnings

**What to look for:**
- ✅ Build completed successfully
- ✅ No build warnings about missing dependencies
- ✅ Deployment marked as "Ready"
- ❌ Build failures
- ❌ Timeout errors
- ❌ Memory errors during build

### Live Application Smoke Tests

**1. Homepage Load**
```
✓ Navigate to https://chainreact.app
✓ Page loads in <3 seconds
✓ No console errors (F12 → Console)
✓ No layout breaks
✓ Assets load (images, fonts)
```

**2. Authentication Flow**
```
✓ Login page loads
✓ Login with test account succeeds
✓ Redirect to dashboard works
✓ User profile loads
✓ Logout works
```

**3. Core Workflows**
```
✓ Workflows page loads
✓ Can view existing workflow
✓ Can create new workflow
✓ Workflow builder opens
✓ Can add nodes
✓ Can save workflow
```

**4. Integration Connections**
```
✓ Integrations page loads
✓ Connected integrations show "Connected" status
✓ Can view integration details
✓ Test connection works (if applicable)
```

### Log Monitoring

**Vercel Logs (Real-Time)**
```bash
# Terminal
vercel logs --follow

# Or in Dashboard
Vercel → Project → Deployments → Latest → Logs
```

**What to look for:**
- ✅ Normal request logs (200, 201, 204 status codes)
- ❌ 500 errors (server errors)
- ❌ 404 spikes (broken links)
- ❌ Database connection errors
- ❌ Integration API errors
- ❌ Unhandled exceptions

**Common error patterns:**
```
❌ Error: ECONNREFUSED (database down)
❌ Error: Cannot read property 'X' of undefined (code error)
❌ TypeError: (unexpected null/undefined)
❌ Authentication failed (env var issue)
❌ RLS policy violation (permission issue)
```

### Database Health (Supabase)

**Supabase Dashboard**
1. Go to Supabase Dashboard → Logs
2. Select "Postgres Logs"
3. Check last 15 minutes

**What to look for:**
- ✅ Normal query patterns
- ✅ Response times <100ms for simple queries
- ❌ Slow query warnings (>1s)
- ❌ Connection pool exhausted
- ❌ RLS policy violations
- ❌ Foreign key constraint errors

**Check RLS Policies:**
```sql
-- Run in Supabase SQL editor
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename;

-- Verify expected policies exist
```

### Webhook & Integration Health

**Test One Workflow Per Integration Type:**
1. Gmail trigger → Send test email → Verify workflow executes
2. Slack trigger → Send test message → Verify workflow executes
3. Discord trigger → Send test message → Verify workflow executes
4. Airtable trigger → Create test record → Verify workflow executes

**Check Trigger Resources:**
```sql
-- Run in Supabase SQL editor
SELECT
  workflow_id,
  external_id,
  status,
  created_at
FROM trigger_resources
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;
```

**Expected:** Trigger resources created for active workflows

### Error Rate Baseline

**Establish Normal Error Rate:**
- Check error count before deployment
- Compare to error count after deployment
- Small increase (<5%) is normal
- Large spike (>20%) indicates problem

**Vercel Analytics** (if enabled):
- Go to Vercel → Analytics
- Check error rate graph
- Compare to historical baseline

---

## 15 Minutes - 1 Hour: Important Window

### Feature-Specific Testing

**Test All Changed Features:**
- [ ] Feature 1 tested end-to-end
- [ ] Feature 2 tested with edge cases
- [ ] Bug fix verified resolved
- [ ] No regressions in related features

**Test Cross-Feature Interactions:**
- [ ] New feature doesn't break existing features
- [ ] Workflow execution still works
- [ ] Data flows correctly between components

### Integration Deep Dive

**Webhook Deliveries:**

**Gmail:**
1. Send email to test account
2. Check Supabase for webhook received
3. Verify workflow executed
4. Check logs for errors

**Slack:**
1. Send message in test channel
2. Verify webhook received
3. Check workflow execution
4. Verify Slack API calls succeed

**Discord:**
1. Send message in test server
2. Verify webhook received
3. Check workflow execution
4. Verify Discord API calls succeed

**Airtable:**
1. Create record in test base
2. Verify webhook received
3. Check deduplication working
4. Verify workflow executed

**Microsoft/Outlook:**
1. Send test email
2. Check subscription still active
3. Verify webhook received
4. Check workflow execution

### User Flow Testing

**Complete User Journeys:**

**Journey 1: New User Signup**
```
1. Sign up with new account
2. Verify email confirmation
3. Complete onboarding
4. Create first workflow
5. Activate workflow
6. Test workflow execution
```

**Journey 2: Connect Integration**
```
1. Go to Integrations
2. Click "Connect" on Gmail
3. Complete OAuth flow
4. Verify connection shown
5. Create workflow using Gmail
6. Test workflow
```

**Journey 3: Build Complex Workflow**
```
1. Create new workflow
2. Add trigger (Gmail)
3. Add condition
4. Add multiple actions
5. Save workflow
6. Activate workflow
7. Test execution
```

### Performance Monitoring

**Page Load Times:**
- Homepage: <2s
- Workflows page: <3s
- Workflow builder: <4s
- Settings page: <2s

**API Response Times:**
- GET requests: <500ms
- POST requests: <1s
- Workflow execution start: <2s

**Database Query Performance:**
```sql
-- Check slow queries in Supabase
SELECT
  query,
  calls,
  mean_exec_time,
  max_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY mean_exec_time DESC
LIMIT 20;
```

### Browser Compatibility Checks

**Quick cross-browser test:**
- [ ] Chrome (latest)
- [ ] Safari (latest)
- [ ] Firefox (latest)
- [ ] Mobile Safari (iOS)
- [ ] Mobile Chrome (Android)

**What to test:**
- Core workflows load
- No console errors
- Authentication works
- Layout not broken

---

## 1-24 Hours: Validation Window

### Error Rate Trends

**Vercel Dashboard:**
- Check error count over last 24 hours
- Compare to previous 24 hours (before deployment)
- Acceptable: <5% increase
- Investigate: 5-20% increase
- Alert: >20% increase

**Supabase Dashboard:**
- API Error Rate: Should be <1%
- Database Errors: Should be near zero
- Auth Errors: Investigate any spikes

### User-Reported Issues

**Monitor Support Channels:**
- Email support queue
- Discord/Slack support channels
- Twitter mentions
- GitHub issues (if public)

**Common user reports:**
- "Feature X isn't working"
- "I'm getting an error when I..."
- "The page is loading slowly"
- "My integration disconnected"

**Response protocol:**
1. Acknowledge issue immediately
2. Reproduce issue if possible
3. Check if related to deployment
4. Document in issue tracker
5. Escalate if critical

### Integration Health Summary

**Check Integration Status Table:**
```sql
-- Count connected integrations by provider
SELECT
  provider,
  COUNT(*) as connected_count,
  MAX(updated_at) as last_activity
FROM integrations
WHERE status = 'connected'
GROUP BY provider
ORDER BY connected_count DESC;
```

**Expected:** Similar counts to before deployment

**Check Recent Workflow Executions:**
```sql
SELECT
  status,
  COUNT(*) as count
FROM workflow_executions
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY status;
```

**Expected ratio:**
- Success: >90%
- Failed: <10%
- Pending: <1%

### Webhook Delivery Rates

**Check webhook processing:**
```sql
SELECT
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as webhooks_received
FROM webhook_queue
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

**What to look for:**
- Consistent delivery rate
- No sudden drops (indicates problem)
- No huge spikes (unless expected)

### Database Performance

**Connection Pool:**
- Check Supabase dashboard → Database → Connections
- Should be <80% of max connections
- Spikes indicate connection leak

**Table Sizes:**
```sql
SELECT
  table_name,
  pg_size_pretty(pg_total_relation_size(quote_ident(table_name)))
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY pg_total_relation_size(quote_ident(table_name)) DESC;
```

**Check for unexpected growth**

**Index Usage:**
```sql
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read
FROM pg_stat_user_indexes
WHERE idx_scan = 0
AND schemaname = 'public';
```

**Unused indexes = potential performance issue**

### User Activity Metrics

**Active Users (Last 24 Hours):**
```sql
SELECT COUNT(DISTINCT user_id)
FROM workflow_executions
WHERE created_at > NOW() - INTERVAL '24 hours';
```

**Compare to previous 24 hours**

**Workflow Executions:**
```sql
SELECT
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as executions
FROM workflow_executions
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

**Look for unexpected drops**

---

## 24+ Hours: Post-Mortem

### Deployment Review

**Questions to answer:**
1. Did deployment go smoothly?
2. Were there any unexpected issues?
3. How long did monitoring take?
4. Did we catch issues quickly?
5. Were rollbacks needed?

### Metrics Summary

**Create deployment report:**
```markdown
# Deployment Report: [Date]

## Changes Deployed
- Feature 1: [Description]
- Feature 2: [Description]
- Bug Fix: [Description]

## Metrics
- Deployment time: [X] minutes
- Error rate change: [+/-X%]
- Performance impact: [None/Improved/Degraded]
- User-reported issues: [X]

## Issues Encountered
1. [Issue 1] - [Resolution]
2. [Issue 2] - [Resolution]

## Lessons Learned
- [Learning 1]
- [Learning 2]

## Action Items
- [ ] Update monitoring for [X]
- [ ] Improve testing for [Y]
- [ ] Document edge case [Z]
```

### Update Documentation

**If issues were found:**
- Document in `/learning/walkthroughs/[issue-name].md`
- Update relevant guides with lessons learned
- Add to troubleshooting sections

**If new patterns emerged:**
- Document in `/learning/docs/`
- Share with team
- Update coding standards if applicable

### Process Improvements

**Checklist updates:**
- Did pre-deployment checklist catch everything?
- Were there checks we missed?
- Should we add new verification steps?

**Monitoring improvements:**
- Were there issues we didn't catch quickly?
- Do we need better alerting?
- Should we add new health checks?

---

## Common Issues & Solutions

### Issue: 500 Errors After Deployment

**Symptoms:**
- Error rate spike
- Vercel logs show unhandled exceptions
- Users report "Something went wrong"

**Investigation:**
1. Check Vercel logs for stack traces
2. Identify failing endpoint
3. Check recent code changes to that endpoint
4. Verify environment variables

**Common causes:**
- Missing environment variable
- Database connection error
- Breaking API change
- Null/undefined error from code change

**Resolution:**
- Fix code bug → Deploy hotfix
- Add missing env var → Redeploy
- Rollback if can't fix quickly

### Issue: Integration Webhooks Not Received

**Symptoms:**
- Workflows not executing
- No entries in webhook_queue
- trigger_resources table empty/stale

**Investigation:**
1. Check `NEXT_PUBLIC_BASE_URL` env var
2. Verify trigger_resources have correct URLs
3. Test webhook endpoint manually
4. Check provider webhook dashboard

**Common causes:**
- Webhook URL points to development
- Trigger resources not recreated
- OAuth token expired
- Provider changed webhook format

**Resolution:**
1. Update `NEXT_PUBLIC_BASE_URL` to production
2. Deactivate and reactivate affected workflows
3. Refresh OAuth tokens if expired

### Issue: Database Performance Degradation

**Symptoms:**
- Slow page loads
- API timeouts
- High database CPU in Supabase

**Investigation:**
1. Check Supabase performance metrics
2. Identify slow queries
3. Check for missing indexes
4. Verify connection pool usage

**Common causes:**
- Missing index on new column
- N+1 query problem
- Large table scan
- Connection leak

**Resolution:**
- Add missing indexes
- Optimize queries
- Add pagination
- Fix connection leaks

### Issue: Users See Old Version

**Symptoms:**
- Users report feature not available
- Console shows old bundle version
- API calls fail with 400 errors

**Cause:**
- Browser cached old client bundle
- User hasn't refreshed since deployment

**Resolution:**
1. Ask user to hard refresh (Cmd+Shift+R)
2. Clear browser cache
3. Consider adding version detection
4. Make APIs backwards-compatible

### Issue: OAuth Redirects Failing

**Symptoms:**
- OAuth flow returns error
- "Redirect URI mismatch" errors
- Users can't connect integrations

**Investigation:**
1. Check OAuth app settings in provider console
2. Verify redirect URI includes production domain
3. Check env vars for OAuth credentials

**Common causes:**
- Redirect URI not added for production domain
- Using development OAuth app in production
- Typo in redirect URI

**Resolution:**
1. Add production redirect URI to OAuth app:
   - `https://chainreact.app/api/auth/callback/[provider]`
2. Update OAuth credentials in Vercel env vars
3. Test OAuth flow again

---

## Monitoring Tools & Commands

### Vercel CLI Commands

```bash
# View real-time logs
vercel logs --follow

# View logs for specific deployment
vercel logs [deployment-url]

# Get deployment info
vercel inspect [deployment-url]

# List recent deployments
vercel ls

# Promote deployment to production
vercel promote [deployment-url]
```

### Supabase Monitoring Queries

```sql
-- Check recent errors (if you have error logging table)
SELECT *
FROM error_logs
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 50;

-- Workflow execution status summary
SELECT
  status,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) as avg_duration_seconds
FROM workflow_executions
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY status;

-- Recent webhook activity
SELECT
  provider,
  COUNT(*) as webhooks
FROM webhook_queue
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY provider;

-- Active trigger resources
SELECT
  workflow_id,
  external_id,
  status,
  expires_at
FROM trigger_resources
WHERE status = 'active'
  AND (expires_at IS NULL OR expires_at > NOW());
```

### Browser DevTools Checks

**Console Errors:**
```
F12 → Console → Filter by "Error"
Look for red errors, warnings are usually OK
```

**Network Tab:**
```
F12 → Network → Filter by "XHR"
Check for failed requests (red)
Check response times (should be <1s)
```

**Performance:**
```
F12 → Performance → Record page load
Check Total Blocking Time <300ms
Check Largest Contentful Paint <2.5s
```

---

## Rollback Decision Matrix

| Severity | Error Rate | User Impact | Action |
|----------|-----------|-------------|--------|
| **Critical** | >50% errors | All users affected | **Immediate rollback** |
| **High** | 20-50% errors | Major feature broken | **Rollback within 15 min** |
| **Medium** | 5-20% errors | Minor feature broken | Attempt quick fix, rollback if >30 min |
| **Low** | <5% errors | Edge case issue | Fix in next deployment |

### When to Rollback

**Immediate Rollback:**
- Authentication broken (users can't log in)
- Database errors on all requests
- Complete feature failure
- Data corruption detected
- Security vulnerability exposed

**Consider Rollback:**
- Error rate >20%
- Major integration broken
- Performance severely degraded
- Multiple user reports of critical issue

**Don't Rollback (Fix Forward):**
- Minor UI bug
- Single edge case error
- Low traffic feature issue
- Easy fix available (<15 minutes)

---

## Monitoring Checklist

### ✅ First 15 Minutes
- [ ] Deployment shows "Ready" in Vercel
- [ ] Homepage loads without errors
- [ ] Login flow works
- [ ] No error spikes in logs
- [ ] Database responding normally
- [ ] Core features functional

### ✅ First Hour
- [ ] All features tested
- [ ] Integrations verified working
- [ ] No user-reported issues
- [ ] Performance acceptable
- [ ] Error rate within normal range

### ✅ First 24 Hours
- [ ] Error rate stable
- [ ] Workflow execution rates normal
- [ ] Integration webhooks delivering
- [ ] Database performance healthy
- [ ] No unexpected user reports

### ✅ Post-Deployment
- [ ] Deployment report created
- [ ] Issues documented
- [ ] Lessons learned captured
- [ ] Process improvements identified
- [ ] Team debriefed

---

**Remember:**
- Monitor actively for first 15 minutes
- Have rollback plan ready
- Document everything
- Learn from every deployment
- Improve process continuously

**Last Updated**: 2025-10-21
