# Pre-Production Deployment Checklist

Use this checklist before merging `development` → `main` to ensure safe, successful production deployments.

## Quick Start

```bash
# Before starting checklist
git checkout development
git pull origin development
npm run build  # Must succeed before proceeding
```

---

## 1. Code Quality & Build

### Build & Compile
- [ ] `npm run build` completes successfully with no errors
- [ ] `npm run lint` passes with no errors
- [ ] TypeScript compilation has no errors
- [ ] No unresolved merge conflicts

### Code Review
- [ ] All console.log/console.error/console.warn removed or justified
- [ ] No commented-out code blocks
- [ ] No TODO/FIXME comments that block deployment
- [ ] No debug code (debugger statements, test credentials)
- [ ] Logging follows `/learning/docs/logging-best-practices.md` (no tokens/PII)

### Dependencies
- [ ] No unnecessary dependencies added
- [ ] All dependencies in package.json are actively used
- [ ] No security vulnerabilities (`npm audit`)
- [ ] Dependencies compatible with production Node version

---

## 2. Testing & Quality Assurance

### Development Deployment Testing
- [ ] Feature tested on development deployment (chainreact-dev.vercel.app)
- [ ] All user flows tested end-to-end
- [ ] Error states tested (network errors, validation errors, etc.)
- [ ] Loading states tested (slow network simulation)
- [ ] Empty states tested (no data, no results)

### Cross-Browser Testing
- [ ] Chrome (desktop)
- [ ] Safari (desktop)
- [ ] Firefox (desktop)
- [ ] Mobile Safari (iOS)
- [ ] Mobile Chrome (Android)

### Responsive Design
- [ ] Desktop (1920px, 1440px, 1280px)
- [ ] Tablet (768px, 1024px)
- [ ] Mobile (375px, 414px)
- [ ] No horizontal scrolling on small screens
- [ ] Touch targets adequate on mobile

### Performance
- [ ] Page load time acceptable (<3s on 3G)
- [ ] No memory leaks observed
- [ ] Large data sets handled gracefully
- [ ] Images/assets optimized
- [ ] No bundle size regressions

### Beta Tester Validation
- [ ] Beta testers have tested on development
- [ ] User feedback addressed or documented
- [ ] No critical bugs reported
- [ ] UX improvements validated

---

## 3. Database & Migrations

### Migration Review
- [ ] All migration files in `/supabase/migrations/` reviewed
- [ ] Migration naming follows convention: `YYYYMMDD_description.sql`
- [ ] Migrations tested on development database
- [ ] Migrations run successfully without errors

### Backwards Compatibility
- [ ] Migrations are backwards-compatible (or multi-step plan exists)
- [ ] No columns dropped that are still used in code
- [ ] New required columns have default values or allow NULL initially
- [ ] Foreign key constraints won't break existing data

### Data Integrity
- [ ] No data loss in migrations
- [ ] Data transformations tested and verified
- [ ] Indexes added for new query patterns
- [ ] Check constraints validated

### RLS Policies
- [ ] RLS policies created for new tables
- [ ] Existing RLS policies updated if schema changed
- [ ] RLS policies tested (can't access other users' data)
- [ ] Service role bypasses RLS where appropriate

### Migration Plan
- [ ] Migration order documented
- [ ] Rollback plan exists if migration fails
- [ ] Consider applying migrations before code deployment
- [ ] Large migrations split into smaller batches

---

## 4. API & Backend Changes

### API Compatibility
- [ ] No breaking API changes (or properly versioned with `/api/v2/`)
- [ ] API responses backwards-compatible
- [ ] New required fields have defaults
- [ ] Old client bundles can still call APIs

### Error Handling
- [ ] All API routes have try-catch blocks
- [ ] Errors return appropriate status codes (400, 404, 500)
- [ ] Error messages are user-friendly (no stack traces to client)
- [ ] Validation errors specify which fields failed

### Rate Limiting
- [ ] Rate limiting considered for expensive endpoints
- [ ] No endpoints vulnerable to abuse
- [ ] Webhook endpoints have validation

### Server-Side Logic
- [ ] Server actions properly implemented
- [ ] No client-side secrets (API keys, service roles)
- [ ] Proper authentication checks on all protected routes
- [ ] Authorization logic verified (RLS + code)

---

## 5. Integrations & External Services

### Webhook Configuration
- [ ] `NEXT_PUBLIC_BASE_URL` set to production URL in Vercel env vars
- [ ] Webhook URLs will point to production after deployment
- [ ] Webhook signatures/validation working
- [ ] Trigger resources will be recreated on workflow activation

### OAuth & Authentication
- [ ] OAuth redirect URLs include production domain
  - Google: `https://chainreact.app/api/auth/callback/google`
  - Microsoft: `https://chainreact.app/api/auth/callback/microsoft`
  - Etc.
- [ ] OAuth apps approved for production use (no "unverified app" warnings)
- [ ] Session handling works correctly
- [ ] Logout flow tested

### Third-Party APIs
- [ ] Production API keys set in Vercel environment variables
- [ ] API rate limits understood and handled
- [ ] API credentials have necessary scopes/permissions
- [ ] Fallback behavior for API failures

### Integration Testing
- [ ] Gmail integration tested
- [ ] Slack integration tested
- [ ] Discord integration tested
- [ ] Microsoft/Outlook integration tested
- [ ] Airtable integration tested
- [ ] At least one workflow per integration type tested

---

## 6. Environment Variables

### Vercel Production Environment
- [ ] All required environment variables set
- [ ] No development URLs in production env vars
- [ ] Database URLs point to production Supabase
- [ ] OAuth credentials are production credentials
- [ ] `NEXT_PUBLIC_BASE_URL=https://chainreact.app`

### Required Variables Checklist
- [ ] `NEXT_PUBLIC_SUPABASE_URL` (production project)
- [ ] `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (production project)
- [ ] `SUPABASE_SECRET_KEY` (production project)
- [ ] `GOOGLE_CLIENT_ID` (production)
- [ ] `GOOGLE_CLIENT_SECRET` (production)
- [ ] All other OAuth provider credentials
- [ ] `NEXT_PUBLIC_BASE_URL` (production domain)
- [ ] Any AI/LLM API keys (OpenAI, Anthropic, etc.)

### Secrets Security
- [ ] No secrets committed to git
- [ ] Secrets rotated if accidentally exposed
- [ ] Environment variables not logged
- [ ] `.env.local` in `.gitignore`

---

## 7. Security

### Authentication & Authorization
- [ ] All protected routes require authentication
- [ ] RLS policies prevent unauthorized data access
- [ ] No user can access another user's data
- [ ] Admin features properly protected

### Input Validation
- [ ] All user inputs validated (client and server)
- [ ] SQL injection prevented (parameterized queries only)
- [ ] XSS prevention (no dangerouslySetInnerHTML without sanitization)
- [ ] File uploads validated (type, size, content)

### API Security
- [ ] CORS configured correctly
- [ ] CSRF protection where applicable
- [ ] Rate limiting on public endpoints
- [ ] API keys not exposed in client code

### Data Privacy
- [ ] No PII logged to console or files
- [ ] Sensitive data encrypted at rest (Supabase handles this)
- [ ] Integration tokens encrypted (AES-256)
- [ ] Compliance with privacy regulations (GDPR, etc.)

---

## 8. Frontend & UI

### User Experience
- [ ] Loading states show for async operations
- [ ] Error messages are helpful and actionable
- [ ] Success confirmations shown for actions
- [ ] Form validation provides clear feedback

### Accessibility
- [ ] Keyboard navigation works
- [ ] Screen reader tested (basic flows)
- [ ] Color contrast meets WCAG AA standards
- [ ] Focus indicators visible

### Assets & Media
- [ ] Images optimized (WebP/AVIF)
- [ ] No broken image links
- [ ] Favicon set
- [ ] Open Graph tags for social sharing

### Browser Compatibility
- [ ] No modern JS features unsupported in target browsers
- [ ] Polyfills included if needed
- [ ] Graceful degradation for older browsers

---

## 9. Documentation

### Code Documentation
- [ ] New features documented in relevant `/learning/docs/` guides
- [ ] Breaking changes documented
- [ ] Complex logic has comments explaining "why"
- [ ] API changes documented

### Changelog
- [ ] `/learning/logs/CHANGELOG.md` updated with changes
- [ ] Version number incremented (if applicable)
- [ ] Breaking changes clearly marked
- [ ] Migration steps documented

### Deployment Notes
- [ ] Special deployment steps documented (if any)
- [ ] Environment variable changes noted
- [ ] Database migration steps documented
- [ ] Rollback plan documented

---

## 10. Monitoring & Observability

### Logging
- [ ] Important events logged (workflow executions, errors, etc.)
- [ ] Logs follow best practices (no secrets, no PII)
- [ ] Log levels appropriate (error, warn, info, debug)
- [ ] Structured logging for easy parsing

### Error Tracking
- [ ] Error boundaries in place for React components
- [ ] Unhandled promise rejections caught
- [ ] Error tracking service configured (Sentry, etc.) - optional
- [ ] Critical errors have alerting - optional

### Metrics
- [ ] Key metrics tracked (workflows executed, errors, response times)
- [ ] Vercel analytics enabled - optional
- [ ] Database performance monitored via Supabase dashboard

---

## 11. Final Pre-Merge Steps

### Git Hygiene
- [ ] All changes committed
- [ ] Commit messages are descriptive
- [ ] No WIP commits or temporary commits
- [ ] Branch up to date with latest development
  ```bash
  git checkout development
  git pull origin development
  ```

### Build Verification
- [ ] Final build test passes
  ```bash
  npm run build
  ```
- [ ] No warnings that need addressing
- [ ] Bundle size acceptable

### Team Communication
- [ ] Team notified of upcoming deployment
- [ ] Deployment time scheduled (avoid Friday afternoons!)
- [ ] Someone available to monitor deployment
- [ ] Rollback person identified

---

## 12. Merge Execution

### Standard Merge Process
```bash
# 1. Ensure development is ready
git checkout development
git pull origin development
npm run build  # Final verification

# 2. Switch to main and merge
git checkout main
git pull origin main
git merge development

# 3. Review changes one last time
git log --oneline -10
git diff origin/main

# 4. Push to trigger production deployment
git push origin main
```

### If Database Migrations Needed
```bash
# 1. Apply migrations to production database FIRST
export SUPABASE_ACCESS_TOKEN="your-token"
supabase link --project-ref [prod-project-ref]
supabase db push

# 2. Verify migrations succeeded
# Check Supabase dashboard for errors

# 3. Then deploy code
git checkout main
git merge development
git push origin main
```

---

## 13. Post-Deployment Monitoring (First 15 Minutes)

Immediately after pushing to main:

### Vercel Deployment
- [ ] Deployment started in Vercel dashboard
- [ ] Build phase completes successfully
- [ ] No build errors or warnings
- [ ] Deployment promoted to production

### Logs Monitoring
```bash
# Watch deployment logs
vercel logs --follow
```
- [ ] No error spikes in logs
- [ ] No 500 errors
- [ ] Response times normal

### Quick Smoke Tests
- [ ] Production site loads (https://chainreact.app)
- [ ] Login flow works
- [ ] Create new workflow works
- [ ] Execute test workflow succeeds
- [ ] Integration connections work

### Database Health
- [ ] Supabase logs show no errors
- [ ] Query performance normal
- [ ] No RLS policy violations
- [ ] Connection pool healthy

### Integration Health
- [ ] Test webhook from each integration type
- [ ] Verify trigger resources created
- [ ] Check webhook delivery logs

---

## Emergency Rollback Procedure

If critical issues detected after deployment:

### Option 1: Instant Vercel Rollback (Fastest)
1. Go to Vercel Dashboard → Deployments
2. Find previous successful deployment
3. Click "..." menu → "Promote to Production"
4. Instant cutover to previous version

### Option 2: Git Revert
```bash
git checkout main
git revert HEAD
git push origin main
# Triggers new deployment with previous code
```

### Option 3: Database Rollback (if migrations failed)
```bash
# Connect to production database
supabase link --project-ref [prod-project-ref]

# Manually run rollback SQL
# Or restore from backup if data corrupted
```

---

## Checklist Summary

**Total Items**: ~120 checks across 13 categories

**Minimum Required** (for small changes):
- Code builds successfully
- Tested on development deployment
- No breaking API changes
- Environment variables correct
- Database migrations backwards-compatible

**Full Checklist** (for major releases):
- Complete all sections
- Beta tester sign-off
- Team code review
- Scheduled deployment window
- Monitoring team on standby

---

## Templates

### Deployment Announcement Template

```
🚀 Production Deployment Scheduled

Date: [Date]
Time: [Time] [Timezone]
Duration: ~10 minutes
Impact: Zero downtime expected

Changes:
- [Feature 1]
- [Feature 2]
- [Bug fix 1]

Database Migrations: [Yes/No]
Rollback Plan: [Instant rollback via Vercel available]

Monitoring: [Name] will monitor for first 30 minutes
Contact: [Slack channel / Email]
```

### Post-Deployment Report Template

```
✅ Production Deployment Complete

Deployment Time: [Time]
Status: Success / Rolled Back
Build Duration: [X] minutes

Checks:
✅ Deployment successful
✅ Smoke tests passed
✅ No error spikes
✅ Integrations working
✅ Database healthy

Issues: None / [Description]

Next Steps: [Any follow-up needed]
```

---

## Notes

- **Don't skip steps**: Each check exists because we've been burned before
- **When in doubt, wait**: Better to delay than deploy broken code
- **Test on development first**: Always validate on dev deployment
- **Monitor actively**: First 15 minutes are critical
- **Have rollback ready**: Know how to roll back before you deploy

**Last Updated**: 2025-10-21
