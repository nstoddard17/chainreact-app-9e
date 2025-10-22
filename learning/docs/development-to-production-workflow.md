# Development to Production Deployment Workflow

## Overview
ChainReact uses a two-branch deployment strategy with separate environments to ensure production stability while enabling rapid development iteration.

## Branch Strategy

### Development Branch (`development`)
- **Purpose**: Active development, feature testing, beta user testing
- **Deployment**: Automatic deployment to development Vercel instance
- **Domain**: `chainreact-dev.vercel.app` or custom subdomain
- **Database**: Separate Supabase development project
- **Stability**: May have bugs, breaking changes, experimental features

### Production Branch (`main`)
- **Purpose**: Stable, user-facing application
- **Deployment**: Automatic deployment to production Vercel instance
- **Domain**: `chainreact.app` (production domain)
- **Database**: Production Supabase project
- **Stability**: Only thoroughly tested, stable code

## How Vercel Zero-Downtime Deployments Work

### Deployment Process
1. **Build Phase**: New version builds completely separately from live site
2. **Health Check**: Vercel validates the build succeeded
3. **Atomic Cutover**: Traffic instantly switches to new version
4. **Old Version Retained**: Previous deployment remains available for instant rollback

### What Happens to Active Users

**During Deployment (Build Phase):**
- ✅ All users continue using current production version
- ✅ No downtime or 503 errors
- ✅ No interruption to active sessions

**After Cutover:**
- ✅ New page loads get the new version
- ⚠️ Users with old client-side bundle may experience issues if APIs changed
- ⚠️ Long-lived sessions (users on site for 30+ minutes) may need to refresh

### Edge Case: Stale Client Bundles
**Problem:**
```
User loads page at 2:00 PM → Gets client bundle v1
You deploy at 2:15 PM → API changes to v2
User clicks button at 2:30 PM → v1 client calls v2 API → Potential error
```

**Solutions Implemented:**
1. **Backwards-compatible APIs** - Accept both old and new formats
2. **Graceful error handling** - Prompt user to refresh on API errors
3. **Version checking** (future) - Detect version mismatches and auto-refresh

## Vercel Environment Setup

### Required Configuration

#### 1. Git Branch Settings
**Location**: Vercel Dashboard → Project Settings → Git

```
Production Branch: main
Preview Deployments: development (and all other branches)
```

#### 2. Environment Variables
**Location**: Vercel Dashboard → Project Settings → Environment Variables

**Development Environment:**
```bash
NEXT_PUBLIC_SUPABASE_URL=https://[dev-project].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[dev-anon-key]
SUPABASE_SERVICE_ROLE_KEY=[dev-service-role-key]

# OAuth Credentials (can reuse or separate)
GOOGLE_CLIENT_ID=[same or dev-specific]
GOOGLE_CLIENT_SECRET=[same or dev-specific]
# ... (all other OAuth providers)

# Webhook URLs (CRITICAL - must point to dev deployment)
NEXT_PUBLIC_BASE_URL=https://chainreact-dev.vercel.app
```

**Production Environment:**
```bash
NEXT_PUBLIC_SUPABASE_URL=https://[prod-project].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[prod-anon-key]
SUPABASE_SERVICE_ROLE_KEY=[prod-service-role-key]

# OAuth Credentials (production apps)
GOOGLE_CLIENT_ID=[prod-client-id]
GOOGLE_CLIENT_SECRET=[prod-client-secret]
# ... (all other OAuth providers)

# Webhook URLs (CRITICAL - must point to production)
NEXT_PUBLIC_BASE_URL=https://chainreact.app
```

#### 3. Domain Configuration
**Location**: Vercel Dashboard → Project Settings → Domains

```
Production (main branch):
- chainreact.app
- www.chainreact.app

Development (development branch):
- chainreact-dev.vercel.app
- dev.chainreact.app (optional custom subdomain)
```

### Supabase Project Setup

#### Development Project
```bash
# Link to development project
export SUPABASE_ACCESS_TOKEN="your-access-token"
supabase link --project-ref [dev-project-ref]

# Apply migrations
supabase db push
```

#### Production Project
```bash
# Link to production project
supabase link --project-ref [prod-project-ref]

# Apply migrations (DO THIS CAREFULLY)
supabase db push
```

**IMPORTANT**: Keep separate Supabase projects for dev and production. Never point development code to production database.

## Development Workflow

### Daily Development
```bash
# Work on development branch
git checkout development
git pull origin development

# Make changes, test locally
npm run dev

# Commit and push
git add .
git commit -m "Add feature X"
git push origin development
# → Auto-deploys to chainreact-dev.vercel.app
```

### Testing on Development Deployment
1. Push changes to `development` branch
2. Wait for Vercel deployment (2-5 minutes)
3. Test on development URL
4. Share with beta testers if needed
5. Iterate until feature is stable

### When to Merge to Production

Merge `development` → `main` when:
- ✅ Feature is complete and thoroughly tested
- ✅ All tests pass
- ✅ Beta testers have validated on development
- ✅ Database migrations are backwards-compatible
- ✅ No breaking API changes (or properly versioned)
- ✅ Performance is acceptable
- ✅ No security vulnerabilities introduced

## Pre-Merge Checklist

Use this checklist before merging `development` → `main`:

### Code Quality
- [ ] All TypeScript errors resolved (`npm run build` succeeds)
- [ ] No ESLint errors (`npm run lint` passes)
- [ ] All console.error/console.warn removed or justified
- [ ] No TODO comments that block deployment
- [ ] No debug code or test credentials

### Testing
- [ ] Feature tested on development deployment
- [ ] Edge cases tested (empty states, errors, loading states)
- [ ] Mobile responsive (if UI changes)
- [ ] Cross-browser tested (Chrome, Safari, Firefox)
- [ ] Performance acceptable (no significant slowdowns)

### Database Migrations
- [ ] All migrations in `/supabase/migrations/` reviewed
- [ ] Migrations tested on development database
- [ ] Migrations are backwards-compatible (if possible)
- [ ] No data loss in migrations
- [ ] RLS policies updated for new tables
- [ ] Consider multi-step migration for breaking changes

### API Changes
- [ ] No breaking API changes, or properly versioned
- [ ] API responses backwards-compatible
- [ ] Error handling improved, not removed
- [ ] Rate limiting considered

### Integration & Webhooks
- [ ] Webhook URLs point to production in prod env vars
- [ ] OAuth redirect URLs include production domain
- [ ] Integration credentials updated for production
- [ ] Trigger resources will be recreated properly

### Environment Variables
- [ ] All required env vars set in Vercel production environment
- [ ] No development URLs in production env vars
- [ ] Secrets rotated if exposed in commits
- [ ] API keys valid and have correct permissions

### Security
- [ ] No secrets in code or logs
- [ ] Authentication flows tested
- [ ] Authorization/RLS policies verified
- [ ] Input validation present
- [ ] SQL injection prevention (parameterized queries)

### Documentation
- [ ] CHANGELOG.md updated with changes
- [ ] Breaking changes documented
- [ ] New features documented in relevant guides
- [ ] API changes documented

## Merge Process

### Standard Merge (Most Changes)

```bash
# Ensure development is up to date
git checkout development
git pull origin development

# Switch to main and merge
git checkout main
git pull origin main
git merge development

# Review changes one last time
git log --oneline -10

# Push to trigger production deployment
git push origin main
```

**Timeline:**
- Push to main: 0:00
- Vercel starts build: 0:00-0:01
- Build completes: 2:00-5:00
- Health checks: 5:00-5:30
- Traffic cutover: 5:30
- Old version kept for rollback

### Merge with Database Migration

If you have database migrations:

```bash
# 1. First, manually run migrations on production Supabase
export SUPABASE_ACCESS_TOKEN="your-token"
supabase link --project-ref [prod-project-ref]

# Review migrations that will be applied
supabase db diff

# Apply migrations
supabase db push

# 2. Then merge and deploy code
git checkout main
git merge development
git push origin main
```

**Why this order?**
- Migrations should be backwards-compatible
- Database changes deployed first ensures new code can use new schema
- If migration fails, don't deploy code

### Emergency Rollback

If something goes wrong after deployment:

**Option 1: Instant Rollback (Vercel Dashboard)**
1. Go to Vercel Dashboard → Deployments
2. Find previous successful deployment
3. Click "..." → "Promote to Production"
4. Instant cutover to previous version

**Option 2: Git Revert**
```bash
# Revert the merge commit
git checkout main
git revert HEAD
git push origin main
# → Triggers new deployment with previous code
```

## Post-Deployment Monitoring

### Immediate Checks (First 15 Minutes)

```bash
# Watch deployment logs
vercel logs --follow

# Check Vercel deployment status
# Dashboard → Deployments → Latest → Logs
```

**Monitor for:**
- Build errors or warnings
- Runtime errors in logs
- 500/404 error spikes
- Slow response times

### Application Health Checks

**Supabase:**
- Dashboard → Logs → Check for error spikes
- Monitor query performance
- Check RLS policy violations

**Integration Webhooks:**
- Test one workflow from each integration
- Verify webhooks are being received
- Check trigger resources created properly

**User Experience:**
- Load production site in incognito
- Test critical user flows (login, create workflow, etc.)
- Check for console errors
- Verify no broken images/assets

### Monitoring Windows

**0-15 minutes (Critical):**
- Watch deployment logs actively
- Test critical functionality immediately
- Be ready to rollback

**15 minutes - 1 hour (Important):**
- Monitor error rates
- Check webhook deliveries
- Review Supabase logs
- Test less-critical features

**1-24 hours (Validation):**
- Monitor overall error rates
- Check user reports
- Review analytics for anomalies
- Verify integrations working

## Handling Breaking Changes

### API Versioning

If you must make breaking API changes:

```typescript
// Option 1: Versioned endpoints
// Old endpoint - keep for backwards compatibility
// /app/api/workflows/[id]/route.ts

// New endpoint - new behavior
// /app/api/v2/workflows/[id]/route.ts

// Deprecate old endpoint after transition period
```

```typescript
// Option 2: Accept both formats
export async function POST(req: Request) {
  const body = await req.json()

  // Support both old and new format
  if (body.newField) {
    // Handle new format
    return handleNewFormat(body)
  } else if (body.oldField) {
    // Handle old format (backwards compatibility)
    return handleOldFormat(body)
  }

  return new Response('Invalid format', { status: 400 })
}
```

### Feature Flags

For gradual rollouts:

```typescript
// In environment variables
FEATURE_NEW_WORKFLOW_ENGINE=false  // production
FEATURE_NEW_WORKFLOW_ENGINE=true   // development

// In code
const useNewEngine = process.env.FEATURE_NEW_WORKFLOW_ENGINE === 'true'

if (useNewEngine) {
  return executeNewEngine(workflow)
} else {
  return executeOldEngine(workflow)
}
```

Enable in production by updating env var (no deployment needed).

### Multi-Step Migrations

For breaking database changes:

**Step 1: Additive (Week 1)**
```sql
-- Add new column, keep old column
ALTER TABLE workflows ADD COLUMN new_status TEXT;

-- Populate new column
UPDATE workflows SET new_status = status;
```
Deploy code that writes to both columns.

**Step 2: Transition (Week 2)**
```typescript
// Code reads from new column, writes to both
const status = workflow.new_status || workflow.status
```
Monitor for a week.

**Step 3: Removal (Week 3)**
```sql
-- Remove old column
ALTER TABLE workflows DROP COLUMN status;
```
Deploy code that only uses new column.

## Common Issues and Solutions

### Issue: Integration webhooks not working after deployment

**Cause**: Webhook URLs still point to development

**Solution**:
1. Check `NEXT_PUBLIC_BASE_URL` in production env vars
2. Deactivate and reactivate affected workflows
3. Verify `trigger_resources` table has correct URLs

### Issue: Database connection errors

**Cause**: Using development Supabase credentials in production

**Solution**:
1. Verify env vars in Vercel production environment
2. Check `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
3. Ensure they match production Supabase project

### Issue: OAuth redirects failing

**Cause**: OAuth redirect URLs not configured for production domain

**Solution**:
1. Update OAuth app redirect URLs to include production domain
2. Example for Google: `https://chainreact.app/api/auth/callback/google`
3. Update in all provider consoles (Google, Microsoft, etc.)

### Issue: Users seeing old version after deployment

**Cause**: Browser caching or service worker

**Solution**:
1. This is normal - users need to hard refresh
2. Clear cache: Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows)
3. Consider adding version detection and refresh prompt

### Issue: API errors after deployment

**Cause**: Client has old bundle, server has new API

**Solution**:
1. Make APIs backwards-compatible
2. Add graceful error handling with refresh prompt
3. Consider API versioning for breaking changes

## Best Practices

### ✅ DO
- Test thoroughly on development before merging
- Keep database migrations backwards-compatible
- Monitor deployments for first 15 minutes
- Document breaking changes
- Use feature flags for risky features
- Version APIs for breaking changes
- Keep separate Supabase projects for dev/prod
- Set up proper environment variables

### ❌ DON'T
- Merge to main without testing on development
- Make breaking database changes without migration plan
- Deploy on Friday afternoons
- Skip the pre-merge checklist
- Point development code to production database
- Hardcode URLs or credentials
- Ignore deployment warnings or errors
- Deploy without monitoring capability

## Quick Reference Commands

```bash
# Create development branch (one-time setup)
git checkout -b development
git push origin development

# Daily development workflow
git checkout development
git pull origin development
# ... make changes ...
git add .
git commit -m "Feature description"
git push origin development

# Deploy to production
git checkout main
git pull origin main
git merge development
git push origin main

# Emergency rollback
git revert HEAD
git push origin main

# Monitor deployment
vercel logs --follow

# Supabase migrations
supabase link --project-ref [project-ref]
supabase db push
```

## Additional Resources

- [Vercel Deployments Documentation](https://vercel.com/docs/deployments)
- [Supabase Migrations Guide](https://supabase.com/docs/guides/cli/local-development#database-migrations)
- `/learning/docs/logging-best-practices.md` - Security for logs
- `/learning/docs/action-trigger-implementation-guide.md` - Webhook setup
