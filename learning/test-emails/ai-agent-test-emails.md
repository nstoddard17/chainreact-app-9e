# AI Agent Test Emails - Subtle Classification Challenge

## Purpose
Test the AI agent's ability to classify emails with minimal obvious keywords. These emails are intentionally subtle to see how well the AI understands context and intent.

---

## Test Email 1: Subtle Sales Inquiry
**Subject:** Quick question about your platform

**Body:**
```
Hi there,

I was browsing around and came across your tool. We're a team of about 15 people and have been struggling with some repetitive tasks lately.

Would love to learn more about what you offer and how it might fit our needs. Is there someone I could chat with this week?

Thanks,
Sarah Chen
Marketing Manager
```

**Expected Classification:** Sales (interest in product, team size mentioned, asking for demo/chat)

---

## Test Email 2: Very Subtle Support Request
**Subject:** Having trouble with something

**Body:**
```
Hey,

I've been using the workflow builder and noticed something odd. When I try to save my changes, it just keeps spinning. I've tried refreshing a few times but same issue.

Any ideas?

Mike
```

**Expected Classification:** Support (describes a problem, asks for help fixing it)

---

## Test Email 3: Vague Sales Lead
**Subject:** Saw you on Product Hunt

**Body:**
```
Congrats on the launch!

Our company has been looking for something exactly like this. We currently handle everything manually which is killing us.

What's the best way to see this in action? We'd probably need it for our whole department (around 30 users).

Best,
Alex Rodriguez
Operations Director, TechCorp
```

**Expected Classification:** Sales (company interest, scalability question, job title indicates decision maker)

---

## Test Email 4: Subtle Support (Disguised as Question)
**Subject:** Question about integrations

**Body:**
```
Hi,

I connected my Gmail account yesterday but I'm not seeing any of my emails show up in the workflow. Is there a delay or something I need to configure?

Thanks
```

**Expected Classification:** Support (troubleshooting existing setup, technical issue)

---

## Test Email 5: Internal/Team Communication
**Subject:** Re: Tomorrow's standup

**Body:**
```
Hey team,

I won't be able to make tomorrow's standup - have a dentist appointment. Can someone take notes for me?

Also, I pushed those changes to the staging environment if anyone wants to test.

Thanks!
```

**Expected Classification:** Internal (mentions team, standup, internal processes)

---

## Test Email 6: Tricky Mixed Intent
**Subject:** Love the product, but...

**Body:**
```
Hi,

I've been using ChainReact for the past week and it's amazing! Really impressed.

One thing though - I tried to set up the Discord integration but it keeps saying "authentication failed." I followed the docs but no luck.

Also, we're thinking about upgrading to a team plan. Do you have any resources on the differences between plans?

Cheers,
Jordan
```

**Expected Classification:** Support (primarily about fixing an issue, upgrade question is secondary)

---

## Test Email 7: Extremely Subtle Sales
**Subject:** Curious

**Body:**
```
Hey,

A colleague mentioned you folks the other day. We're always looking for ways to work smarter.

Do you have any case studies or examples of teams using this?

- Pat
```

**Expected Classification:** Sales (exploratory interest, asking for proof/validation, no existing issue)

---

## Test Email 8: Support Disguised as Feedback
**Subject:** Feedback

**Body:**
```
Hey there,

The new workflow builder is great, but I'm finding that my workflows aren't triggering when they should. I set up a Gmail trigger for new emails but nothing happens.

Is this a known issue or am I doing something wrong?

Thanks
```

**Expected Classification:** Support (describes technical problem, needs troubleshooting)

---

## Test Email 9: Very Vague Internal
**Subject:** Quick sync

**Body:**
```
Can we jump on a call sometime today? Need to discuss the Q4 roadmap items and get your input on priorities.

Also, did you see the metrics from last week? Pretty solid numbers.
```

**Expected Classification:** Internal (colleague-to-colleague communication, internal planning)

---

## Test Email 10: Subtle Sales - Price Shopping
**Subject:** Pricing question

**Body:**
```
Hi,

We're evaluating a few different automation tools. Your platform looks interesting.

What kind of pricing do you offer for around 50 users? Also, do you have annual discounts?

Thanks,
Kim Lee
IT Manager
```

**Expected Classification:** Sales (price shopping = buying intent, job title, team size)

---

## How to Test

1. **Set up the workflow** from the Smart Email Triage template
2. **Configure all integrations** (Gmail, Discord/Slack, Airtable)
3. **Send these emails to yourself** from different accounts or use +tags (e.g., yourname+test1@gmail.com)
4. **Watch the workflow execute** and see where each email gets routed
5. **Check Discord/Slack** to see if the classification was correct
6. **Review Airtable** to see the logged data

## Success Criteria

✅ **Good Performance:** 8+ out of 10 emails classified correctly
⚠️ **Needs Tuning:** 5-7 out of 10 emails classified correctly
❌ **Needs Work:** Less than 5 out of 10 emails classified correctly

## Notes

- Email #6 is intentionally tricky (mixed intent) - either classification could be reasonable
- The AI should focus on the PRIMARY intent, not secondary mentions
- Look for contextual clues: job titles, team sizes, problem descriptions, internal jargon
