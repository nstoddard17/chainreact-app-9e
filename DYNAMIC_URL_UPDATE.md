# Dynamic URL Handling for Stripe Checkout

## Changes Made

### 1. Updated Checkout Route (`/app/api/billing/checkout/route.ts`)
- Added `getBaseUrlFromRequest()` helper function
- Dynamically detects the correct base URL from request headers
- Properly handles localhost, production, and preview environments

### 2. Updated Portal Route (`/app/api/billing/portal/route.ts`)
- Added same `getBaseUrlFromRequest()` helper function
- Ensures Stripe Customer Portal returns to the correct environment

## How It Works

The dynamic URL detection follows this priority order:

1. **Environment Variable** (Production)
   - If `NEXT_PUBLIC_APP_URL` is set and not localhost, use it
   
2. **Request Headers** (Dynamic)
   - Detects from `host` or `x-forwarded-host` headers
   - Automatically uses `http://` for localhost
   - Uses `https://` for production domains
   
3. **Development Fallback**
   - Falls back to `http://localhost:3000` in development
   
4. **Default Fallback**
   - Uses `https://chainreact.app` as final fallback

## Supported Scenarios

✅ **Localhost Development**
- `http://localhost:3000` → Returns to `http://localhost:3000`
- `http://localhost:3001` → Returns to `http://localhost:3001`
- `http://127.0.0.1:3000` → Returns to `http://127.0.0.1:3000`

✅ **Production**
- `https://chainreact.app` → Returns to `https://chainreact.app`

✅ **Preview/Staging**
- Vercel preview URLs are preserved
- ngrok tunnels are supported

✅ **Custom Domains**
- Can be overridden with `NEXT_PUBLIC_APP_URL`

## Testing

Run the test script to verify URL detection:
```bash
npx tsx scripts/test-dynamic-urls.ts
```

## User Experience

Now when users:
1. Click "Upgrade to Pro" on localhost → Stripe returns them to localhost
2. Click "Upgrade to Pro" on production → Stripe returns them to production
3. Click the back button in Stripe checkout → Returns to the correct environment
4. Complete or cancel checkout → Returns to the correct environment

No more redirect mismatches between development and production!