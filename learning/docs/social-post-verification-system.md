# Social Post Verification System
**Date:** October 21, 2025
**Strategy:** Trust + Delayed Verification (Option 1)

## Overview

This system allows users to earn 1,500 free tasks by sharing ChainReact on LinkedIn or X (Twitter). Tasks are granted **immediately** upon submission, then verified after 7 days. If the post was deleted, tasks are revoked and the user is notified.

---

## Architecture

### Trust + Delayed Verification Flow

```
1. User shares post on LinkedIn/X
2. User submits URL → API validates URL
3. Tasks granted IMMEDIATELY (1,500 tasks)
4. Submission stored with status='pending'
5. Verification scheduled for 7 days later
6. Cron job checks if post still exists
7a. Post exists → Mark as 'verified' ✓
7b. Post deleted → Revoke tasks, send warning email ✗
```

### Why This Approach?

**Pros:**
- ✅ Better UX (instant gratification)
- ✅ Higher conversion rate
- ✅ Shows trust in users
- ✅ Automated verification scales
- ✅ Revocation serves as deterrent

**Cons:**
- ⚠️ Small risk of gaming short-term
- ⚠️ Requires building verification system

---

## Database Schema

### Table: `social_post_submissions`

```sql
CREATE TABLE social_post_submissions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  post_url TEXT NOT NULL,
  platform TEXT CHECK (platform IN ('twitter', 'linkedin', 'x')),
  tasks_granted INTEGER DEFAULT 1500,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'deleted', 'invalid', 'revoked')),
  verification_date TIMESTAMPTZ,
  verification_attempts INTEGER DEFAULT 0,
  last_verification_attempt TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Indexes:**
- `idx_social_post_user_id` - Fast user lookups
- `idx_social_post_status` - Filter by status
- `idx_social_post_verification_date` - Cron job queries

**Status Values:**
- `pending` - Awaiting verification (0-7 days old)
- `verified` - Post confirmed to exist after 7 days
- `revoked` - Post was deleted, tasks revoked
- `invalid` - Invalid URL or unable to verify
- `deleted` - (deprecated, use 'revoked')

---

## API Endpoints

### POST `/api/social-posts/submit`

Submit a social media post URL to claim free tasks.

**Request:**
```json
{
  "postUrl": "https://x.com/username/status/123456789",
  "platform": "x"
}
```

**Response (Success):**
```json
{
  "success": true,
  "tasksGranted": 1500,
  "newTasksLimit": 2600,
  "message": "1,500 tasks added! We'll verify your post in 7 days.",
  "verificationDate": "2025-10-28T02:00:00Z"
}
```

**Error Responses:**
- `400` - Invalid URL, missing fields, duplicate submission
- `429` - Rate limit (1 submission per week)
- `401` - Not authenticated
- `500` - Server error

**Rate Limiting:**
- 1 submission per user per week
- Prevents spam/abuse

**Validation:**
- URL must start with `http://` or `https://`
- Platform auto-detected from URL (linkedin.com, x.com, twitter.com)
- Duplicate URLs rejected per user

---

## Verification Cron Job

### Endpoint: `GET /api/cron/verify-social-posts`

**Schedule:** Daily at 2:00 AM UTC
**Vercel Cron:** `0 2 * * *`

**Process:**
1. Query all `status='pending'` submissions where `verification_date <= NOW()`
2. For each submission:
   - Check if post still exists via HTTP HEAD request
   - **Post exists (200)** → Mark as `verified`
   - **Post deleted (404)** → Revoke tasks, send email, mark as `revoked`
   - **Unable to verify (other)** → Increment attempts, try again tomorrow
3. Limit: Process 100 submissions per run
4. Log results (verified, revoked, errors)

**Verification Method:**

```typescript
// Simple HEAD request to check if URL exists
const response = await fetch(postUrl, { method: 'HEAD' })

if (response.status === 200) return true  // Exists
if (response.status === 404) return false // Deleted
return null // Unknown (will retry)
```

**Why HEAD requests?**
- Lightweight (doesn't download full page)
- Works for Twitter/X and LinkedIn public posts
- Respects rate limits (User-Agent: ChainReactBot)

---

## Task Revocation Process

When a post is found to be deleted:

### 1. Deduct Tasks from Profile
```typescript
const newTasksLimit = Math.max(100, currentLimit - 1500)
```
- Deducts 1,500 tasks
- Never goes below base plan limit (100 for free tier)

### 2. Update Submission Status
```typescript
status = 'revoked'
verification_attempts += 1
last_verification_attempt = NOW()
```

### 3. Send Warning Email

**Subject:** ⚠️ ChainReact: Tasks Revoked - Post No Longer Found

**Body:**
```
Hello,

We recently verified your social media post submission and found that
the post is no longer publicly available:

Post URL: [url]

As per our terms, we have revoked 1,500 tasks from your account
because the post was deleted.

To maintain the integrity of our free tasks program, we require that
posts remain public for at least 7 days after submission.

If you believe this was an error, please contact support at
hello@chainreact.com.

Thank you for understanding,
ChainReact Team
```

---

## Frontend Integration

### NewSidebar.tsx Changes

**"Share Your Success" card updated:**

```typescript
onClick={async () => {
  // Auto-detect platform from URL
  let platform: 'twitter' | 'linkedin' | 'x' = 'x'
  if (socialPostUrl.includes('linkedin.com')) {
    platform = 'linkedin'
  } else if (socialPostUrl.includes('x.com')) {
    platform = 'x'
  }

  // Submit to API
  const response = await fetch('/api/social-posts/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ postUrl: socialPostUrl, platform })
  })

  if (response.ok) {
    toast({ title: "Success! 🎉", description: "1,500 tasks added!" })
    window.location.reload() // Refresh to update task count
  }
}}
```

**Features:**
- Auto-detects platform from URL
- Shows instant success message
- Reloads page to update task counter
- Handles errors gracefully

---

## Deployment Steps

### 1. Run Database Migration

```bash
# Link to your Supabase project (if not already linked)
supabase link --project-ref xzwsdwllmrnrgbltibxt

# Push migration to production
supabase db push
```

**What this creates:**
- `social_post_submissions` table
- Indexes for performance
- RLS policies for security
- Triggers for updated_at

### 2. Set Environment Variables (Vercel)

```bash
# Optional: Add CRON_SECRET for security
CRON_SECRET=your-random-secret-here
```

**To generate secret:**
```bash
openssl rand -hex 32
```

**Add to Vercel:**
```
Dashboard → Settings → Environment Variables → Add
```

### 3. Deploy to Vercel

```bash
git add .
git commit -m "Add social post verification system"
git push
```

Vercel will automatically:
- Deploy the new API endpoints
- Set up the cron job (runs daily at 2 AM UTC)
- Enable the verification system

### 4. Test the Flow

**Manual Test:**
1. Create a post on X or LinkedIn
2. Submit URL via "Get Free Tasks" modal
3. Check that 1,500 tasks were added immediately
4. Verify submission in Supabase: `SELECT * FROM social_post_submissions`
5. Wait 7 days (or manually trigger cron for testing)

**Test Cron Job Manually:**
```bash
curl -X GET https://yourapp.vercel.app/api/cron/verify-social-posts \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

---

## Monitoring & Analytics

### Database Queries

**Check pending verifications:**
```sql
SELECT
  COUNT(*) as total,
  platform,
  status
FROM social_post_submissions
GROUP BY platform, status;
```

**Revocation rate:**
```sql
SELECT
  (COUNT(*) FILTER (WHERE status = 'revoked')::FLOAT / COUNT(*)) * 100 as revocation_rate_percent
FROM social_post_submissions;
```

**Recent submissions:**
```sql
SELECT
  created_at,
  platform,
  status,
  verification_date
FROM social_post_submissions
ORDER BY created_at DESC
LIMIT 20;
```

### Logs to Monitor

**Supabase Logs:**
- New submissions created
- Task grants successful
- RLS policy violations (indicates attack)

**Vercel Logs:**
- Cron job execution (daily at 2 AM)
- Verification results (verified/revoked/errors)
- API errors (rate limits, invalid URLs)

**Email Service:**
- Revocation emails sent
- Email delivery failures

---

## Anti-Abuse Measures

### Current Protections

1. **Rate Limiting:** 1 submission per user per week
2. **Duplicate Detection:** Can't submit same URL twice
3. **URL Validation:** Must be valid http(s) URL
4. **Platform Validation:** Only LinkedIn, Twitter, X allowed
5. **Delayed Verification:** 7-day window to catch deletions
6. **Task Revocation:** Deducts tasks if post deleted
7. **Email Warnings:** Notifies user of revocation

### Future Enhancements

**If abuse becomes a problem:**

1. **Multi-Strike System:**
   - 1st revocation: Warning email
   - 2nd revocation: 30-day ban from program
   - 3rd revocation: Permanent ban

2. **Manual Review Queue:**
   - Flag suspicious URLs for manual review
   - Require screenshot upload for verification

3. **Content Validation:**
   - Use scraping to verify post mentions "ChainReact"
   - Check for minimum post length/quality

4. **IP-based Rate Limiting:**
   - Limit submissions per IP address
   - Prevent multi-account abuse

---

## Troubleshooting

### Issue: Verification fails with null

**Cause:** HTTP request to check post failed
**Solution:** Check logs for error. May be rate-limited or blocked.

```typescript
// In cron job:
if (postExists === null) {
  // Increment attempts, try again tomorrow
  verification_attempts += 1
}
```

**Max Attempts:** Currently unlimited (will keep trying daily)

### Issue: Tasks not granted immediately

**Cause:** API error or database issue
**Check:**
1. Supabase logs for errors
2. Profile.tasks_limit updated?
3. social_post_submissions record created?

### Issue: Cron job not running

**Check:**
1. Vercel cron dashboard
2. CRON_SECRET matches
3. Endpoint returns 200 OK

### Issue: User claims post wasn't deleted

**Manual Override:**
```sql
-- Restore tasks
UPDATE profiles
SET tasks_limit = tasks_limit + 1500
WHERE id = 'user-id';

-- Mark submission as verified
UPDATE social_post_submissions
SET status = 'verified'
WHERE id = 'submission-id';
```

---

## Success Metrics

Track these metrics to measure success:

### Conversion Metrics
- **Submission Rate:** Users who submit posts / Users who view modal
- **Platform Split:** X vs LinkedIn submissions
- **Completion Rate:** Verified posts / Total submissions

### Quality Metrics
- **Revocation Rate:** Revoked posts / Total submissions (Target: <5%)
- **Invalid URL Rate:** Invalid submissions / Total attempts
- **Verification Success Rate:** Successfully verified / Verification attempts

### Business Impact
- **Tasks Distributed:** Total tasks granted via program
- **User Acquisition:** New signups from referral links in posts
- **Social Reach:** Estimated impressions from verified posts

---

## Future Improvements

### Phase 2 Features

1. **Submission Dashboard:**
   - User can view their past submissions
   - See verification status
   - Download proof of submission

2. **Better Verification:**
   - Screenshot upload requirement
   - API integration with X/LinkedIn for real verification
   - Content analysis to ensure quality posts

3. **Gamification:**
   - Leaderboard for most shares
   - Bonus tasks for highly engaging posts
   - Referral tracking from post to signup

4. **Analytics:**
   - Track which posts drive most signups
   - Measure conversion from view → signup
   - ROI calculation for free tasks program

---

## Files Created/Modified

### New Files
- `supabase/migrations/20251022040629_social_post_submissions.sql`
- `app/api/social-posts/submit/route.ts`
- `app/api/cron/verify-social-posts/route.ts`
- `learning/docs/social-post-verification-system.md` (this file)

### Modified Files
- `components/new-design/layout/NewSidebar.tsx` - Updated "Share Your Success" button
- `vercel.json` - Added cron job schedule

### Dependencies
- Uses existing email service (`lib/notifications/email.ts`)
- Uses existing logger (`lib/utils/logger.ts`)
- Uses existing Supabase client (`utils/supabase/server.ts`)

---

## Questions?

**Contact:** Support team or check `/learning/docs/` for other guides

**Related Docs:**
- `/learning/docs/pricing-strategy-analysis.md` - Free tasks in context of pricing
- `/lib/notifications/email.ts` - Email notification system
- `CLAUDE.md` - General architecture guidelines
