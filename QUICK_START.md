# Extract Website Data - Quick Start Guide

## ✅ Local Development (ALREADY WORKING!)

Your local setup is ready to use:
- ✅ Puppeteer installed and tested
- ✅ Screenshots working
- ✅ Dynamic content loading functional
- ✅ No additional setup needed

Test it:
```bash
node test-puppeteer.mjs
```

---

## 🚀 Production Deployment (Choose One)

### **Option 1: Browserless.io** (Recommended for Vercel/Netlify)

**Setup in 5 minutes:**

1. **Sign up (free):**
   ```
   https://www.browserless.io/
   ```

2. **Get your token:**
   - Go to Dashboard → API Keys
   - Copy your token

3. **Add to Vercel/Netlify:**
   ```bash
   # Vercel
   vercel env add BROWSERLESS_TOKEN

   # Netlify
   netlify env:set BROWSERLESS_TOKEN your_token_here
   ```

4. **Deploy:**
   ```bash
   git push
   ```

**That's it!** The Extract Website Data node will automatically use Browserless.io in production.

**Cost:**
- Free: 6 hours/month
- Paid: $40/month for 40 hours

---

### **Option 2: Docker (VPS/AWS/DigitalOcean)**

**If you're deploying with Docker:**

1. **Use the provided Dockerfile in PUPPETEER_SETUP.md**

2. **Build:**
   ```bash
   docker build -t chainreact-app .
   ```

3. **Run:**
   ```bash
   docker run -p 3000:3000 chainreact-app
   ```

**No environment variables needed** - Puppeteer runs locally in the container.

---

## 🎯 How It Works

### **Automatic Selection:**

The code automatically chooses the best method:

```
Has BROWSERLESS_TOKEN?
  ├─ YES → Use Browserless.io (remote browser)
  └─ NO  → Use local Puppeteer

Puppeteer fails?
  └─ Fallback to regular fetch() (static HTML only)
```

### **When Puppeteer is Used:**

- ✅ User enables "Wait for Dynamic Content"
- ✅ User enables "Include Screenshot"

### **When Regular Fetch is Used:**

- ✅ Static websites (faster, no overhead)
- ✅ User doesn't need JS rendering or screenshots

---

## 📊 Performance Comparison

| Method | Speed | Works on Serverless | Dynamic Content | Screenshots |
|--------|-------|---------------------|-----------------|-------------|
| **Regular Fetch** | ⚡ Fast (100-500ms) | ✅ Yes | ❌ No | ❌ No |
| **Local Puppeteer** | 🐢 Slow (2-5s) | ❌ No | ✅ Yes | ✅ Yes |
| **Browserless.io** | 🏃 Medium (1-3s) | ✅ Yes | ✅ Yes | ✅ Yes |

---

## 🧪 Testing

### **Test Local Puppeteer:**
```bash
node test-puppeteer.mjs
```

### **Test in Workflow:**

1. Create a workflow with "Extract Website Data" node
2. Configure:
   - URL: `https://example.com`
   - Extraction Method: CSS Selectors
   - CSS Selector: `h1` → `title`
   - ✅ Enable "Wait for Dynamic Content"
   - ✅ Enable "Include Screenshot"
3. Run workflow
4. Check output for:
   - `data.title` (extracted text)
   - `screenshot` (base64 string)
   - `screenshotUrl` (data URL)

---

## 🐛 Troubleshooting

### **"Puppeteer failed to launch"**

**On Vercel/Netlify:**
- ✅ Add BROWSERLESS_TOKEN to environment variables
- ✅ Redeploy

**On Docker/VPS:**
- ✅ Install Chrome: `sudo apt install chromium`
- ✅ Set env: `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`

### **"Navigation timeout"**

Increase timeout in node config:
- Current: 30 seconds
- Try: 60 seconds

Or disable "Wait for Dynamic Content" if the site loads slowly.

### **Screenshots not working**

1. Check if BROWSERLESS_TOKEN is set (for serverless)
2. Check if Chromium is installed (for VPS)
3. Check logs for screenshot errors

---

## 💰 Cost Comparison

| Deployment | Monthly Cost | Setup Time | Best For |
|------------|--------------|------------|----------|
| **Browserless (free)** | $0 (6 hrs) | 5 min | Testing, low volume |
| **Browserless (paid)** | $40 (40 hrs) | 5 min | Production |
| **VPS + Local Puppeteer** | $5-10 (DigitalOcean) | 30 min | High volume |
| **AWS Lambda + Layer** | Pay per use | 2 hrs | AWS-only |

---

## 📚 Learn More

- Full setup guide: See `PUPPETEER_SETUP.md`
- Test script: Run `node test-puppeteer.mjs`
- Environment variables: Copy `.env.example` to `.env.local`

---

## 🎉 Summary

**For Local Development:**
- ✅ Already working!
- ✅ No setup needed

**For Production (Vercel/Netlify):**
1. Sign up at https://www.browserless.io/ (free)
2. Add token to environment variables
3. Deploy

**For Production (Docker/VPS):**
1. Use provided Dockerfile
2. Deploy

**Total Setup Time:** 5-10 minutes
