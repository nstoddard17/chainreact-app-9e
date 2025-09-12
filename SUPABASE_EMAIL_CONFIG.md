# Supabase Email Configuration for Development

## The Problem
When testing email confirmation in local development, Supabase sends confirmation emails with links pointing to your production domain instead of localhost. This is because Supabase uses the "Site URL" configured in your project settings for all email templates.

## Solutions

### For Local Development Testing

#### Option 1: Temporary Dashboard Change (Quick Fix)
1. Go to your [Supabase Dashboard](https://app.supabase.com)
2. Select your project
3. Navigate to **Authentication** → **URL Configuration**
4. Change **Site URL** from your production URL to: `http://localhost:3000`
5. Save changes

⚠️ **IMPORTANT**: Remember to change this back to your production URL before deploying!

#### Option 2: Use Environment Variable (Recommended)
1. Create a `.env.local` file in your project root (if not exists)
2. Add: `NEXT_PUBLIC_BASE_URL=http://localhost:3000`
3. The code will automatically use this URL for email redirects in development

### For Production
Ensure your Supabase dashboard has the correct production URL:
1. Go to **Authentication** → **URL Configuration**
2. Set **Site URL** to your production domain (e.g., `https://chainreact.app`)
3. Set **Redirect URLs** to include:
   - `https://chainreact.app/api/auth/callback`
   - `http://localhost:3000/api/auth/callback` (for development)

### How It Works
The application now intelligently detects the environment:
- **In browser**: Uses `window.location.origin` (current domain)
- **In development**: Uses `NEXT_PUBLIC_BASE_URL` or defaults to `http://localhost:3000`
- **In production**: Uses `NEXT_PUBLIC_SITE_URL` or your production domain

### Testing Email Confirmation Flow
1. Start your dev server: `npm run dev`
2. Create a new account
3. Check your email
4. Click the confirmation link
5. The original tab (waiting page) will auto-detect confirmation and redirect
6. The email link tab will attempt to auto-close

### Troubleshooting
- If emails still go to production, check Supabase dashboard Site URL
- If redirect fails, ensure `/api/auth/callback` route is working
- Check browser console for any error messages
- Verify environment variables are loaded correctly