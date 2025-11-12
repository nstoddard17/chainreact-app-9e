# Puppeteer Setup Guide

## ✅ Local Development (macOS) - ALREADY WORKING!

Your local environment is ready to go. Test confirmed:
- ✅ Chromium installed
- ✅ Screenshots working
- ✅ Dynamic content loading
- ✅ Extract Website Data node will work perfectly

No action needed for local development!

---

## 🚀 Production Deployment Options

### **Option 1: Browserless.io** (RECOMMENDED for Vercel/Netlify)

**Best for:** Serverless deployments (Vercel, Netlify, AWS Lambda)

**Why?**
- ✅ Free tier: 6 hours/month runtime
- ✅ No server setup
- ✅ Managed updates
- ✅ Works everywhere

**Setup:**

1. **Sign up:**
   ```bash
   https://www.browserless.io/
   # Free tier: No credit card required
   ```

2. **Get API token from dashboard**

3. **Add to environment variables:**
   ```bash
   # .env.local
   BROWSERLESS_TOKEN=your_token_here
   ```

4. **Update code to use Browserless:**
   ```typescript
   // In extractWebsiteData.ts

   async function fetchWithPuppeteer(...) {
     const browserWSEndpoint = process.env.BROWSERLESS_TOKEN
       ? `wss://chrome.browserless.io?token=${process.env.BROWSERLESS_TOKEN}`
       : undefined;

     const browser = browserWSEndpoint
       ? await puppeteer.connect({ browserWSEndpoint })
       : await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });

     // ... rest of code
   }
   ```

5. **Deploy:**
   ```bash
   vercel --prod
   # or
   netlify deploy --prod
   ```

**Cost:**
- Free: 6 hours/month
- Startup: $40/month for 40 hours
- Growth: $120/month for unlimited

---

### **Option 2: Docker Deployment** (VPS, AWS ECS, DigitalOcean)

**Best for:** Long-running servers, high volume

**Dockerfile:**
```dockerfile
FROM node:18-bullseye

# Install Chrome dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-driver \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libx11-xcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxi6 \
    libxtst6 \
    libnss3 \
    libcups2 \
    libxrandr2 \
    libasound2 \
    libpangocairo-1.0-0 \
    libgtk-3-0 \
    libgbm1 \
    && rm -rf /var/lib/apt/lists/*

# Set Chromium path for Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy app
COPY . .

# Build Next.js
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
```

**Build & Deploy:**
```bash
# Build image
docker build -t chainreact-app .

# Test locally
docker run -p 3000:3000 chainreact-app

# Deploy to registry
docker tag chainreact-app registry.digitalocean.com/your-registry/chainreact-app
docker push registry.digitalocean.com/your-registry/chainreact-app
```

---

### **Option 3: AWS Lambda with Layer**

**Best for:** AWS-only infrastructure

**Setup:**

1. **Use Chrome AWS Lambda Layer:**
   ```bash
   npm install chrome-aws-lambda puppeteer-core
   ```

2. **Update code:**
   ```typescript
   // Use chrome-aws-lambda on Lambda, regular puppeteer locally
   const chromium = process.env.AWS_LAMBDA_FUNCTION_NAME
     ? require('chrome-aws-lambda')
     : null;

   const puppeteerModule = chromium ? require('puppeteer-core') : require('puppeteer');

   async function fetchWithPuppeteer(...) {
     const browser = chromium
       ? await puppeteerModule.launch({
           args: chromium.args,
           executablePath: await chromium.executablePath,
           headless: chromium.headless,
         })
       : await puppeteerModule.launch({
           headless: true,
           args: ['--no-sandbox', '--disable-setuid-sandbox']
         });

     // ... rest of code
   }
   ```

3. **Configure Lambda:**
   - Memory: 1024 MB minimum
   - Timeout: 60 seconds
   - /tmp storage: 512 MB

---

### **Option 4: Ubuntu/Debian VPS** (AWS EC2, DigitalOcean, Linode)

**Best for:** Full control, cost-effective at scale

**Install Chrome:**
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Chrome dependencies
sudo apt install -y \
  gconf-service \
  libasound2 \
  libatk1.0-0 \
  libc6 \
  libcairo2 \
  libcups2 \
  libdbus-1-3 \
  libexpat1 \
  libfontconfig1 \
  libgcc1 \
  libgconf-2-4 \
  libgdk-pixbuf2.0-0 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnspr4 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libstdc++6 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libxrandr2 \
  libxrender1 \
  libxss1 \
  libxtst6 \
  ca-certificates \
  fonts-liberation \
  libappindicator1 \
  libnss3 \
  lsb-release \
  xdg-utils \
  wget

# Install Chrome
wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
sudo apt install ./google-chrome-stable_current_amd64.deb
```

**Deploy app:**
```bash
# Clone repo
git clone your-repo.git
cd your-repo

# Install dependencies
npm install

# Build
npm run build

# Start with PM2 (process manager)
npm install -g pm2
pm2 start npm --name "chainreact-app" -- start
pm2 save
pm2 startup
```

---

### **Option 5: Fly.io** (Modern Cloud Platform)

**Best for:** Easy deployment, Docker-based

**fly.toml:**
```toml
app = "chainreact-app"

[build]
  builder = "heroku/buildpacks:20"

[env]
  PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = "false"

[[services]]
  internal_port = 3000
  protocol = "tcp"

  [[services.ports]]
    handlers = ["http"]
    port = 80

  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443
```

**Deploy:**
```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Login
fly auth login

# Launch app
fly launch

# Deploy
fly deploy
```

---

## 🆓 Free Tier Comparison

| Service | Free Tier | Setup Difficulty | Best For |
|---------|-----------|------------------|----------|
| **Browserless.io** | 6 hrs/month | ⭐ Easy | Serverless (Vercel, Netlify) |
| **Fly.io** | 3 small VMs | ⭐⭐ Medium | Full apps with persistence |
| **Railway** | $5 credit/month | ⭐ Easy | Quick prototypes |
| **Render** | 750 hrs/month | ⭐⭐ Medium | Production apps |
| **AWS Lambda** | 1M requests/month | ⭐⭐⭐ Hard | AWS infrastructure |
| **DigitalOcean** | $100 credit (60 days) | ⭐⭐ Medium | Full VPS control |

---

## 🧪 Testing Puppeteer

Run the test script:
```bash
node test-puppeteer.mjs
```

Expected output:
```
✅ Browser launched successfully
✅ Page created
✅ Navigation successful
✅ Page title: "Example Domain"
✅ Screenshot captured
✅ Text extracted
🎉 SUCCESS! Puppeteer is fully functional.
```

---

## 🐛 Troubleshooting

### **Error: "Failed to launch Chrome"**

**macOS:**
```bash
# Puppeteer should auto-download Chrome
# If not, manually install:
npm install puppeteer --force
```

**Linux (missing dependencies):**
```bash
# Install missing libraries
sudo apt install -y libnss3 libatk-bridge2.0-0 libx11-xcb1
```

**Docker:**
```dockerfile
# Add to Dockerfile
RUN apt-get install -y chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
```

### **Error: "Navigation timeout"**

Increase timeout:
```typescript
await page.goto(url, {
  waitUntil: 'networkidle2',
  timeout: 60000 // 60 seconds
});
```

### **Error: "Chromium revision is not downloaded"**

Force reinstall:
```bash
rm -rf node_modules/puppeteer/.local-chromium
npm install puppeteer --force
```

### **Memory issues on Lambda**

Use `puppeteer-core` with chrome-aws-lambda:
```bash
npm install puppeteer-core chrome-aws-lambda
```

---

## 📊 Performance Tips

1. **Reuse browser instances:**
   ```typescript
   // Instead of launching new browser every time
   let browserInstance = null;

   async function getBrowser() {
     if (!browserInstance) {
       browserInstance = await puppeteer.launch();
     }
     return browserInstance;
   }
   ```

2. **Disable unnecessary features:**
   ```typescript
   await puppeteer.launch({
     args: [
       '--no-sandbox',
       '--disable-setuid-sandbox',
       '--disable-dev-shm-usage',
       '--disable-accelerated-2d-canvas',
       '--disable-gpu',
       '--no-first-run',
       '--no-zygote',
       '--single-process'
     ]
   });
   ```

3. **Use viewport screenshots (not full-page):**
   ```typescript
   await page.screenshot({ fullPage: false }); // Faster, smaller
   ```

4. **Set shorter network idle timeout:**
   ```typescript
   await page.goto(url, {
     waitUntil: 'domcontentloaded' // Faster than 'networkidle2'
   });
   ```

---

## 🎯 Recommended Setup

**For your app (Next.js on Vercel):**

**Use Browserless.io:**
1. Sign up at https://www.browserless.io/ (free tier)
2. Add token to Vercel environment variables
3. Update code to use remote browser
4. Deploy

**Total setup time:** ~10 minutes
**Cost:** $0/month (free tier)

---

## 📚 Resources

- [Puppeteer Documentation](https://pptr.dev/)
- [Browserless.io Docs](https://www.browserless.io/docs/)
- [Playwright (Alternative)](https://playwright.dev/)
- [Chrome AWS Lambda](https://github.com/alixaxel/chrome-aws-lambda)
