# Utility Nodes - Environment Variables Setup Guide

Complete guide for setting up API keys and credentials for production implementation of utility nodes.

---

## 📋 Environment Variables Needed

Add these to your `.env.local` file:

```bash
# Google Custom Search API (for Google Search node)
GOOGLE_CUSTOM_SEARCH_API_KEY=your_api_key_here
GOOGLE_CUSTOM_SEARCH_ENGINE_ID=your_search_engine_id_here

# Tavily Search API (for Tavily Search node)
TAVILY_API_KEY=your_tavily_api_key_here

# File Storage (for File Upload node)
AWS_S3_BUCKET_NAME=your_bucket_name
AWS_S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key

# Web Scraping Service (for Extract Website Data node)
BROWSERLESS_API_KEY=your_browserless_api_key
# OR
SCRAPINGBEE_API_KEY=your_scrapingbee_api_key

# Python Execution (for Transformer node)
# Option 1: AWS Lambda
AWS_LAMBDA_FUNCTION_NAME=python-transformer
AWS_LAMBDA_REGION=us-east-1

# Option 2: Self-hosted (no additional env vars needed)
# Python will be executed in Docker container

# Optional: Redis for state storage (Conditional Trigger)
REDIS_URL=redis://localhost:6379
# OR for cloud Redis
UPSTASH_REDIS_REST_URL=your_upstash_url
UPSTASH_REDIS_REST_TOKEN=your_upstash_token
```

---

## 🔑 How to Get Each API Key

### 1. Google Custom Search API

**What it's for**: Google Search node

**Steps to get API key**:

1. **Enable the API**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing one
   - Go to "APIs & Services" > "Library"
   - Search for "Custom Search API"
   - Click "Enable"

2. **Create API Key**
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "API Key"
   - Copy the API key
   - (Optional) Restrict the key to Custom Search API only

3. **Create Custom Search Engine**
   - Go to [Programmable Search Engine](https://programmablesearchengine.google.com/)
   - Click "Add" to create a new search engine
   - Enter a name (e.g., "ChainReact Search")
   - In "Sites to search", enter `www.google.com` (for web-wide search)
   - Click "Create"
   - Click "Control Panel" for your new engine
   - Copy the "Search engine ID" (cx parameter)

4. **Add to .env.local**
   ```bash
   GOOGLE_CUSTOM_SEARCH_API_KEY=AIzaSyD...your_key_here
   GOOGLE_CUSTOM_SEARCH_ENGINE_ID=017576662512468239146:omuauf_lfve
   ```

**Pricing**:
- Free tier: 100 queries per day
- Paid tier: $5 per 1,000 queries (up to 10,000/day)
- [Pricing details](https://developers.google.com/custom-search/v1/overview#pricing)

---

### 2. Tavily Search API

**What it's for**: Tavily Search node (AI-optimized search)

**Steps to get API key**:

1. **Sign up**
   - Go to [Tavily.com](https://tavily.com/)
   - Click "Get Started" or "Sign Up"
   - Create an account with email

2. **Get API Key**
   - After login, go to your [Dashboard](https://app.tavily.com/)
   - Navigate to "API Keys" section
   - Copy your API key

3. **Add to .env.local**
   ```bash
   TAVILY_API_KEY=tvly-...your_key_here
   ```

**Pricing**:
- Free tier: 1,000 requests per month
- Starter: $49/month for 10,000 requests
- Pro: $149/month for 100,000 requests
- [Pricing details](https://tavily.com/pricing)

**Features**:
- AI-optimized search results
- Relevance scoring
- Optional AI-generated answer summaries
- Domain filtering

---

### 3. AWS S3 (File Upload Storage)

**What it's for**: File Upload node - storing uploaded files

**Steps to set up**:

1. **Create S3 Bucket**
   - Go to [AWS S3 Console](https://s3.console.aws.amazon.com/)
   - Click "Create bucket"
   - Enter bucket name (e.g., `chainreact-file-uploads`)
   - Choose region (e.g., `us-east-1`)
   - Keep default settings (Block all public access ON)
   - Click "Create bucket"

2. **Create IAM User**
   - Go to [IAM Console](https://console.aws.amazon.com/iam/)
   - Click "Users" > "Add user"
   - Username: `chainreact-s3-user`
   - Access type: "Programmatic access"
   - Click "Next: Permissions"

3. **Attach S3 Policy**
   - Choose "Attach existing policies directly"
   - Search for "AmazonS3FullAccess" or create custom policy:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "s3:PutObject",
           "s3:GetObject",
           "s3:DeleteObject",
           "s3:ListBucket"
         ],
         "Resource": [
           "arn:aws:s3:::chainreact-file-uploads/*",
           "arn:aws:s3:::chainreact-file-uploads"
         ]
       }
     ]
   }
   ```
   - Complete user creation
   - **Copy Access Key ID and Secret Access Key** (shown only once!)

4. **Add to .env.local**
   ```bash
   AWS_S3_BUCKET_NAME=chainreact-file-uploads
   AWS_S3_REGION=us-east-1
   AWS_ACCESS_KEY_ID=AKIA...your_access_key
   AWS_SECRET_ACCESS_KEY=your_secret_key_here
   ```

**Pricing**:
- S3 Standard: $0.023 per GB per month
- PUT requests: $0.005 per 1,000 requests
- GET requests: $0.0004 per 1,000 requests
- Free tier: 5GB storage, 20,000 GET, 2,000 PUT for 12 months
- [S3 Pricing](https://aws.amazon.com/s3/pricing/)

---

### 4. Web Scraping Service

**What it's for**: Extract Website Data node

You have several options:

#### Option A: Browserless.io (Recommended)

1. **Sign up**
   - Go to [Browserless.io](https://www.browserless.io/)
   - Click "Start Free Trial"
   - Create account

2. **Get API Key**
   - After login, go to Dashboard
   - Find your API token under "Account" or "API"
   - Copy the token

3. **Add to .env.local**
   ```bash
   BROWSERLESS_API_KEY=your_token_here
   ```

**Pricing**:
- Free tier: 6 hours per month
- Starter: $59/month for 50 hours
- Business: $299/month for 300 hours
- [Pricing](https://www.browserless.io/pricing)

#### Option B: ScrapingBee

1. **Sign up**
   - Go to [ScrapingBee.com](https://www.scrapingbee.com/)
   - Create free account

2. **Get API Key**
   - Dashboard shows your API key immediately
   - Copy the key

3. **Add to .env.local**
   ```bash
   SCRAPINGBEE_API_KEY=your_api_key_here
   ```

**Pricing**:
- Free tier: 1,000 API credits
- Freelance: $49/month for 150,000 credits
- Startup: $99/month for 350,000 credits
- [Pricing](https://www.scrapingbee.com/pricing/)

#### Option C: Self-Hosted Puppeteer (Free)

**No API key needed**, but requires:
- Puppeteer npm package
- Chrome/Chromium installed on server
- More server resources

**Add to package.json**:
```bash
npm install puppeteer
```

**Pros**: Free, full control
**Cons**: Requires server maintenance, more complex deployment

---

### 5. Python Execution (Transformer Node)

You have several options:

#### Option A: AWS Lambda (Recommended for production)

1. **Create Lambda Function**
   - Go to [AWS Lambda Console](https://console.aws.amazon.com/lambda/)
   - Click "Create function"
   - Choose "Author from scratch"
   - Function name: `python-transformer`
   - Runtime: Python 3.11 or 3.12
   - Click "Create function"

2. **Add Python Code**
   - In the Lambda function, add code to execute user Python safely
   - Use RestrictedPython or careful validation
   - Set timeout to 30 seconds (or your preference)

3. **Get Function ARN**
   - Copy the function name from Lambda console

4. **Add to .env.local**
   ```bash
   AWS_LAMBDA_FUNCTION_NAME=python-transformer
   AWS_LAMBDA_REGION=us-east-1
   # Use same AWS credentials as S3
   ```

**Pricing**:
- Free tier: 1M requests + 400,000 GB-seconds per month
- After free tier: $0.20 per 1M requests
- [Lambda Pricing](https://aws.amazon.com/lambda/pricing/)

#### Option B: Google Cloud Functions

1. **Create Function**
   - Go to [Cloud Functions](https://console.cloud.google.com/functions)
   - Create function with Python runtime
   - Deploy code

2. **Add to .env.local**
   ```bash
   GCP_FUNCTION_URL=https://your-region-your-project.cloudfunctions.net/python-transformer
   ```

#### Option C: Self-Hosted Docker (Free)

**No API key needed**, but requires:
- Docker installed
- Sandboxed Python environment
- Security measures

**This is what we recommend starting with** - no credentials needed, just Docker.

---

### 6. Redis (Optional - for Conditional Trigger state)

**What it's for**: Storing previous values for Conditional Trigger's "value changes" condition

#### Option A: Upstash Redis (Recommended - Serverless)

1. **Sign up**
   - Go to [Upstash.com](https://upstash.com/)
   - Create free account

2. **Create Redis Database**
   - Click "Create Database"
   - Name: `chainreact-trigger-state`
   - Type: Regional (cheaper) or Global
   - Click "Create"

3. **Get Credentials**
   - In database details, find "REST API"
   - Copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`

4. **Add to .env.local**
   ```bash
   UPSTASH_REDIS_REST_URL=https://your-db.upstash.io
   UPSTASH_REDIS_REST_TOKEN=your_token_here
   ```

**Pricing**:
- Free tier: 10,000 commands per day
- Pay-as-you-go: $0.2 per 100K commands
- [Pricing](https://upstash.com/pricing/redis)

#### Option B: Local Redis (Development)

**For local testing**:

1. **Install Redis**
   ```bash
   # macOS
   brew install redis
   brew services start redis

   # Ubuntu/Debian
   sudo apt-get install redis-server
   sudo systemctl start redis

   # Windows (WSL)
   sudo apt-get install redis-server
   sudo service redis-server start
   ```

2. **Add to .env.local**
   ```bash
   REDIS_URL=redis://localhost:6379
   ```

**Pricing**: Free (self-hosted)

---

## 🎯 Quick Start Recommendations

### For Development/Testing (Free)

```bash
# Start with these (all free):
# 1. Google Search - Free tier (100 queries/day)
GOOGLE_CUSTOM_SEARCH_API_KEY=your_key
GOOGLE_CUSTOM_SEARCH_ENGINE_ID=your_cx

# 2. Tavily - Free tier (1,000 requests/month)
TAVILY_API_KEY=your_key

# 3. Local Redis for Conditional Trigger
REDIS_URL=redis://localhost:6379

# 4. Skip these for now (use mocks):
# - File Upload (S3) - Mock works fine for testing
# - Web Scraping - Mock works fine for testing
# - Python Execution - Mock works fine for testing
```

### For Production (Paid but scalable)

```bash
# All production services:
GOOGLE_CUSTOM_SEARCH_API_KEY=your_key
GOOGLE_CUSTOM_SEARCH_ENGINE_ID=your_cx
TAVILY_API_KEY=your_key
AWS_S3_BUCKET_NAME=your_bucket
AWS_S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
BROWSERLESS_API_KEY=your_key
AWS_LAMBDA_FUNCTION_NAME=python-transformer
AWS_LAMBDA_REGION=us-east-1
UPSTASH_REDIS_REST_URL=your_url
UPSTASH_REDIS_REST_TOKEN=your_token
```

---

## 📝 Adding to Your Project

1. **Create/Update .env.local**
   ```bash
   # In your project root
   touch .env.local
   # Or edit if it exists
   ```

2. **Add variables** (see sections above for which ones you need)

3. **Restart dev server**
   ```bash
   npm run dev
   ```

4. **Update handler files** to use environment variables instead of mocks

---

## 🔒 Security Best Practices

1. **Never commit .env.local** to git
   - Already in .gitignore
   - Double-check it's excluded

2. **Use different keys for dev/prod**
   - Create separate API keys for each environment
   - Use different AWS accounts or IAM users

3. **Rotate keys regularly**
   - Google/AWS: Every 90 days
   - Other services: Follow their recommendations

4. **Restrict API key permissions**
   - Only enable necessary APIs
   - Use IP restrictions where possible
   - Set usage quotas

5. **Monitor usage**
   - Set up billing alerts in AWS
   - Track API usage in dashboards
   - Watch for unusual spikes

---

## 💰 Cost Estimates (Monthly)

### Low Usage (Testing/Small teams)
- Google Search: **$0** (free tier)
- Tavily Search: **$0** (free tier)
- AWS S3: **$1-5** (few GB storage)
- Web Scraping: **$0-59** (Browserless free or starter)
- AWS Lambda: **$0** (free tier)
- Redis: **$0** (free tier or local)
- **Total: $1-64/month**

### Medium Usage (Production/Growing)
- Google Search: **$25** (5,000 searches)
- Tavily Search: **$49** (10,000 searches)
- AWS S3: **$10-30** (storage + transfers)
- Web Scraping: **$59-299** (Browserless)
- AWS Lambda: **$5-20** (beyond free tier)
- Redis: **$10-30** (Upstash pay-as-you-go)
- **Total: $158-453/month**

### High Usage (Scale)
- Custom pricing and enterprise plans
- Consider self-hosted options for some services
- Negotiate volume discounts

---

## 🆘 Troubleshooting

### API Key Not Working

1. **Check the key is correct** (no extra spaces)
2. **Verify API is enabled** (Google Cloud Console)
3. **Check usage limits** (may have exceeded free tier)
4. **Restart server** after adding env vars
5. **Check API restrictions** (IP allowlist, etc.)

### AWS Credentials Issues

1. **Verify IAM user has correct permissions**
2. **Check region matches** bucket location
3. **Test with AWS CLI** first:
   ```bash
   aws s3 ls s3://your-bucket-name
   ```

### Redis Connection Failed

1. **Check Redis is running**: `redis-cli ping` should return `PONG`
2. **Verify URL format**: `redis://localhost:6379` or Upstash URL
3. **Check firewall** isn't blocking port 6379

---

## 📚 Additional Resources

- [Google Custom Search API Docs](https://developers.google.com/custom-search/v1/introduction)
- [Tavily API Docs](https://docs.tavily.com/)
- [AWS S3 Documentation](https://docs.aws.amazon.com/s3/)
- [Browserless API Docs](https://docs.browserless.io/)
- [AWS Lambda Python Guide](https://docs.aws.amazon.com/lambda/latest/dg/lambda-python.html)
- [Upstash Redis Docs](https://docs.upstash.com/redis)

---

## ✅ Checklist

- [ ] Created Google Cloud project
- [ ] Enabled Custom Search API
- [ ] Created Custom Search Engine
- [ ] Got Google API key and Search Engine ID
- [ ] Signed up for Tavily
- [ ] Got Tavily API key
- [ ] Created AWS account (if using S3/Lambda)
- [ ] Created S3 bucket
- [ ] Created IAM user with S3 permissions
- [ ] Got AWS access key and secret
- [ ] Chose web scraping service (Browserless/ScrapingBee/Self-hosted)
- [ ] Got web scraping API key (if using service)
- [ ] Set up Python execution (Lambda/Cloud Functions/Docker)
- [ ] Set up Redis (Upstash/Local)
- [ ] Added all variables to .env.local
- [ ] Tested each service independently
- [ ] Updated handler files to use real APIs
- [ ] Restarted dev server
- [ ] Set up billing alerts
- [ ] Documented which keys are for which environment

---

**Need help?** Check the troubleshooting section or refer to each service's documentation linked above.
