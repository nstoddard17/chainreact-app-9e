# Twitter Automation Workflows - Complete Setup Guide

**Last Updated:** January 2025
**Author:** System Documentation

## 🚨 IMPORTANT: Twitter OAuth Requirements

### Why Twitter OAuth Doesn't Work on Localhost

Twitter (X) OAuth **does NOT support localhost redirect URIs**. This is enforced in `/app/api/integrations/auth/generate-url/route.ts:16`.

**Solutions:**

1. **Production (Recommended)**: Connect Twitter on `https://chainreact.app`
2. **Local Testing**: Use ngrok to create an HTTPS tunnel
   ```bash
   ngrok http 3000
   # Update NEXT_PUBLIC_SITE_URL to ngrok URL temporarily
   ```

---

## ✅ Verified Implementation Status

### Schedule Trigger
**Location:** `/lib/workflows/nodes/providers/automation/scheduler.ts`
**Status:** ✅ Fully Functional

- Uses cron expressions (e.g., `0 9 * * *` = 9:00 AM daily)
- Timezone support
- Proper outputSchema for triggering workflows

### Delay Action
**Location:** `/lib/workflows/actions/generic.ts:380-453`
**Status:** ✅ Fully Functional

- Supports: seconds, minutes, hours, days, weeks, months
- Max delay: 30 days
- Returns structured timing data

### Twitter Actions
**Location:** `/lib/workflows/actions/twitter/index.ts`
**Status:** ✅ Production Ready

Available actions:
- Post Tweet (with media, polls, scheduling, location)
- Reply to Tweet
- Retweet / Unretweet
- Like / Unlike
- Send Direct Message
- Follow / Unfollow User
- Delete Tweet
- Search Tweets
- Get User Timeline
- Get Mentions

---

## 🤖 AI Integration Options

### Option 1: AI Fields (RECOMMENDED - Already Built!)

**What is it?** Direct AI generation within action fields at runtime.

**Format:** `{{AI_FIELD:fieldName}}` or `{{AI:instruction}}`

**Where:** `/lib/workflows/execution/aiFieldResolver.ts`

**How it works:**
1. Any text field can use AI field markers
2. At runtime, AI generates appropriate content
3. No separate AI Message node needed!

**Example - Twitter Post Tweet Action:**
```yaml
Action: Twitter - Post Tweet
Text field: {{AI:Generate an engaging tweet about ChainReact's workflow automation features. Include 2-3 hashtags. Keep under 280 chars.}}
```

**Advantages:**
✅ No extra nodes needed
✅ Cleaner workflow visually
✅ AI context automatically includes trigger data and previous results
✅ Generates content at execution time

**Limitations:**
❌ Can't store AI output for reuse in multiple actions
❌ No explicit output to reference later
❌ Instructions embedded in field (less flexible)

---

### Option 2: AI Message Action (Current Approach)

**What is it?** Separate node that generates content, outputs variables.

**Where:** `/lib/workflows/aiMessage.ts`

**How it works:**
1. Add "AI Message" node
2. Configure prompt and output fields
3. Reference output: `{{ai_message_output.fieldName}}`

**Example:**
```
AI Message Node:
  Model: gpt-4o-mini
  Prompt: Generate tweet about ChainReact features
  Output Fields:
    - tweetText | The generated tweet text

Twitter Post Tweet Action:
  Text: {{ai_message_output.tweetText}}
```

**Advantages:**
✅ Explicit AI output that can be referenced by multiple actions
✅ Can generate multiple fields at once
✅ Structured output (JSON)
✅ Easier to debug (see AI output separately)

**Limitations:**
❌ Extra node in workflow (more complex visually)
❌ Need to manually wire variables
❌ More configuration required

---

## 📊 Comparison: Which to Use?

| Feature | AI Fields | AI Message Action |
|---------|-----------|-------------------|
| **Setup Time** | 5 seconds | 2 minutes |
| **Workflow Complexity** | Simple (fewer nodes) | Complex (extra nodes) |
| **Reusability** | Single use per field | Reusable across actions |
| **Debugging** | Harder (embedded) | Easier (explicit output) |
| **Multiple Outputs** | No | Yes (structured JSON) |
| **Variable Storage** | No | Yes |
| **Previous Context** | Manual | Can include in prompt |

**Recommendation:**
- **Simple workflows (1-2 tweets):** Use AI Fields
- **Complex workflows (multiple variations, storage, A/B testing):** Use AI Message Action

---

## 🔄 Previous Tweets Storage System

### Problem
AI needs to know what tweets were already posted to avoid repetition.

### Solution: Airtable Tweet History

**Setup:**

1. **Create Airtable Base: "Twitter Automation"**
   - Table: "Tweet History"
   - Fields:
     - `Tweet Text` (Long text)
     - `Posted At` (Date/Time)
     - `Category` (Single select: Feature, Benefit, Question, BTS)
     - `Engagement` (Number - likes + retweets)
     - `Tweet ID` (Text)

2. **Connect Airtable Integration**
   - Go to Settings → Integrations
   - Connect Airtable
   - Grant permissions

3. **Workflow Pattern:**

```
Schedule Trigger (9 AM daily)
  ↓
Airtable: List Records
  Base: Twitter Automation
  Table: Tweet History
  Max Records: 50
  Sort: Posted At (descending)
  ↓
AI Message: Generate Tweet
  Prompt: |
    Generate an engaging tweet about ChainReact workflow automation.

    Previous tweets (DO NOT repeat these themes):
    {{airtable_list_records.output.records}}

    Focus on: [feature highlight, user benefit, tips, or community question]

    Requirements:
    - Under 280 characters
    - Include 2-3 relevant hashtags
    - Engaging and conversational tone
    - Different angle from previous tweets
  Output Fields:
    - tweetText | The generated tweet text
    - category | Category of tweet (Feature/Benefit/Question/BTS)
  ↓
Twitter: Post Tweet
  Text: {{ai_message_output.tweetText}}
  ↓
Airtable: Create Record
  Base: Twitter Automation
  Table: Tweet History
  Fields:
    Tweet Text: {{ai_message_output.tweetText}}
    Posted At: {{$now}}
    Category: {{ai_message_output.category}}
    Tweet ID: {{twitter_post_tweet.output.tweetId}}
```

---

## 🚀 Complete Workflow Examples

### Example 1: Simple Daily Tweet (AI Fields Method)

**Workflow Name:** Daily ChainReact Tweet

**Nodes:**
1. **Schedule Trigger**
   - Cron: `0 9 * * *` (9 AM daily)
   - Timezone: `America/New_York`

2. **Twitter - Post Tweet**
   - Text: `{{AI:Generate an engaging tweet about ChainReact's workflow automation platform. Highlight a specific feature like AI agents, integrations, or visual builder. Include 2-3 hashtags. Under 280 chars.}}`

**Setup Time:** 2 minutes
**Complexity:** Very Simple
**Best For:** Quick start, testing

---

### Example 2: Multi-Tweet Daily Workflow with History (AI Message Method)

**Workflow Name:** Advanced Twitter Content Engine

**Nodes:**

1. **Schedule Trigger**
   - Cron: `0 */4 * * *` (Every 4 hours: 12 AM, 4 AM, 8 AM, 12 PM, 4 PM, 8 PM)
   - Timezone: `America/New_York`

2. **Airtable - List Records**
   - Base: `Twitter Automation`
   - Table: `Tweet History`
   - Max Records: `100`
   - Sort: `Posted At` (descending)
   - Filter: Last 7 days only

3. **AI Message - Generate Tweet**
   - Model: `gpt-4o-mini`
   - Temperature: `0.8` (more creative)
   - System Prompt:
     ```
     You are a social media manager for ChainReact, a workflow automation platform.
     Generate engaging, varied tweets that showcase different aspects of the product.
     ```
   - User Prompt:
     ```
     Time of day: {{$now}}

     Previous tweets from the last 7 days:
     {{airtable_list_records.output.records}}

     Generate a fresh tweet about ChainReact that:
     1. Highlights a different feature, benefit, or use case
     2. Uses a different angle than the previous tweets
     3. Matches the time of day (morning = productivity, evening = results/achievements)
     4. Includes 2-3 relevant hashtags
     5. Under 280 characters
     6. Engaging and conversational

     Return JSON with:
     - tweetText: the full tweet text
     - category: one of [Feature, Benefit, Question, Tip, Story]
     - hashtags: array of hashtags used
     ```
   - Output Fields:
     - `tweetText | The generated tweet content`
     - `category | Category of tweet`
     - `hashtags | Array of hashtags`

4. **Twitter - Post Tweet**
   - Text: `{{ai_message.output.tweetText}}`

5. **Airtable - Create Record**
   - Base: `Twitter Automation`
   - Table: `Tweet History`
   - Fields:
     - `Tweet Text`: `{{ai_message.output.tweetText}}`
     - `Posted At`: `{{$now}}`
     - `Category`: `{{ai_message.output.category}}`
     - `Tweet ID`: `{{twitter_post_tweet.output.tweetId}}`
     - `Hashtags`: `{{ai_message.output.hashtags}}`

**Setup Time:** 15 minutes
**Complexity:** Moderate
**Best For:** Serious automation, variety, tracking

---

### Example 3: Context-Aware Tweet Based on Time

**Workflow Name:** Time-Based Tweet Scheduler

**Schedule:** Create 4 separate workflows OR use conditional logic

**Morning (9 AM):**
```
AI Prompt: Generate a motivational productivity tweet about starting the day
with workflow automation. Focus on efficiency and getting things done.
```

**Afternoon (1 PM):**
```
AI Prompt: Generate a tweet highlighting a specific ChainReact integration
or feature. Educational and informative tone.
```

**Evening (5 PM):**
```
AI Prompt: Generate a tweet about results and achievements enabled by automation.
Success stories or impact focus.
```

**Night (9 PM):**
```
AI Prompt: Generate an engagement tweet asking a question about productivity,
tools, or automation challenges. Encourage replies.
```

---

## 🎯 Workflow Variables Reference

### System Variables (Built-in)
- `{{$now}}` - Current timestamp (ISO 8601)
- `{{$date}}` - Current date
- `{{$time}}` - Current time
- `{{$timezone}}` - User's timezone

### Trigger Variables
- `{{trigger.output}}` - Full trigger output
- `{{trigger.output.fieldName}}` - Specific field from trigger

### Node Output Variables
- `{{nodeId.output}}` - Full node output
- `{{nodeId.output.fieldName}}` - Specific field from node output

### AI Field Variables
- `{{AI:instruction}}` - Generate AI content inline
- `{{AI_FIELD:fieldName}}` - Generate AI content for specific field

---

## 📋 Step-by-Step Setup Checklist

### Phase 1: Prerequisites (5 minutes)
- [ ] Connect Twitter OAuth on `https://chainreact.app` (NOT localhost!)
- [ ] Verify Twitter connection shows "Connected" status
- [ ] (Optional) Create Airtable base "Twitter Automation" if using history

### Phase 2: Create Base Workflow (10 minutes)
- [ ] Go to Workflows page
- [ ] Click "Create Workflow"
- [ ] Name it: "Daily Twitter Automation"
- [ ] Add Schedule Trigger
  - [ ] Set cron expression: `0 9 * * *` for 9 AM daily
  - [ ] Set timezone to your local timezone
- [ ] Add Twitter Post Tweet action
  - [ ] Choose method: AI Field OR AI Message (see comparison above)
  - [ ] Configure tweet text

### Phase 3: Add History Tracking (Optional, 10 minutes)
- [ ] Create Airtable base with Tweet History table
- [ ] Add Airtable List Records action before AI generation
- [ ] Include records in AI prompt context
- [ ] Add Airtable Create Record action after posting

### Phase 4: Test & Activate (5 minutes)
- [ ] Click "Test Workflow" button
- [ ] Verify AI generates appropriate content
- [ ] Check tweet posts successfully to Twitter
- [ ] (If using Airtable) Verify record is created
- [ ] Activate workflow

### Phase 5: Monitor & Iterate (Ongoing)
- [ ] Check execution logs daily for first week
- [ ] Review posted tweets for quality
- [ ] Adjust AI prompts if needed
- [ ] Track engagement metrics in Airtable
- [ ] Refine based on what works

---

## 🐛 Troubleshooting

### Twitter OAuth Not Opening
**Problem:** Clicking "Reconnect Now" doesn't open OAuth popup
**Cause:** Running on localhost
**Fix:** Use production URL or ngrok

### Schedule Not Triggering
**Problem:** Workflow doesn't run at scheduled time
**Checks:**
- [ ] Workflow is ACTIVE (not inactive)
- [ ] Cron expression is valid (test at crontab.guru)
- [ ] Timezone is correctly set
- [ ] Check execution logs for errors

### AI Generating Same Content
**Problem:** AI keeps generating similar tweets
**Fixes:**
- Increase temperature (0.8-1.0 for more creativity)
- Include more previous tweet context
- Add specific instructions: "Use a different angle than..."
- Use different prompts for different times of day

### Delay Not Working
**Problem:** Delay seems to be skipped
**Checks:**
- [ ] Duration is set correctly (not 0)
- [ ] Time unit is selected
- [ ] Not exceeding 30-day maximum
- [ ] Check execution logs for actual delay time

### AI Field Not Resolving
**Problem:** `{{AI:prompt}}` shows literally in output
**Checks:**
- [ ] Using correct syntax: `{{AI:instruction}}`
- [ ] Field supports AI (text/textarea fields)
- [ ] Workflow is running (not just designing)
- [ ] AI execution not hitting usage limit

---

## 💡 Pro Tips

1. **Vary Your Cron Schedules**
   - Not everyone needs every-4-hours posting
   - Consider your audience's time zones
   - Test different times and track engagement

2. **Use Temperature Wisely**
   - 0.3-0.5: Consistent, predictable
   - 0.7: Balanced (default)
   - 0.8-1.0: Creative, varied

3. **Structure AI Prompts Well**
   ```
   Good: "Generate a tweet about X feature. Focus on Y benefit. Include Z context."
   Bad: "Make a tweet about our product"
   ```

4. **Store Metadata**
   - Track which tweets perform best
   - Identify high-engagement categories
   - Use data to improve future prompts

5. **Start Simple**
   - Begin with Example 1 (AI Fields)
   - Add complexity as you learn
   - Don't over-engineer on day one

---

## 🎓 Learning Resources

### Understanding Cron Expressions
- **Tool:** https://crontab.guru
- **Examples:**
  - `0 9 * * *` = Every day at 9:00 AM
  - `0 */4 * * *` = Every 4 hours
  - `0 9 * * 1` = Every Monday at 9:00 AM
  - `0 9,13,17 * * *` = 9 AM, 1 PM, 5 PM daily

### AI Prompt Engineering
- Be specific about tone, length, style
- Include context (previous tweets, time of day)
- Specify constraints (character limits, hashtags)
- Give examples of desired output

### Twitter Best Practices
- **Optimal Posting Times:** 8-10 AM, 6-9 PM (local)
- **Tweet Length:** 71-100 characters get most engagement (but we can use up to 280)
- **Hashtags:** 2-3 is optimal, don't overdo it
- **Engagement:** Ask questions, use emojis sparingly, add value

---

## 📝 Template Workflows

### Template 1: Simple Daily Morning Tweet
```yaml
Name: Morning Motivation Tweet
Schedule: 0 9 * * * (9 AM daily)
Nodes:
  - Schedule Trigger
  - Twitter Post Tweet
    Text: {{AI:Generate a motivational tweet about productivity and workflow automation for ChainReact. Keep it under 280 characters with 2 hashtags.}}
```

### Template 2: Multi-Time Content Engine
```yaml
Name: All-Day Twitter Engine
Schedule: 0 9,13,17,21 * * * (4 times daily)
Nodes:
  - Schedule Trigger
  - Airtable List Records (tweet history)
  - AI Message (context-aware generation)
  - Twitter Post Tweet
  - Airtable Create Record (store new tweet)
```

### Template 3: Weekly Feature Highlight
```yaml
Name: Weekly Feature Friday
Schedule: 0 10 * * 5 (Fridays at 10 AM)
Nodes:
  - Schedule Trigger
  - AI Message
    Prompt: Generate a thread (3 tweets) highlighting a specific ChainReact feature in depth
  - Twitter Post Tweet (Tweet 1)
  - Delay (30 seconds)
  - Twitter Reply Tweet (Tweet 2, reply to Tweet 1)
  - Delay (30 seconds)
  - Twitter Reply Tweet (Tweet 3, reply to Tweet 2)
```

---

## ✅ Next Steps

1. **Set up your first workflow** using Example 1 (Simple Daily Tweet)
2. **Test it manually** before activating schedule
3. **Monitor results** for one week
4. **Iterate and improve** based on engagement
5. **Add complexity** (history tracking, multiple times) as needed

---

## 📚 Related Documentation

- `/learning/docs/action-trigger-implementation-guide.md` - Action/trigger development
- `/learning/docs/field-implementation-guide.md` - Understanding field types
- `/lib/workflows/actions/twitter/index.ts` - Twitter action source code
- `/lib/workflows/aiMessage.ts` - AI Message action implementation

---

## Questions?

**Can I post with images?**
Yes! Twitter Post Tweet action supports media upload (up to 4 images). Set the `mediaFiles` field.

**How do I avoid hitting rate limits?**
Twitter allows 300 tweets per 3 hours. At 4 tweets/day, you're well within limits.

**Can I schedule threads?**
Yes! Use Tweet → Delay → Reply → Delay → Reply pattern.

**What if I want different content on weekends?**
Use two workflows with different cron schedules:
- `0 9 * * 1-5` (Weekdays)
- `0 11 * * 0,6` (Weekends)

**How much does this cost?**
- Twitter API: Free for basic posting
- ChainReact: Included in your plan
- AI Usage: Check your plan's AI execution limits
