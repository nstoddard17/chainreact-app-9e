# Vercel Environment Setup Guide

Complete guide for configuring Vercel for development and production deployments with separate environments.

## Overview

ChainReact uses a dual-environment setup:
- **Development**: `development` branch → dev deployment
- **Production**: `main` branch → production deployment

Each environment has:
- Separate Supabase project
- Separate OAuth applications
- Separate webhook URLs
- Separate environment variables

## Prerequisites

- Vercel account with project created
- GitHub repository connected to Vercel
- Supabase development project
- Supabase production project
- OAuth apps configured for each environment

---

## Step 1: Git Branch Configuration

### In Vercel Dashboard

1. Go to your Vercel project
2. Navigate to **Settings → Git**
3. Configure branches:

```
Production Branch: main
```

4. Under "Ignored Build Step":
   - Leave default (build all branches)

5. Enable automatic deployments:
   - ✅ Deploy on push to production branch
   - ✅ Deploy on push to preview branches

### What This Does

- Pushing to `main` → Deploys to **production** (chainreact.app)
- Pushing to `development` → Deploys to **preview** (chainreact-dev.vercel.app)
- Pushing to any other branch → Deploys to unique preview URL

---

## Step 2: Domain Configuration

### In Vercel Dashboard

1. Navigate to **Settings → Domains**
2. Add production domain:

```
Domain: chainreact.app
Branch: main (production)
```

3. Click **Add**
4. Configure DNS (if you own the domain):
   - Add CNAME record: `@ → cname.vercel-dns.com`
   - Or A record pointing to Vercel IPs

5. Add development subdomain (optional but recommended):

```
Domain: dev.chainreact.app
Branch: development (preview)
```

### Vercel-Provided Domains

You'll automatically get:
- Production: `chainreact-[hash].vercel.app`
- Development: `chainreact-dev-[hash].vercel.app`

### Domain Summary

After configuration, you'll have:

**Production (main branch):**
- `https://chainreact.app` (custom domain)
- `https://chainreact-[hash].vercel.app` (Vercel domain)

**Development (development branch):**
- `https://dev.chainreact.app` (custom subdomain)
- `https://chainreact-dev-[hash].vercel.app` (Vercel domain)

---

## Step 3: Environment Variables

### Variable Hierarchy

Vercel has three environment types:
1. **Production** - Used when `main` branch deploys
2. **Preview** - Used for `development` and other branches
3. **Development** - Used for `vercel dev` locally (optional)

### Setting Environment Variables

1. Navigate to **Settings → Environment Variables**
2. For each variable below:
   - Enter **Key**
   - Enter **Value**
   - Select environments to apply to
   - Click **Add**

### Required Variables

#### Production Environment Variables

**Supabase (Production Project)**
```bash
Key: NEXT_PUBLIC_SUPABASE_URL
Value: https://xzwsdwllmrnrgbltibxt.supabase.co
Environments: ✅ Production

Key: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
Value: [production-anon-key]
Environments: ✅ Production

Key: SUPABASE_SECRET_KEY
Value: [production-service-role-key]
Environments: ✅ Production
```

**Base URL (Production)**
```bash
Key: NEXT_PUBLIC_BASE_URL
Value: https://chainreact.app
Environments: ✅ Production
```

**OAuth - Google (Production)**
```bash
Key: GOOGLE_CLIENT_ID
Value: [production-google-client-id]
Environments: ✅ Production

Key: GOOGLE_CLIENT_SECRET
Value: [production-google-client-secret]
Environments: ✅ Production
```

**OAuth - Microsoft (Production)**
```bash
Key: MICROSOFT_CLIENT_ID
Value: [production-microsoft-client-id]
Environments: ✅ Production

Key: MICROSOFT_CLIENT_SECRET
Value: [production-microsoft-client-secret]
Environments: ✅ Production
```

**OAuth - Slack (Production)**
```bash
Key: SLACK_CLIENT_ID
Value: [production-slack-client-id]
Environments: ✅ Production

Key: SLACK_CLIENT_SECRET
Value: [production-slack-client-secret]
Environments: ✅ Production
```

**OAuth - Discord (Production)**
```bash
Key: DISCORD_CLIENT_ID
Value: [production-discord-client-id]
Environments: ✅ Production

Key: DISCORD_CLIENT_SECRET
Value: [production-discord-client-secret]
Environments: ✅ Production
```

**OAuth - Notion (Production)**
```bash
Key: NOTION_CLIENT_ID
Value: [production-notion-client-id]
Environments: ✅ Production

Key: NOTION_CLIENT_SECRET
Value: [production-notion-client-secret]
Environments: ✅ Production
```

**OAuth - Airtable (Production)**
```bash
Key: AIRTABLE_CLIENT_ID
Value: [production-airtable-client-id]
Environments: ✅ Production

Key: AIRTABLE_CLIENT_SECRET
Value: [production-airtable-client-secret]
Environments: ✅ Production
```

**AI/LLM APIs (Can be shared or separate)**
```bash
Key: OPENAI_API_KEY
Value: [openai-api-key]
Environments: ✅ Production ✅ Preview

Key: ANTHROPIC_API_KEY
Value: [anthropic-api-key]
Environments: ✅ Production ✅ Preview
```

**Add all other OAuth providers similarly...**

#### Preview/Development Environment Variables

**Supabase (Development Project)**
```bash
Key: NEXT_PUBLIC_SUPABASE_URL
Value: https://[dev-project-ref].supabase.co
Environments: ✅ Preview

Key: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
Value: [development-anon-key]
Environments: ✅ Preview

Key: SUPABASE_SECRET_KEY
Value: [development-service-role-key]
Environments: ✅ Preview
```

**Base URL (Development)**
```bash
Key: NEXT_PUBLIC_BASE_URL
Value: https://dev.chainreact.app
Environments: ✅ Preview

# OR if using Vercel-provided domain:
Value: https://chainreact-dev-[your-hash].vercel.app
```

**OAuth Credentials (Development)**
```bash
# Option 1: Use same OAuth apps (easier)
# Just add development redirect URLs to existing apps

# Option 2: Create separate OAuth apps for development (recommended)
Key: GOOGLE_CLIENT_ID
Value: [development-google-client-id]
Environments: ✅ Preview

Key: GOOGLE_CLIENT_SECRET
Value: [development-google-client-secret]
Environments: ✅ Preview

# Repeat for all OAuth providers...
```

### Environment Variable Checklist

Use this to ensure all variables are set:

**Production Environment:**
- [ ] `NEXT_PUBLIC_SUPABASE_URL` (production project)
- [ ] `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (production)
- [ ] `SUPABASE_SECRET_KEY` (production)
- [ ] `NEXT_PUBLIC_BASE_URL` (production domain)
- [ ] `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`
- [ ] `MICROSOFT_CLIENT_ID` + `MICROSOFT_CLIENT_SECRET`
- [ ] `SLACK_CLIENT_ID` + `SLACK_CLIENT_SECRET`
- [ ] `DISCORD_CLIENT_ID` + `DISCORD_CLIENT_SECRET`
- [ ] `NOTION_CLIENT_ID` + `NOTION_CLIENT_SECRET`
- [ ] `AIRTABLE_CLIENT_ID` + `AIRTABLE_CLIENT_SECRET`
- [ ] All other OAuth providers
- [ ] AI/LLM API keys

**Preview/Development Environment:**
- [ ] `NEXT_PUBLIC_SUPABASE_URL` (development project)
- [ ] `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (development)
- [ ] `SUPABASE_SECRET_KEY` (development)
- [ ] `NEXT_PUBLIC_BASE_URL` (development domain)
- [ ] All OAuth credentials (same or separate)
- [ ] AI/LLM API keys

---

## Step 4: OAuth Application Configuration

For each OAuth provider, you need to configure redirect URLs to include both environments.

### Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your project (or create separate dev/prod projects)
3. Navigate to **APIs & Services → Credentials**
4. Edit OAuth 2.0 Client ID
5. Under "Authorized redirect URIs", add:

**Production:**
```
https://chainreact.app/api/auth/callback/google
```

**Development:**
```
https://dev.chainreact.app/api/auth/callback/google
```

**Local (optional):**
```
http://localhost:3000/api/auth/callback/google
```

### Microsoft OAuth

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory → App registrations**
3. Select your app (or create separate dev/prod apps)
4. Go to **Authentication**
5. Under "Redirect URIs", add:

**Production:**
```
https://chainreact.app/api/auth/callback/microsoft
```

**Development:**
```
https://dev.chainreact.app/api/auth/callback/microsoft
```

### Slack OAuth

1. Go to [Slack API](https://api.slack.com/apps)
2. Select your app
3. Go to **OAuth & Permissions**
4. Under "Redirect URLs", add:

**Production:**
```
https://chainreact.app/api/auth/callback/slack
```

**Development:**
```
https://dev.chainreact.app/api/auth/callback/slack
```

### Discord OAuth

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your application
3. Go to **OAuth2**
4. Under "Redirects", add:

**Production:**
```
https://chainreact.app/api/auth/callback/discord
```

**Development:**
```
https://dev.chainreact.app/api/auth/callback/discord
```

### Notion OAuth

1. Go to [Notion Integrations](https://www.notion.so/my-integrations)
2. Select your integration
3. Under "Redirect URIs", add:

**Production:**
```
https://chainreact.app/api/auth/callback/notion
```

**Development:**
```
https://dev.chainreact.app/api/auth/callback/notion
```

### Airtable OAuth

1. Go to [Airtable](https://airtable.com/create/oauth)
2. Edit your OAuth integration
3. Add redirect URIs:

**Production:**
```
https://chainreact.app/api/auth/callback/airtable
```

**Development:**
```
https://dev.chainreact.app/api/auth/callback/airtable
```

### OAuth Configuration Checklist

- [ ] Google redirect URIs updated
- [ ] Microsoft redirect URIs updated
- [ ] Slack redirect URIs updated
- [ ] Discord redirect URIs updated
- [ ] Notion redirect URIs updated
- [ ] Airtable redirect URIs updated
- [ ] All other providers configured
- [ ] Test OAuth flow on development
- [ ] Test OAuth flow on production

---

## Step 5: Webhook Configuration

### Understanding Webhook URLs

Webhooks from external services (Gmail, Slack, Airtable, etc.) need to know where to send notifications. This URL is built using `NEXT_PUBLIC_BASE_URL`.

**Production:**
- Base URL: `https://chainreact.app`
- Webhook URL: `https://chainreact.app/api/webhooks/[provider]`

**Development:**
- Base URL: `https://dev.chainreact.app`
- Webhook URL: `https://dev.chainreact.app/api/webhooks/[provider]`

### Webhook URL Environment Variable

**Critical:** Set `NEXT_PUBLIC_BASE_URL` correctly for each environment:

**Production:**
```bash
NEXT_PUBLIC_BASE_URL=https://chainreact.app
```

**Development:**
```bash
NEXT_PUBLIC_BASE_URL=https://dev.chainreact.app
```

### How Webhooks Are Registered

ChainReact uses the Trigger Lifecycle Pattern:
1. User activates workflow
2. System calls `onActivate()` on trigger
3. Trigger registers webhook with provider using `NEXT_PUBLIC_BASE_URL`
4. Provider stores webhook URL
5. Provider sends notifications to that URL

**Important:** When you deploy to a new environment, you must:
1. Ensure `NEXT_PUBLIC_BASE_URL` is correct
2. Deactivate and reactivate workflows to register new webhook URLs

### Verifying Webhook Configuration

After setting up environment:

```bash
# Check production webhook URLs
# In Supabase SQL editor connected to production project
SELECT workflow_id, external_id, metadata
FROM trigger_resources
WHERE status = 'active';

# Verify URLs contain production domain
```

---

## Step 6: Supabase Project Setup

### Creating Separate Supabase Projects

**Why separate projects?**
- Prevent development data from mixing with production
- Test database migrations safely
- Different access patterns and scaling needs
- Security isolation

### Development Project

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Click "New Project"
3. Configure:
   - **Name**: ChainReact Development
   - **Database Password**: [secure password]
   - **Region**: [same as production for consistency]
4. Wait for project creation (~2 minutes)
5. Copy credentials:
   - Project URL: `https://[dev-ref].supabase.co`
   - Anon Key: [anon-key]
   - Service Role Key: [service-role-key]

### Production Project

1. Create another project
2. Configure:
   - **Name**: ChainReact Production
   - **Database Password**: [different secure password]
   - **Region**: [closest to users]
3. Copy credentials

### Linking Projects Locally

**Development:**
```bash
export SUPABASE_ACCESS_TOKEN="your-access-token"
supabase link --project-ref [dev-project-ref]
```

**Production:**
```bash
# BE VERY CAREFUL - this is production!
supabase link --project-ref [prod-project-ref]
```

### Applying Migrations

**Development (safe to experiment):**
```bash
supabase link --project-ref [dev-project-ref]
supabase db push
```

**Production (requires care):**
```bash
# Always test on development first!
supabase link --project-ref [prod-project-ref]

# Review what will be applied
supabase db diff

# Apply migrations
supabase db push
```

### Supabase Configuration Checklist

- [ ] Development project created
- [ ] Production project created
- [ ] Development credentials in Vercel (Preview env)
- [ ] Production credentials in Vercel (Production env)
- [ ] Local Supabase CLI linked to dev project
- [ ] Migrations applied to development
- [ ] Migrations tested on development
- [ ] Migrations applied to production (when ready)

---

## Step 7: Initial Deployment

### Deploy Development Branch

```bash
# Create development branch if needed
git checkout -b development
git push origin development
```

Vercel will automatically:
1. Detect push to `development` branch
2. Start build using Preview environment variables
3. Deploy to preview URL
4. Make available at `https://dev.chainreact.app`

### Deploy Production Branch

```bash
# Merge development to main when ready
git checkout main
git merge development
git push origin main
```

Vercel will automatically:
1. Detect push to `main` branch
2. Start build using Production environment variables
3. Deploy to production URL
4. Make available at `https://chainreact.app`

### Verify Deployments

**Development:**
1. Go to `https://dev.chainreact.app`
2. Open browser DevTools (F12)
3. Check console for environment:
   ```javascript
   console.log(process.env.NEXT_PUBLIC_SUPABASE_URL)
   // Should show development Supabase URL
   ```
4. Test login
5. Test creating workflow
6. Verify development database has data

**Production:**
1. Go to `https://chainreact.app`
2. Verify production Supabase URL in console
3. Test login
4. Verify production database separate from dev

---

## Step 8: Testing & Validation

### Environment Variable Verification

**Development deployment:**
```bash
# View environment variables used in build
# Vercel Dashboard → Deployments → Latest Development → Environment Variables
```

Verify:
- Supabase URL is development project
- Base URL is development domain
- OAuth credentials are for development

**Production deployment:**
```bash
# View environment variables used in build
# Vercel Dashboard → Deployments → Latest Production → Environment Variables
```

Verify:
- Supabase URL is production project
- Base URL is production domain
- OAuth credentials are for production

### Integration Testing

**On Development:**
1. Connect Google integration
2. Create workflow with Gmail trigger
3. Activate workflow
4. Send test email
5. Verify workflow executes
6. Check `trigger_resources` in dev Supabase
7. Verify webhook URL contains dev domain

**On Production (when ready):**
1. Repeat same tests
2. Verify production database separate
3. Verify webhook URLs contain production domain

### Database Isolation Test

```sql
-- In development Supabase
INSERT INTO test_table VALUES ('development-test');

-- In production Supabase
SELECT * FROM test_table;
-- Should NOT contain 'development-test'
```

If data appears in both, you have a configuration problem!

---

## Step 9: Ongoing Management

### Updating Environment Variables

**When to update:**
- OAuth credentials change
- Supabase projects change
- Domain changes
- Adding new integrations

**How to update:**
1. Vercel Dashboard → Settings → Environment Variables
2. Find variable to update
3. Click "Edit"
4. Update value
5. Click "Save"
6. **Redeploy** for changes to take effect:
   - Go to Deployments
   - Find latest deployment
   - Click "..." → "Redeploy"

**Important:** Environment variables are baked into the build. You must redeploy for changes to take effect.

### Adding New Environment Variables

1. Settings → Environment Variables
2. Click "Add New"
3. Enter key, value
4. Select environments (Production, Preview, Development)
5. Click "Save"
6. Redeploy affected environments

### Monitoring Deployments

**Vercel Dashboard:**
- Go to Deployments tab
- See all deployments (production and preview)
- Check build logs
- Monitor for errors

**GitHub Integration:**
- Vercel comments on PRs with preview URL
- See deployment status in GitHub
- Easy to share preview links with team

---

## Troubleshooting

### Issue: Wrong Database Used

**Symptoms:**
- Development data appears in production
- Production data in development
- Can't find expected data

**Cause:**
Environment variable pointing to wrong Supabase project

**Solution:**
1. Verify `NEXT_PUBLIC_SUPABASE_URL` in Vercel env vars
2. Check it matches the intended Supabase project
3. Update if wrong
4. Redeploy

### Issue: OAuth Redirect Error

**Symptoms:**
- "Redirect URI mismatch" error
- OAuth flow fails after authorization

**Cause:**
OAuth app not configured with deployment URL

**Solution:**
1. Check deployment URL (e.g., `https://dev.chainreact.app`)
2. Go to OAuth provider console
3. Add redirect URI: `https://dev.chainreact.app/api/auth/callback/[provider]`
4. Test again

### Issue: Webhooks Not Received

**Symptoms:**
- Workflows don't execute
- No webhook entries in database

**Cause:**
`NEXT_PUBLIC_BASE_URL` incorrect or workflows not reactivated

**Solution:**
1. Verify `NEXT_PUBLIC_BASE_URL` env var
2. Redeploy if changed
3. Deactivate and reactivate workflows
4. Check `trigger_resources` table for correct URLs

### Issue: Build Fails

**Symptoms:**
- Deployment shows "Error" status
- Build logs show errors

**Common causes:**
1. Missing environment variable
2. TypeScript error
3. Dependency issue
4. Out of memory

**Solution:**
1. Check build logs for specific error
2. Ensure all required env vars set
3. Fix TypeScript errors locally: `npm run build`
4. Update dependencies if needed

### Issue: Environment Variables Not Applied

**Symptoms:**
- Code uses old/wrong environment variable value
- Changes to env vars don't take effect

**Cause:**
Environment variables are baked into build. Must redeploy.

**Solution:**
1. After changing env var, go to Deployments
2. Find latest deployment for that environment
3. Click "..." → "Redeploy"
4. Wait for new build
5. Verify new value used

---

## Best Practices

### ✅ DO

- **Separate Supabase projects** for dev and production
- **Test on development** before deploying to production
- **Use environment-specific OAuth apps** (or add all redirect URIs)
- **Set `NEXT_PUBLIC_BASE_URL`** correctly for each environment
- **Redeploy after env var changes** to apply updates
- **Monitor deployments** for first 15 minutes
- **Keep secrets secure** - never commit to git

### ❌ DON'T

- **Point development to production database** - data corruption risk
- **Skip testing on development** - find bugs in production
- **Hardcode URLs** - use `NEXT_PUBLIC_BASE_URL`
- **Share OAuth credentials** between environments (unless intentional)
- **Forget to redeploy** after env var changes
- **Expose secrets** in client code or logs

---

## Quick Reference

### Deployment URLs

```
Production (main):        https://chainreact.app
Development (development): https://dev.chainreact.app
Feature branches:          https://chainreact-[branch]-[hash].vercel.app
```

### Environment Variable Environments

```
Production → main branch deployments
Preview → development and feature branches
Development → vercel dev (local)
```

### Common Commands

```bash
# Link to development Supabase
supabase link --project-ref [dev-ref]

# Link to production Supabase (careful!)
supabase link --project-ref [prod-ref]

# Apply migrations
supabase db push

# View deployments
vercel ls

# View logs
vercel logs --follow

# Redeploy latest
vercel --prod  # production
vercel          # preview
```

### Critical Environment Variables

```bash
# Must be different for each environment
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
NEXT_PUBLIC_BASE_URL

# Can be same or different
OAuth credentials (GOOGLE_CLIENT_ID, etc.)
AI API keys (OPENAI_API_KEY, etc.)
```

---

## Additional Resources

- [Vercel Environment Variables Documentation](https://vercel.com/docs/concepts/projects/environment-variables)
- [Vercel Domains Documentation](https://vercel.com/docs/concepts/projects/domains)
- [Supabase Projects Documentation](https://supabase.com/docs/guides/platform/going-into-prod)
- `/learning/docs/development-to-production-workflow.md` - Deployment workflow
- `/learning/checklists/pre-production-deployment.md` - Pre-deploy checklist

**Last Updated**: 2025-10-21
