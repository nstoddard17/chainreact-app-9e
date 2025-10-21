# Integration Environment Sync - Understanding Local vs Production

**Last Updated:** January 2025
**Issue:** Integrations connected on localhost don't appear on production

---

## 🔍 Why This Happens

**Short Answer:** Integrations are stored in the **database**, and localhost and production use **separate databases**.

### Database Architecture

```
Local Environment (localhost:3000)
  ↓
Local Supabase Instance OR Staging Database
  ├── integrations table (your local connections)
  ├── workflows table
  └── users table

Production Environment (chainreact.app)
  ↓
Production Supabase Database
  ├── integrations table (production connections)
  ├── workflows table
  └── users table
```

**Key Point:** These are completely separate databases with separate data. Connecting an integration on localhost stores the OAuth tokens in your **local database**. Production has no access to that local data.

---

## ✅ This is EXPECTED Behavior

This is actually **correct and secure** architecture:

### Why Separate Databases Matter

1. **Security Isolation**
   - Production tokens never exposed to development
   - Testing doesn't risk production data
   - OAuth secrets isolated per environment

2. **Environment Independence**
   - Local testing doesn't affect production users
   - Database migrations tested locally first
   - Each environment can have different configurations

3. **OAuth Callback URLs**
   - `localhost:3000/api/integrations/*/callback` → Local DB
   - `https://chainreact.app/api/integrations/*/callback` → Production DB
   - Each URL registers tokens in its respective database

---

## 🚀 How to Connect Integrations Properly

### For Development/Testing
✅ **Connect integrations on localhost** (for testing locally)

### For Production Use
✅ **Connect integrations on production** (https://chainreact.app)

### Important Notes
- You must connect **separately** in each environment
- User accounts ARE the same (Supabase Auth syncs across environments if using same project)
- Integration connections are NOT synced (by design)

---

## 🔄 Environment Workflow

### Recommended Development Flow

1. **Local Development**
   ```
   - Work on localhost:3000
   - Connect integrations for testing
   - Build and test workflows
   - Verify functionality
   ```

2. **Commit & Deploy**
   ```
   - Push code to GitHub
   - Vercel deploys to production
   - Code changes are deployed
   - Database data is NOT deployed
   ```

3. **Production Setup**
   ```
   - Log into production (chainreact.app)
   - Reconnect integrations
   - Workflows sync (if using same database)
   - OR manually recreate workflows
   ```

---

## 🎯 Quick Fix for Your Situation

**Problem:** "I connected Twitter on localhost but it doesn't show on production"

**Solution:** Connect Twitter again on production:

1. Go to `https://chainreact.app`
2. Navigate to Settings → Integrations
3. Find Twitter (X)
4. Click "Connect"
5. Authorize with your Twitter account
6. ✅ Now Twitter will show as connected on production

**This is a one-time setup per environment.**

---

## 🧪 Testing Strategy

### Testing Providers That Don't Support Localhost

Some providers (Twitter, Facebook, Instagram) don't allow `localhost` redirect URIs. For these:

**Option 1: Test on Production (Recommended)**
- Use https://chainreact.app for testing these providers
- Quick and reliable

**Option 2: Use ngrok for Local Testing**
```bash
# Install ngrok
brew install ngrok  # Mac
# or download from ngrok.com

# Create tunnel
ngrok http 3000

# Update .env.local
NEXT_PUBLIC_SITE_URL="https://your-ngrok-url.ngrok.io"

# Restart dev server
npm run dev

# Now Twitter OAuth will work locally
```

**Option 3: Use Staging Environment**
- Deploy to a staging URL (e.g., `staging.chainreact.app`)
- Test integrations there before production

---

## 📊 Environment Comparison

| Aspect | Local | Production |
|--------|-------|------------|
| **URL** | localhost:3000 | chainreact.app |
| **Database** | Local/Staging | Production |
| **Integrations** | Separate | Separate |
| **OAuth Tokens** | Separate | Separate |
| **User Accounts** | Shared* | Shared* |
| **Code** | Development | Deployed |
| **Workflows** | Depends** | Depends** |

\* If using same Supabase project
\*\* Workflows are in database, so depends on database setup

---

## 🔐 Security Benefits

This separation provides important security benefits:

1. **Token Isolation**
   - Your local machine never has access to production OAuth tokens
   - Production never has access to test tokens
   - Each environment is isolated

2. **Safe Testing**
   - Test Gmail integration locally without sending real emails from production account
   - Experiment with Slack without posting to production channels
   - Debug Twitter posts without affecting production timeline

3. **Environment-Specific Credentials**
   - Use test accounts locally
   - Use production accounts in production
   - Clear separation of concerns

---

## 🎓 Advanced: Environment Synchronization

If you want to sync certain data between environments:

### Option 1: Supabase Database Branching (Recommended)
```bash
# Create a branch from production
supabase db branch create feature-branch --from production

# Work on the branch
# Merge back when ready
```

### Option 2: Export/Import (Manual)
```bash
# Export workflows from production
supabase db dump --table workflows > workflows.sql

# Import to local
supabase db reset
psql -h localhost -U postgres -d postgres < workflows.sql
```

### Option 3: Shared Supabase Project
If local and production use the **same Supabase project**, workflows will sync automatically. However, this is **NOT recommended** for security reasons.

---

## 🐛 Common Misconceptions

### ❌ "If I connect on localhost, it should work on production"
**Reality:** Each environment needs separate connections because they use separate databases.

### ❌ "I should copy my OAuth tokens to production"
**Reality:** OAuth tokens are environment-specific. Each environment gets its own tokens through the OAuth flow.

### ❌ "This is a bug"
**Reality:** This is correct architecture. All modern web apps work this way.

---

## ✅ Best Practices

1. **Accept the Separation**
   - Understand local and production are separate
   - Plan for connecting integrations in each environment
   - Don't try to "sync" tokens manually

2. **Use Production for Final Testing**
   - Test integrations that don't support localhost on production
   - Or use ngrok for local testing

3. **Document Your Integrations**
   - Keep a list of which integrations need to be connected in production
   - Include this in deployment checklists

4. **Automate Where Possible**
   - Use Supabase migrations for schema changes
   - Keep integration configuration in environment variables
   - Document manual setup steps

---

## 📝 Deployment Checklist

When deploying to production, remember to:

- [ ] Deploy code to production (Vercel/hosting)
- [ ] Run database migrations if any
- [ ] Connect required integrations on production
- [ ] Test OAuth flows on production URLs
- [ ] Verify workflows execute correctly
- [ ] Check environment variables are set

---

## 🎯 Summary

**The Situation:**
- Local (localhost) and Production (chainreact.app) use separate databases
- Integrations are stored in the database
- Therefore, integrations must be connected separately in each environment

**The Solution:**
- Connect integrations on production: https://chainreact.app
- This is expected, not a bug
- Plan for this in your development workflow

**Key Takeaway:**
Environment separation is a **feature, not a bug**. It provides security, isolation, and safe testing. Once you understand this architecture, it becomes a powerful development pattern.
