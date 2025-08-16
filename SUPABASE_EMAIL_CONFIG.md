# Supabase Email Configuration

To prevent duplicate confirmation emails (both Supabase's default and your custom Resend emails), you need to configure Supabase to not send automatic confirmation emails.

## Option 1: Disable in Dashboard
1. Go to Supabase Dashboard → Authentication → Settings
2. Scroll to "Email Templates" 
3. **Uncheck "Enable email confirmations"**
4. Save settings

## Option 2: Clear Email Template
1. Go to Supabase Dashboard → Authentication → Email Templates
2. Select "Confirm signup" template
3. Clear the subject and HTML content
4. Save (this will prevent Supabase from sending emails)

## Option 3: Via Auth Settings (Recommended)
1. Go to Supabase Dashboard → Authentication → Settings
2. Under "User email confirmation" set to **disabled**
3. This stops automatic confirmation emails while keeping signup enabled

## Current Setup
- ✅ Custom Resend emails are working
- ❌ Supabase is still sending duplicate emails
- 🎯 Goal: Only send custom Resend emails

## Verification
After making changes:
1. Test signup with a new email
2. Should receive only 1 email (from Resend)
3. Email should use your custom template and SMTP settings