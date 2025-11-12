# Fly.io Deployment Guide - ChainReact

## 🚀 Why Fly.io?

- ✅ **$0/month** - Free tier includes 3 shared-cpu VMs
- ✅ **Zero setup** for Puppeteer - runs locally in container
- ✅ **Global edge network** - Deploy close to users
- ✅ **Automatic HTTPS** - SSL certificates included
- ✅ **Easy scaling** - Scale up/down instantly
- ✅ **Simple deployment** - `fly deploy` and done

**Total monthly cost: $0**
- 3 VMs (256MB RAM each) = Free
- Upgrade to 1GB RAM = ~$5/month

---

## 📋 Prerequisites

1. **Fly.io account** (free): https://fly.io/app/sign-up
2. **Fly CLI installed**
3. **Git repository** with your code

---

## 🔧 Setup (15 minutes)

### Step 1: Install Fly CLI

**macOS:**
```bash
brew install flyctl
```

**Linux:**
```bash
curl -L https://fly.io/install.sh | sh
```

**Windows:**
```powershell
iwr https://fly.io/install.ps1 -useb | iex
```

### Step 2: Login to Fly.io

```bash
fly auth login
```

This opens your browser to authenticate.

### Step 3: Create Fly App

```bash
# Navigate to your project directory
cd /path/to/chainreact-app

# Launch app (interactive setup)
fly launch
```

**When prompted:**
- App name: `chainreact-app` (or your choice)
- Region: Choose closest to your users (e.g., `sjc` for San Jose)
- PostgreSQL: **No** (we're using Supabase)
- Redis: **No** (not needed)

This creates `fly.toml` (already provided in repo).

### Step 4: Set Environment Variables

```bash
# Required secrets
fly secrets set \
  NEXT_PUBLIC_SUPABASE_URL="your_supabase_url" \
  NEXT_PUBLIC_SUPABASE_ANON_KEY="your_anon_key" \
  SUPABASE_SERVICE_ROLE_KEY="your_service_role_key" \
  OPENAI_API_KEY="sk-..." \
  TAVILY_API_KEY="tvly-..." \
  STRIPE_SECRET_KEY="sk_..." \
  STRIPE_PUBLISHABLE_KEY="pk_..."

# Add other OAuth secrets as needed
fly secrets set \
  GOOGLE_CLIENT_ID="..." \
  GOOGLE_CLIENT_SECRET="..." \
  # etc.
```

**View secrets:**
```bash
fly secrets list
```

### Step 5: Apply Database Migration

**Before first deployment, apply the usage tracking migration:**

```bash
# Connect to your Supabase database and run:
# supabase/migrations/20251111000000_add_browser_automation_usage_tracking.sql

# OR use Supabase CLI:
supabase db push
```

### Step 6: Deploy

```bash
fly deploy
```

**First deployment takes ~5-10 minutes:**
- Builds Docker image
- Installs Chrome
- Compiles Next.js
- Deploys to Fly.io

**Subsequent deployments: ~3-5 minutes**

### Step 7: Verify Deployment

```bash
# Check app status
fly status

# View logs
fly logs

# Open in browser
fly open
```

---

## 🎯 Post-Deployment

### Monitor Your App

```bash
# Real-time logs
fly logs

# App metrics
fly dashboard

# VM status
fly scale show
```

### Test Extract Website Data

1. Log in to your deployed app
2. Create a workflow with "Extract Website Data" node
3. Configure:
   - Enable "Wait for Dynamic Content"
   - Enable "Include Screenshot"
4. Run workflow
5. Check execution logs

**Expected behavior:**
- ✅ Puppeteer launches successfully
- ✅ Screenshots captured
- ✅ Dynamic content loaded
- ✅ Usage tracked in database

---

## 💰 Cost Management

### Free Tier

**What's included:**
- 3 VMs with shared CPU
- 256MB RAM each
- 3GB persistent storage
- 160GB outbound data

**What this means:**
- ✅ ChainReact runs on 1 VM (2 VMs free as spare)
- ✅ Extract Website Data works unlimited
- ✅ No external costs (Browserless.io not needed)
- ✅ $0/month total

### Scaling Up (If Needed)

**Increase RAM (recommended for heavy usage):**
```bash
# Scale to 1GB RAM (~$5/month)
fly scale memory 1024

# Scale to 2GB RAM (~$10/month)
fly scale memory 2048
```

**Add more VMs (for high traffic):**
```bash
# Add 1 more VM (load balancing)
fly scale count 2

# Auto-scale based on traffic
fly autoscale set min=1 max=3
```

**Check current pricing:**
```bash
fly platform regions
fly dashboard # View billing
```

---

## 🔧 Configuration Options

### fly.toml Settings

**Current setup (included in repo):**
- 1 VM minimum running
- 1GB RAM (can adjust)
- Auto-restart on failure
- Health checks every 30s
- Rolling deployments (zero downtime)

**Adjust VM resources:**

```toml
# In fly.toml
[vm]
  cpu_kind = "shared"  # or "dedicated"
  cpus = 1             # 1-8
  memory_mb = 1024     # 256, 512, 1024, 2048, etc.
```

**Adjust concurrency:**

```toml
[http_service.concurrency]
  type = "requests"
  hard_limit = 250  # Max concurrent requests
  soft_limit = 200  # Start queuing at this
```

---

## 🐛 Troubleshooting

### Issue: Deployment fails with "out of memory"

**Solution:**
```bash
# Increase RAM during build
fly scale memory 1024
fly deploy
```

### Issue: Puppeteer fails to launch

**Check logs:**
```bash
fly logs
```

**Common causes:**
1. Chrome not installed → **Fixed in Dockerfile** ✅
2. Missing dependencies → **Installed in Dockerfile** ✅
3. Insufficient memory → Scale up RAM

**Force rebuild:**
```bash
fly deploy --no-cache
```

### Issue: App is slow to respond

**Causes:**
- VM is in wrong region (high latency)
- Insufficient RAM
- Cold start (VM was stopped)

**Solutions:**
```bash
# Keep VMs running (prevent cold starts)
fly scale count 1 --max-per-region 1

# Move to closer region
fly regions set sjc lax # West Coast US
fly regions set iad     # East Coast US
fly regions set lhr     # Europe
```

### Issue: Can't access environment variables

**Verify secrets are set:**
```bash
fly secrets list
```

**Re-set missing secrets:**
```bash
fly secrets set KEY=value
```

### Issue: Database connection fails

**Check Supabase URL:**
```bash
# Ensure NEXT_PUBLIC_SUPABASE_URL is correct
fly secrets list | grep SUPABASE
```

**Test connection:**
```bash
# SSH into VM
fly ssh console

# Check environment
env | grep SUPABASE
```

---

## 🚀 Deployment Workflow

### Development Flow

1. **Make changes locally**
2. **Test locally:** `npm run dev`
3. **Commit:** `git commit -am "changes"`
4. **Deploy:** `fly deploy`
5. **Monitor:** `fly logs`

### CI/CD (Optional)

**GitHub Actions example:**

```yaml
# .github/workflows/deploy.yml
name: Deploy to Fly.io

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

**Setup:**
1. Get Fly API token: `fly auth token`
2. Add to GitHub secrets: `FLY_API_TOKEN`
3. Push to main → auto-deploys

---

## 📊 Monitoring & Logs

### Real-Time Monitoring

```bash
# Tail logs
fly logs

# Filter by instance
fly logs -i <instance-id>

# Save logs to file
fly logs > logs.txt
```

### Metrics Dashboard

```bash
# Open metrics dashboard
fly dashboard

# VM metrics
fly status --all

# Scale history
fly scale show
```

### Health Checks

App includes health check at `/api/health`:

```typescript
// app/api/health/route.ts
export async function GET() {
  return Response.json({ status: 'ok', timestamp: new Date().toISOString() });
}
```

Fly.io pings this every 30 seconds.

---

## 🔄 Updating Your App

### Regular Updates

```bash
# Pull latest code
git pull

# Deploy
fly deploy
```

### Rollback

```bash
# List releases
fly releases

# Rollback to previous
fly releases rollback <release-number>
```

### Update Environment Variables

```bash
# Update secret
fly secrets set NEW_VAR=value

# Unset secret
fly secrets unset OLD_VAR
```

---

## 💡 Best Practices

### 1. Keep VMs Running

```toml
[http_service]
  auto_stop_machines = false  # Don't stop VMs
  auto_start_machines = true
  min_machines_running = 1    # Always 1 VM running
```

**Why:** Prevents cold starts (slow first request)

### 2. Monitor Resource Usage

```bash
# Check VM metrics
fly dashboard

# Watch for OOM (out of memory) errors
fly logs | grep -i "out of memory"
```

**If OOM occurs:** Scale up RAM

### 3. Use Health Checks

Health check ensures Fly.io knows your app is healthy:
- Failing checks → VM restart
- Too many failures → Alert

### 4. Enable Auto-Scaling (Production)

```bash
# Auto-scale 1-3 VMs based on traffic
fly autoscale set min=1 max=3
```

**Cost:** Only pay for VMs when needed

### 5. Backup Strategy

Fly.io handles app deployment, but data (Supabase) is separate:
- ✅ Supabase has automatic backups
- ✅ Workflow definitions stored in Supabase
- ✅ No data loss if Fly.io VM restarts

---

## 🎉 Success Checklist

After deployment, verify:

- [ ] App loads at your Fly.io URL
- [ ] Login works
- [ ] Workflows can be created
- [ ] Extract Website Data node works
  - [ ] Static sites work (no Puppeteer)
  - [ ] Dynamic content works (with Puppeteer)
  - [ ] Screenshots captured
- [ ] Usage tracking working (check browser_automation_logs table)
- [ ] Free users see usage limits
- [ ] Pro users have unlimited usage

---

## 📚 Additional Resources

- **Fly.io Docs:** https://fly.io/docs/
- **Fly.io Pricing:** https://fly.io/docs/about/pricing/
- **Fly.io Status:** https://status.flyio.net/
- **Support:** https://community.fly.io/

---

## 🆘 Getting Help

**Fly.io Community:**
- Discord: https://fly.io/discord
- Forum: https://community.fly.io/

**ChainReact Issues:**
- Check logs: `fly logs`
- Check status: `fly status`
- SSH into VM: `fly ssh console`

---

## 🎯 Summary

**Deployment Time:** 15 minutes
**Monthly Cost:** $0 (free tier) or $5-10 (scaled up)
**Maintenance:** Minimal (just `fly deploy` for updates)

**What You Get:**
- ✅ Unlimited Extract Website Data usage (no Browserless.io needed)
- ✅ Global edge deployment
- ✅ Automatic HTTPS
- ✅ Zero-downtime deployments
- ✅ Health monitoring
- ✅ Easy scaling

**Perfect for keeping costs low while maintaining full functionality!** 🚀
