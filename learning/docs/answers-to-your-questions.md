# Answers to Your Questions - Quick Reference

**Date:** October 21, 2025

## Question 1: Pricing - Option B Setup

**Q:** Can you set up Option B pricing (AI Agents in Professional) everywhere?

**A:** ✅ Done! Updated:
- `/lib/utils/plan-restrictions.ts` - AI Agents gated to Professional+ ($39/mo, 5,000 tasks)
- `/components/new-design/layout/NewSidebar.tsx` - Pricing modal now shows:
  - Starter: $14.99/mo - 1,000 tasks (no AI)
  - Professional: $39/mo - 5,000 tasks (**AI Agents included** - bolded)
  - Team: $79/mo - 50,000 tasks + team features
- `/components/plan-restrictions/UpgradePlanModal.tsx` - Shows "AI Agents included" for Professional

## Question 2: AI Agent Chain Differentiation

**Q:** How should users differentiate between Chain A vs Chain B? Should it show email-specific criteria like "mentions urgent" or "body contains"?

**A:** Yes! Here's the approach:

### Smart Context-Aware Criteria Builder

1. **System detects previous node type** (Gmail trigger → show email fields)
2. **User describes each chain in natural language:**
   - Chain A: "Handle urgent customer issues requiring immediate attention"
   - Chain B: "Process general inquiries and questions"
3. **Optionally add criteria hints:**
   - Subject contains: "urgent", "ASAP", "critical"
   - Sentiment: negative
   - Body contains: "broken", "not working"

### For Email Triggers, Show:
- Subject contains/equals
- Body contains/equals
- From email is
- Has attachment (yes/no)
- Sentiment (positive/neutral/negative) - AI-detected
- Priority/Urgency level - AI-detected
- Category - AI-detected

### For Other Triggers:
- Notion: Status, Priority, Assignee, Tags, Date
- Airtable: Field values, Record type
- Custom: JSON path selector

**Key Insight:** AI reads the description + criteria hints to make smart decisions. Criteria are "hints," not hard rules.

## Question 3: Path/If-Else Node Simplicity

**Q:** Instead of typing "if status === completed", can we show dropdown criteria like "status equals completed" with all possible values from previous node?

**A:** Absolutely! Visual criteria builder with 3 dropdowns:

### Example: After Notion Action

**Path A Conditions:**
```
[Dropdown 1: Field] → Shows: Status, Priority, Assignee, Tags, Date
[Dropdown 2: Operator] → Shows: equals, not equals, contains, is empty
[Dropdown 3: Value] → Shows: completed, in progress, todo (OR manual input)
```

**Path B Conditions:**
```
[Dropdown 1] [Dropdown 2] [Dropdown 3]
   Status       equals      completed
```

**Else Path:**
Runs if no conditions match.

### Operators by Field Type

**Text fields:**
- equals, contains, starts with, ends with, is empty, matches regex

**Number fields:**
- equals, greater than, less than, between

**Boolean:**
- is true, is false

**Lists:**
- includes, does not include

### Multiple Conditions

User can add:
```
Status equals "completed"
AND
Priority equals "high"
```

Or:
```
Body contains "urgent"
OR
Body contains "ASAP"
```

### Variable Comparison

```
[Status from Notion] [equals] [{{variable_from_step_2}}]
```

**No typing required!** All dropdown-based.

## Question 4: Delay + Follow-Up Email

**Q:** Should we auto-draft follow-up email based on first email, or let user draft both?

**A:** **Offer both options:**

### Option A: User Drafts Both (Launch with this)
```
1. Send Gmail Email (user writes initial email)
2. Delay 24 hours
3. Send Gmail Email (user writes follow-up email)
```
Simple, clear, no AI complexity.

### Option B: AI-Generated Follow-Up (Future Premium Feature)
```
1. Send Gmail Email (user writes initial)
   └─ Settings: [✓] Generate AI follow-up after delay
2. Delay 24 hours
3. Send Gmail Email (AI pre-fills based on step 1)
   - Subject: "Re: {{original_subject}}"
   - Body: AI-generated professional follow-up
   - User can edit before publishing
```

**Recommendation:** Launch with Option A. Add Option B as Professional+ feature later.

## Question 5: Schedule - Action Node or Publish Modal?

**Q:** Should schedule be an action node, or a publish modal setting?

**A:** **Both are needed:**

### Publish Modal Schedule (Workflow-Level)
For workflows that don't have a traditional trigger:
- "Send daily report at 9am"
- "Clean up database every Sunday"
- "Weekly reminder emails"

Located in Publish modal:
```
Activation Type:
( ) Trigger-based
(•) Scheduled

Frequency: [Daily ▼]
Time: [9:00 AM ▼]
Days: [✓] M [✓] T [✓] W [✓] Th [✓] F
```

### Delay Action Node (Mid-Workflow)
For workflows with triggers that need delays:
- Gmail triggers → wait 24 hours → send follow-up
- New lead → wait 3 days → check if responded
- Drip campaigns

Both serve different purposes!

## Question 6: HTTP Request Naming

**Q:** Should it be "HTTP Request" or something else?

**A:** **Display name: "HTTP Request"**
**Subtitle:** "Send data to custom API endpoint"

In Add Action menu:
```
┌────────────────────────────────┐
│ HTTP Request                    │
│ Send data to custom API endpoint│
└────────────────────────────────┘
```

Also add common aliases:
- "Webhook" (same action, alternate name)
- "API Call"
- "Custom Request"

Users can search for any of these terms and find it.

## Question 7: Error Handling - Where Does It Live?

**Q:** Where do workflow settings for error handling live? How do users discover it?

**A:** **Two locations:**

### Location 1: Workflow Settings Tab
```
[Builder] [History] [Settings] ← Click here
```

Inside Settings tab → "Error Handling" section:
- [✓] Enable error notifications
- Notify via: Email, Slack, Discord, SMS
- Auto-retry settings
- Global retry strategy: Exponential backoff

**Discovery:** When user first publishes workflow, show tooltip:
```
✨ New workflow published!
💡 Tip: Set up error notifications in the Settings tab
   so you're alerted if something breaks.
```

### Location 2: Per-Node Error Handling (Try/Catch)

**Q:** Is try/catch separate from workflow settings?

**A:** Yes! Each action node has its own "Error Handling" tab:

```
┌─────────────────────────────────┐
│ Send Slack Message               │
│ [Message] [Channel] [Error Handling] ← Tab
├─────────────────────────────────┤
│ If this action fails:            │
│                                  │
│ (•) Stop workflow (use global)   │
│ ( ) Retry automatically          │
│ ( ) Run alternative path         │
│ ( ) Continue anyway              │
└─────────────────────────────────┘
```

**"Run alternative path"** option:
- Adds error connection point on node
- Dashed red line to alternative nodes
- Example: Slack fails → send Discord instead

Visual on canvas:
```
      ┌─────────┐
      │ Trigger │
      └────┬────┘
           │
      ┌────▼────────┐
      │ Send Slack  │━━━━┐ (dashed red = error path)
      └────┬────────┘    │
           │ (solid blue = success)
      ┌────▼────────┐    │
      │ Log Success │    │
      └─────────────┘    │
                    ┌────▼──────────┐
                    │ Send Discord  │
                    │ (error alert) │
                    └───────────────┘
```

## Question 8: Exponential Backoff Explanation

**Q:** Explain exponential backoff to users.

**A:** **In UI, show this:**

```
┌──────────────────────────────────────────┐
│ Auto-retry Settings                       │
├──────────────────────────────────────────┤
│ [✓] Enable automatic retries              │
│                                           │
│ Max retries: [3 ▼]                        │
│                                           │
│ Retry strategy: [Exponential backoff ▼]  │
│                                           │
│ ℹ️ How it works:                          │
│   If the action fails, ChainReact will    │
│   wait a bit and try again. Each retry    │
│   waits longer than the last:             │
│                                           │
│   • 1st retry: 2 seconds                  │
│   • 2nd retry: 4 seconds                  │
│   • 3rd retry: 8 seconds                  │
│                                           │
│   This gives external services time to    │
│   recover from temporary issues.          │
└──────────────────────────────────────────┘
```

**Why exponential?** Prevents hammering failing services. If Slack is down for 2 seconds, waiting 2s, 4s, 8s gives it time to recover.

## Question 9: Error Notification Setup

**Q:** How do users set up error notifications? Try/catch implementation?

**A:** **Error Notifications (Workflow Settings Tab):**

```
┌────────────────────────────────────────┐
│ Error Notifications                     │
├────────────────────────────────────────┤
│ [✓] Notify me when this workflow fails  │
│                                         │
│ Send notifications to:                  │
│ [✓] Email: user@example.com             │
│ [✓] Slack: #alerts channel ▼            │
│ [ ] Discord: ChainReact Server ▼        │
│ [ ] SMS: +1 (555) 123-4567 (verify)     │
│                                         │
│ Include in notification:                │
│ [✓] Error message                       │
│ [✓] Failed step name                    │
│ [✓] Input data                          │
│ [✓] Link to execution history           │
└────────────────────────────────────────┘
```

**Try/Catch Implementation:**
See "Location 2: Per-Node Error Handling" above. It's a per-node setting, not global.

## Question 10: Workflow History - Where Should It Live?

**Q:** Should it be `/workflow/id/history` page, modal, or tabs?

**A:** **Tabs within builder:**

```
/workflows/builder/[id]
```

With tabs:
```
[Builder] [History] [Settings]
```

**Why tabs?**
- User stays in workflow context
- Faster switching
- Industry standard (Zapier, Make.com)
- No navigation away from builder

**History Tab Shows:**
- List of all executions
- Filters: All, Success, Failed, Date range
- Each execution shows: timestamp, trigger, duration, status
- Click [View >] opens detailed modal with step-by-step data

**Settings Tab Shows:**
- General settings (name, description)
- Error handling config
- Schedule settings (if applicable)
- Advanced options

**Also includes your idea:** Show execution data inline in nodes during test runs (see image example you provided - I'll implement this visual overlay feature).

## Summary of Decisions

| Feature | Implementation |
|---------|----------------|
| **Pricing** | Option B - AI in Professional ($39/mo) ✅ |
| **AI Chain Criteria** | Context-aware dropdown + natural language descriptions |
| **Path/If-Else** | 3-dropdown visual builder (Field/Operator/Value) |
| **Delay Follow-Up** | User drafts both (launch), AI-gen later (premium) |
| **Schedule** | Both: Publish modal (workflow-level) + Delay node (mid-flow) |
| **HTTP Request** | "HTTP Request - Send data to custom API endpoint" |
| **Error Settings** | Workflow Settings tab (global) + Per-node Error Handling tab |
| **Try/Catch** | Per-node "Run alternative path" option with visual connections |
| **Exponential Backoff** | 2s, 4s, 8s with explanation tooltip |
| **History Location** | Builder tabs: [Builder] [History] [Settings] |

All designs are in `/learning/docs/workflow-advanced-features-design.md` for full wireframes and details!
