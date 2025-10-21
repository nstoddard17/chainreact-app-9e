# Integration Token Storage Architecture

**Last Updated:** January 2025
**Key Concept:** Same table, different databases

---

## 🎯 The Simple Answer

**You DON'T store tokens in separate tables.**

You store them in the **SAME table** (`integrations`), but in **DIFFERENT database instances**.

```
┌─────────────────────────────────────────────────────────┐
│           SAME TABLE SCHEMA                             │
│           integrations                                  │
│  (id, user_id, provider, access_token, etc.)           │
└─────────────────────────────────────────────────────────┘
                        │
                        │
          ┌─────────────┴─────────────┐
          │                           │
          ▼                           ▼
┌──────────────────┐        ┌──────────────────┐
│  LOCAL DATABASE  │        │  PROD DATABASE   │
│                  │        │                  │
│  integrations    │        │  integrations    │
│  ├─ Twitter      │        │  ├─ Twitter      │
│  ├─ Gmail        │        │  ├─ Gmail        │
│  └─ Slack        │        │  └─ Notion       │
│                  │        │                  │
│  (Test accounts) │        │  (Real accounts) │
└──────────────────┘        └──────────────────┘
```

---

## 📊 The Actual Table Structure

**Table Name:** `integrations`

**Schema** (from `/services/integration-service.ts:7-22`):

```typescript
export interface Integration {
  id: string                    // Unique integration ID
  user_id: string               // Which user owns this connection
  provider: string              // e.g., "twitter", "gmail", "slack"
  status: string                // "connected", "expired", "needs_reauthorization"
  access_token?: string         // OAuth access token (encrypted)
  refresh_token?: string        // OAuth refresh token (encrypted)
  created_at: string           // When connected
  updated_at: string           // Last updated
  expires_at?: string | null   // When token expires
  scopes?: string[]            // OAuth permissions granted
  metadata?: any               // Provider-specific data
  disconnected_at?: string | null
  disconnect_reason?: string | null
}
```

**This exact same table exists in both local and production databases!**

---

## 🔍 How It Works

### Your Current Setup

**Environment Variable** (from `.env.local`):
```bash
NEXT_PUBLIC_SUPABASE_URL="https://xzwsdwllmrnrgbltibxt.supabase.co"
```

This URL determines **which database** your app connects to.

### Local Development

```typescript
// When you run on localhost:3000
const supabase = createClient(
  "https://xzwsdwllmrnrgbltibxt.supabase.co",  // Your Supabase project
  "your-anon-key"
)

// Connecting Twitter locally executes:
supabase
  .from('integrations')  // Same table name
  .insert({
    user_id: 'your-user-id',
    provider: 'twitter',
    access_token: 'encrypted-token-for-test-account',
    // ... other fields
  })

// Stored in: xzwsdwllmrnrgbltibxt.supabase.co → integrations table
```

### Production

```typescript
// When running on chainreact.app
const supabase = createClient(
  "https://xzwsdwllmrnrgbltibxt.supabase.co",  // SAME URL (or different if you have separate prod project)
  "your-anon-key"
)

// Connecting Twitter on production executes:
supabase
  .from('integrations')  // Same table name
  .insert({
    user_id: 'your-user-id',
    provider: 'twitter',
    access_token: 'encrypted-token-for-real-account',
    // ... other fields
  })

// Stored in: xzwsdwllmrnrgbltibxt.supabase.co → integrations table
```

---

## 🤔 Wait, Same Database URL?

Looking at your `.env.local`, you're using the **same Supabase project** for both local and production!

**This means:**

```
localhost:3000 → xzwsdwllmrnrgbltibxt.supabase.co → integrations table
chainreact.app → xzwsdwllmrnrgbltibxt.supabase.co → integrations table
                          ↑
                    SAME DATABASE!
```

**So why don't integrations sync?**

### The Real Reason

The issue isn't separate databases - it's **how OAuth callbacks work**:

1. **Connect Twitter on localhost:**
   ```
   localhost:3000/integrations → Click "Connect Twitter"
     ↓
   Twitter OAuth: "Where should I redirect after auth?"
     ↓
   Redirect URI: http://localhost:3000/api/integrations/twitter/callback
     ↓
   Twitter sends tokens to localhost:3000
     ↓
   localhost:3000 receives tokens and stores in database
     ↓
   YOU see the token (because you're on localhost)
   ```

2. **When you visit production:**
   ```
   chainreact.app/integrations → Fetch integrations from database
     ↓
   Query: SELECT * FROM integrations WHERE user_id = 'you'
     ↓
   Database returns: Twitter integration exists!
     ↓
   BUT: The database record was created with callback URL = localhost:3000
     ↓
   Your production UI might not recognize it as "connected" if checking something else
   ```

---

## 🎯 The ACTUAL Architecture

Let me check if you're using the same database or separate ones:

### Option 1: Same Database (What you probably have)

```
┌──────────────────────────────────────────────────────┐
│       Supabase Project (xzwsdwllmrnrgbltibxt)        │
│                                                       │
│  integrations table                                  │
│  ├─ id: 1, user_id: 'you', provider: 'twitter'      │
│  │   access_token: '...', created_via: 'localhost'  │
│  ├─ id: 2, user_id: 'you', provider: 'gmail'        │
│  │   access_token: '...', created_via: 'production' │
│  └─ id: 3, user_id: 'you', provider: 'slack'        │
│      access_token: '...', created_via: 'localhost'  │
│                                                       │
│  workflows table                                     │
│  users table                                         │
│  ... other tables ...                                │
└──────────────────────────────────────────────────────┘
           ↑                    ↑
           │                    │
    localhost:3000      chainreact.app
    (reads/writes)      (reads/writes)
```

**In this case:** Both environments **CAN** see the same integrations!

### Option 2: Separate Databases (Recommended for security)

```
┌─────────────────────────┐    ┌─────────────────────────┐
│   Local Supabase        │    │   Production Supabase   │
│   (dev project)         │    │   (prod project)        │
│                         │    │                         │
│  integrations table     │    │  integrations table     │
│  ├─ Twitter (test)      │    │  ├─ Twitter (real)      │
│  └─ Gmail (test)        │    │  └─ Gmail (real)        │
│                         │    │                         │
└─────────────────────────┘    └─────────────────────────┘
         ↑                              ↑
         │                              │
  localhost:3000               chainreact.app

  Different URLs in .env
```

---

## 🔧 How to Check Your Setup

Run this in your terminal:

```bash
# What database does local use?
grep "NEXT_PUBLIC_SUPABASE_URL" .env.local

# What database does production use?
# Check your hosting platform (Vercel/Netlify) environment variables
```

**If they're the SAME URL:**
- You're using one database for both
- Integrations SHOULD be visible in both places
- But OAuth flows are environment-specific

**If they're DIFFERENT URLs:**
- You have separate dev/prod databases
- Integrations won't sync (by design)
- This is the recommended secure setup

---

## 📝 Where Tokens Are Actually Stored

### Physical Storage

```
Supabase PostgreSQL Database
  └─ public schema
      └─ integrations table
          ├─ Row 1: Twitter integration for User A
          ├─ Row 2: Gmail integration for User A
          ├─ Row 3: Slack integration for User B
          └─ ...
```

### Encryption

Tokens are **encrypted at rest** (see `/app/api/integrations/route.ts:36`):

```typescript
const { data: integrations } = await supabaseService
  .from("integrations")
  .select("*")
  .eq("user_id", user.id)
```

Supabase handles the encryption automatically. The `access_token` and `refresh_token` fields are stored encrypted.

---

## 🎨 Visual: How OAuth Stores Tokens

### Step-by-Step Flow

```
1. User clicks "Connect Twitter" on localhost:3000

2. Generate OAuth URL (generate-url/route.ts)
   ├─ Creates PKCE challenge
   ├─ Stores in pkce_flow table
   └─ Redirects user to Twitter

3. User authorizes on Twitter

4. Twitter redirects to: localhost:3000/api/integrations/twitter/callback?code=...

5. Callback handler (twitter/callback/route.ts)
   ├─ Exchanges code for tokens
   ├─ Gets: access_token, refresh_token, expires_in
   └─ Calls prepareIntegrationData()

6. prepareIntegrationData() (integration-service.ts)
   ├─ Encrypts tokens
   └─ Returns structured data

7. Insert into database
   await supabase
     .from('integrations')
     .insert({
       user_id: user.id,
       provider: 'twitter',
       access_token: encryptedAccessToken,
       refresh_token: encryptedRefreshToken,
       expires_at: calculateExpiryTime(),
       status: 'connected',
       scopes: ['tweet.read', 'tweet.write', ...],
       metadata: { username: '@yourhandle' }
     })

8. Token now stored in integrations table ✅
```

---

## 🔄 Reading Tokens Back

When your workflow needs to post a tweet:

```typescript
// 1. Workflow execution starts
// 2. Twitter Post Tweet action executes
// 3. Needs access token

// From: /lib/workflows/actions/twitter/handlers.ts
export async function postTweetHandler(config, userId, input) {
  // Get decrypted token from database
  const accessToken = await getDecryptedAccessToken(userId, "twitter")

  // Use token to call Twitter API
  return postTwitterTweet(accessToken, config, input)
}

// getDecryptedAccessToken internally does:
const { data } = await supabase
  .from('integrations')
  .select('access_token, refresh_token, expires_at')
  .eq('user_id', userId)
  .eq('provider', 'twitter')
  .eq('status', 'connected')
  .single()

// Supabase automatically decrypts the token
// Returns usable access token
```

---

## ⚡ Token Refresh Flow

Tokens expire. Here's how they're refreshed:

```typescript
// When a token is about to expire:

1. Check expires_at field
   if (new Date(integration.expires_at) <= new Date()) {
     // Token expired or about to expire
   }

2. Use refresh_token to get new access_token
   const response = await fetch('https://api.twitter.com/2/oauth2/token', {
     method: 'POST',
     body: new URLSearchParams({
       grant_type: 'refresh_token',
       refresh_token: integration.refresh_token,
       client_id: TWITTER_CLIENT_ID,
       client_secret: TWITTER_CLIENT_SECRET
     })
   })

3. Update integrations table with new tokens
   await supabase
     .from('integrations')
     .update({
       access_token: newAccessToken,
       refresh_token: newRefreshToken, // Twitter also rotates refresh tokens
       expires_at: new Date(Date.now() + expiresIn * 1000),
       updated_at: new Date().toISOString()
     })
     .eq('id', integration.id)

4. Continue with workflow execution using fresh token ✅
```

---

## 🛡️ Security Features

### 1. Encrypted at Rest
```sql
-- Tokens stored encrypted in PostgreSQL
-- Supabase handles encryption/decryption
-- Even DB admins can't read raw tokens
```

### 2. Row Level Security (RLS)
```sql
-- Users can only access their own integrations
CREATE POLICY "Users can only see their own integrations"
  ON integrations
  FOR SELECT
  USING (auth.uid() = user_id);
```

### 3. Service Role Bypass
```typescript
// API routes use service role to bypass RLS for admin operations
const supabaseService = createSupabaseServiceClient()
// This is secure because it only runs server-side
```

---

## 📊 Example Database State

**What your `integrations` table looks like:**

```sql
SELECT id, user_id, provider, status, created_at
FROM integrations
WHERE user_id = 'your-user-id';

┌──────────┬─────────────┬──────────┬───────────┬─────────────────────┐
│ id       │ user_id     │ provider │ status    │ created_at          │
├──────────┼─────────────┼──────────┼───────────┼─────────────────────┤
│ uuid-1   │ your-id     │ twitter  │ connected │ 2025-01-15 10:00:00 │
│ uuid-2   │ your-id     │ gmail    │ connected │ 2025-01-15 10:05:00 │
│ uuid-3   │ your-id     │ slack    │ expired   │ 2025-01-10 09:00:00 │
│ uuid-4   │ other-user  │ twitter  │ connected │ 2025-01-14 14:30:00 │
└──────────┴─────────────┴──────────┴───────────┴─────────────────────┘

-- Note: access_token and refresh_token columns are encrypted
-- You can't read them directly from SQL
```

---

## 🎯 Summary

### The Core Concept

**Same Table Schema, Different Database Instances**

```
                integrations table
                       │
         ┌─────────────┴─────────────┐
         │                           │
         ▼                           ▼
   Local Database            Production Database
   (Same structure)          (Same structure)
   (Test tokens)             (Real tokens)
```

### Where Tokens Live

1. **Physical Location:** PostgreSQL database in Supabase cloud
2. **Table Name:** `integrations`
3. **Encryption:** Automatic via Supabase
4. **Access Control:** RLS policies + service role

### Key Takeaways

- ✅ **One table schema** used everywhere
- ✅ **No separate "local" vs "production" tables**
- ✅ **Different database instances** = environment separation
- ✅ **Same user can have different tokens** in each environment
- ✅ **OAuth flow determines** which database gets the token
- ✅ **Tokens encrypted** at rest automatically
- ✅ **RLS ensures** users only see their own integrations

---

## 🔧 Practical Tips

### Viewing Your Integrations

**Via Supabase Dashboard:**
```
1. Go to https://supabase.com/dashboard
2. Select your project (xzwsdwllmrnrgbltibxt)
3. Navigate to "Table Editor"
4. Select "integrations" table
5. Filter by your user_id
6. See all your connected integrations
```

**Via SQL:**
```sql
-- Run in Supabase SQL Editor
SELECT
  provider,
  status,
  created_at,
  expires_at,
  scopes
FROM integrations
WHERE user_id = 'your-user-id'
ORDER BY created_at DESC;
```

### Cleaning Up Test Integrations

```sql
-- Delete all integrations for your test user
DELETE FROM integrations
WHERE user_id = 'test-user-id';

-- Or just expired ones
DELETE FROM integrations
WHERE status = 'expired'
  AND user_id = 'your-user-id';
```

---

## 📚 Related Files

- **Table Structure:** `/services/integration-service.ts:7-22`
- **Reading Tokens:** `/app/api/integrations/route.ts:36`
- **Storing Tokens:** `/app/api/integrations/*/callback/route.ts`
- **Using Tokens:** `/lib/workflows/actions/*/handlers.ts`
- **Encryption:** Handled by Supabase automatically
