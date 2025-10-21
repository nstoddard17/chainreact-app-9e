# Workflow Advanced Features - Design Specification

**Created:** October 21, 2025
**Status:** 🎨 Design Phase

This document outlines the user experience and implementation design for all advanced workflow features.

---

## 1. Workflow History & Settings Pages

### Architecture Decision: Tabs within Builder

**Location:** `/workflows/builder/[id]` with tabs

**Why Tabs Instead of Separate Pages:**
- User stays in context of the workflow
- No navigation away from builder
- Faster switching between builder/history/settings
- Industry standard (Zapier, Make.com use tabs)

### Tab Structure

```
┌─────────────────────────────────────────────────┐
│  Workflow Name                        [Publish] │
├─────────────────────────────────────────────────┤
│  [Builder] [History] [Settings]                 │
├─────────────────────────────────────────────────┤
│                                                  │
│  Tab Content Here                                │
│                                                  │
└─────────────────────────────────────────────────┘
```

### Tab 1: Builder (Default)
- Current workflow canvas
- Add action buttons
- Test workflow button
- Node configuration

### Tab 2: History
Shows execution history with step-by-step details

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  Filters: [All] [Success] [Failed] [Last 7 days]│
├─────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────┐   │
│  │ Oct 21, 2025 3:45 PM          ✓ Success │   │
│  │ Triggered by: New Gmail Email            │   │
│  │ Duration: 2.3s  •  3 steps               │   │
│  │                                  [View >]│   │
│  └─────────────────────────────────────────┘   │
│                                                  │
│  ┌─────────────────────────────────────────┐   │
│  │ Oct 21, 2025 2:15 PM          ✗ Failed  │   │
│  │ Triggered by: New Gmail Email            │   │
│  │ Error: Slack channel not found           │   │
│  │                                  [View >]│   │
│  └─────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

**Clicking [View >] Opens Modal:**
```
┌─────────────────────────────────────────────────┐
│  Execution Details - Oct 21, 2025 3:45 PM       │
├─────────────────────────────────────────────────┤
│                                                  │
│  ✓ Step 1: Gmail - New Email                   │
│    Input:  subject: "Project Update"            │
│    Output: email_id: "abc123", from: "..."     │
│                                         [View JSON]│
│                                                  │
│  ✓ Step 2: AI Agent - Categorize Email         │
│    Input:  email_body: "The project..."         │
│    Output: category: "urgent", sentiment: "+" │
│                                         [View JSON]│
│                                                  │
│  ✓ Step 3: Slack - Send Message                │
│    Input:  channel: "alerts", message: "..."    │
│    Output: message_id: "xyz789", timestamp: ... │
│                                         [View JSON]│
│                                                  │
│  Total Duration: 2.3 seconds                    │
│  Tasks Used: 1                                   │
└─────────────────────────────────────────────────┘
```

**Key Features:**
- Each step shows input/output data
- Collapsed by default, expandable
- [View JSON] button for full payload
- Failed steps highlighted in red
- Error messages shown inline

### Tab 3: Settings

**Sections:**

1. **General Settings**
   - Workflow name
   - Description
   - Folder/organization

2. **Error Handling** ⭐
   ```
   ┌─────────────────────────────────────────┐
   │ Error Notifications                      │
   ├─────────────────────────────────────────┤
   │ [x] Enable error notifications           │
   │                                          │
   │ Notify me when this workflow fails:     │
   │ [ ] Email: user@example.com              │
   │ [ ] Slack: #alerts channel               │
   │ [ ] Discord: ChainReact Server           │
   │ [ ] SMS: +1 (555) 123-4567              │
   │                                          │
   │ Auto-retry failed steps:                 │
   │ [x] Enable automatic retries             │
   │ Max retries: [3 ▼]                       │
   │ Retry strategy: [Exponential backoff ▼]  │
   │   • First retry: 2 seconds              │
   │   • Second retry: 4 seconds             │
   │   • Third retry: 8 seconds              │
   └─────────────────────────────────────────┘
   ```

3. **Schedule** (if applicable)
   - Recurring schedule settings
   - One-time schedule
   - Timezone

4. **Advanced**
   - Concurrent execution limit
   - Timeout settings
   - Version history

**Error Notification Setup:**
- User checks boxes for notification channels
- Email is pre-filled with account email
- Slack/Discord show connected channels dropdown
- SMS requires phone verification

**Try/Catch Alternative Paths:**
- This is PER-NODE, not global workflow setting
- Configured in each action node's settings
- See "Per-Node Error Handling" section below

---

## 2. AI Agent Chain Differentiation UI

### The Challenge
Users need to define criteria for the AI to decide which chain (A, B, C, etc.) to execute based on trigger/action data.

### Solution: Smart Context-Aware Criteria Builder

**When user adds AI Agent node:**

1. **Detect Previous Node Output**
   - If after Gmail trigger: Show email-specific fields
   - If after Notion action: Show Notion-specific fields
   - If after custom action: Show generic JSON path selector

2. **Criteria Builder Interface**

```
┌─────────────────────────────────────────────────┐
│ AI Agent: Email Categorizer                     │
├─────────────────────────────────────────────────┤
│ The AI will analyze the trigger data and        │
│ automatically route to the appropriate chain.   │
│                                                  │
│ Chain A: Urgent Issues                          │
│ ┌───────────────────────────────────────────┐  │
│ │ Description (helps AI decide):             │  │
│ │ "Handle urgent customer issues, bugs, or   │  │
│ │  time-sensitive requests"                  │  │
│ │                                            │  │
│ │ Example criteria (optional):               │  │
│ │ • Subject contains: "urgent", "ASAP"       │  │
│ │ • Sentiment: negative                      │  │
│ │ • Priority: high                           │  │
│ └───────────────────────────────────────────┘  │
│                                                  │
│ Chain B: General Inquiries                      │
│ ┌───────────────────────────────────────────┐  │
│ │ Description:                               │  │
│ │ "Standard customer questions, feature      │  │
│ │  requests, or general communication"       │  │
│ │                                            │  │
│ │ Example criteria:                          │  │
│ │ • Subject contains: "question", "how"      │  │
│ │ • Sentiment: neutral or positive           │  │
│ └───────────────────────────────────────────┘  │
│                                                  │
│ [+ Add Another Chain]                            │
└─────────────────────────────────────────────────┘
```

**Key Features:**
- **Natural Language Descriptions:** User describes what each chain does
- **AI Makes Decision:** AI reads trigger data + descriptions + criteria
- **Optional Explicit Criteria:** User can add specific rules as hints
- **Context-Aware Suggestions:** System suggests common criteria based on previous node

**Example: After Gmail Trigger**

System shows common email criteria:
- Subject contains
- Body contains
- Sender email is
- Has attachment
- Sentiment (positive/negative/neutral)
- Priority/Urgency level
- Category (sales, support, billing, etc.)

**Example: After Notion Action**

System shows Notion-specific criteria:
- Status equals
- Priority equals
- Assignee is
- Tags include
- Date is before/after

### Implementation Detail: "Criteria Hints"

These are optional helpers, not hard if/else logic:
```typescript
{
  chain_a: {
    description: "Handle urgent issues",
    criteria_hints: [
      { field: "subject", operator: "contains", value: "urgent" },
      { field: "sentiment", operator: "equals", value: "negative" }
    ]
  }
}
```

The AI sees both the description AND the hints to make better decisions.

---

## 3. Path/If-Else Node - Smart Criteria Builder

### The Goal
Make conditional logic as simple as possible WITHOUT users typing code.

### Solution: Visual Criteria Builder

**Path Node Configuration:**

```
┌─────────────────────────────────────────────────┐
│ Path Node: Route Based on Conditions            │
├─────────────────────────────────────────────────┤
│ Previous step: Gmail - New Email                │
│                                                  │
│ Path A Conditions:                               │
│ ┌───────────────────────────────────────────┐  │
│ │ [Subject ▼] [contains ▼] [urgent        ] │  │
│ │                              [+ Add Rule] │  │
│ └───────────────────────────────────────────┘  │
│ ↓ Actions to run if conditions match            │
│                                                  │
│ Path B Conditions:                               │
│ ┌───────────────────────────────────────────┐  │
│ │ [Sender  ▼] [equals   ▼] [boss@comp.com ] │  │
│ │ AND                                        │  │
│ │ [Priority▼] [is       ▼] [high          ] │  │
│ │                              [+ Add Rule] │  │
│ └───────────────────────────────────────────┘  │
│ ↓ Actions to run if conditions match            │
│                                                  │
│ Else Path:                                       │
│ ↓ Actions to run if no conditions match         │
│                                                  │
│ [+ Add Another Path]                             │
└─────────────────────────────────────────────────┘
```

### Dropdown Options

**First Dropdown: Field Selection**
Shows all available fields from previous node output:

For Gmail trigger:
- Subject
- Body
- From
- To
- Has Attachment
- Attachment Count
- Labels
- Timestamp
- Custom (use variable)

**Second Dropdown: Operator**
Context-aware based on field type:

For text fields (subject, body):
- equals
- contains
- starts with
- ends with
- matches regex
- is empty
- is not empty

For number fields:
- equals
- greater than
- less than
- between

For boolean fields:
- is true
- is false

For list fields:
- includes
- does not include

**Third Input: Value**
- Text input for manual entry
- OR variable selector dropdown
- Shows {{variables}} from previous steps

### Multiple Conditions

User can add multiple rules within one path:
```
[Subject] [contains] [urgent]
AND
[Priority] [equals] [high]
```

OR logic:
```
[Subject] [contains] [urgent]
OR
[Subject] [contains] [ASAP]
```

### Variable Comparison

Allow comparing two variables:
```
[Status from Notion] [equals] [{{expected_status}}]
```

Where `{{expected_status}}` comes from a previous step.

---

## 4. Delay Action Node

### Two Types of Delays

**Type 1: Wait Duration**
```
┌─────────────────────────────────────┐
│ Delay: Wait Before Continuing        │
├─────────────────────────────────────┤
│ Wait for: [2 ▼] [hours ▼]           │
│                                      │
│ Options:                             │
│ • Minutes, Hours, Days, Weeks        │
└─────────────────────────────────────┘
```

**Type 2: Wait Until Date**
```
┌─────────────────────────────────────┐
│ Delay: Wait Until Specific Time      │
├─────────────────────────────────────┤
│ Wait until: [2025-10-25] [2:00 PM]  │
│                                      │
│ Or use variable:                     │
│ {{reminder_date}}                    │
└─────────────────────────────────────┘
```

### Follow-Up Email Question

**User's Question:** Should we auto-draft follow-up email based on first email, or let user draft both?

**Answer: Give Both Options**

**Option A: User Drafts Both (Simple)**
```
1. Send Gmail Email (user writes initial)
2. Delay 24 hours
3. Send Gmail Email (user writes follow-up)
```

**Option B: AI-Generated Follow-Up (Advanced)**
```
1. Send Gmail Email (user writes initial)
   - [x] Generate AI follow-up after delay
2. Delay 24 hours
3. Send Gmail Email (AI auto-populates based on #1)
   - Subject: "Re: {{original_subject}}"
   - Body: AI-generated follow-up tone
   - User can edit before publishing
```

**Recommendation:** Start with Option A (user drafts both) for simplicity. Add Option B as a Premium feature for Professional+ plans.

The checkbox "[x] Generate AI follow-up" appears in the first email node's settings when there's a Delay + Email combo detected.

---

## 5. HTTP Request / Webhook Action

### Configuration UI

```
┌─────────────────────────────────────────────────┐
│ HTTP Request: Send Data to API                   │
├─────────────────────────────────────────────────┤
│ Display Name:                                    │
│ "Send customer to CRM"                           │
│                                                  │
│ Request Type:                                    │
│ ( ) GET  (•) POST  ( ) PUT  ( ) DELETE  ( ) PATCH│
│                                                  │
│ URL:                                             │
│ https://api.mycrm.com/customers                  │
│                                                  │
│ Headers:                                         │
│ ┌───────────────────────────────────────────┐  │
│ │ Authorization: Bearer sk_live_xyz123      │  │
│ │ Content-Type: application/json            │  │
│ │                           [+ Add Header]  │  │
│ └───────────────────────────────────────────┘  │
│                                                  │
│ Body: (for POST/PUT/PATCH)                       │
│ ┌───────────────────────────────────────────┐  │
│ │ {                                          │  │
│ │   "name": "{{customer_name}}",             │  │
│ │   "email": "{{customer_email}}",           │  │
│ │   "source": "ChainReact Workflow"          │  │
│ │ }                                          │  │
│ │                                            │  │
│ │ [Format JSON] [Insert Variable ▼]         │  │
│ └───────────────────────────────────────────┘  │
│                                                  │
│ Query Parameters: (for GET)                      │
│ ┌───────────────────────────────────────────┐  │
│ │ [Key ▼] [Value            ] [-]            │  │
│ │                           [+ Add Param]    │  │
│ └───────────────────────────────────────────┘  │
│                                                  │
│ Authentication: [API Key ▼]                      │
│ • None                                           │
│ • API Key                                        │
│ • Bearer Token                                   │
│ • Basic Auth                                     │
│ • OAuth 2.0                                      │
│                                                  │
│ [Test Request] [Save]                            │
└─────────────────────────────────────────────────┘
```

### Key Features
- **Variable Insertion:** Click to insert {{variables}} from previous steps
- **Test Request:** Send real request to verify it works
- **Auth Templates:** Common auth patterns pre-configured
- **JSON Validation:** Auto-format and validate JSON body
- **Response Handling:** Save response data for use in next steps

### Common Use Cases
- "Send data to custom CRM"
- "Trigger external API"
- "Send webhook to Zapier/Make"
- "Post to internal dashboard"
- "Update external database"

---

## 6. Per-Node Error Handling (Try/Catch Alternative Paths)

### Implementation

Each action node has an "Error Handling" section in its settings:

```
┌─────────────────────────────────────────────────┐
│ Action: Send Slack Message                       │
├─────────────────────────────────────────────────┤
│ [Message] [Channel] [Error Handling]            │ (tabs)
│                                                  │
│ If this action fails:                            │
│                                                  │
│ (•) Stop workflow and notify                     │
│     Use global error settings                    │
│                                                  │
│ ( ) Retry with exponential backoff               │
│     Max retries: [3 ▼]                           │
│     ✓ First: 2s, Second: 4s, Third: 8s          │
│                                                  │
│ ( ) Run alternative path                         │
│     Connect to alternative nodes below           │
│     (Shows alternative connection point)         │
│                                                  │
│ ( ) Continue anyway (ignore error)               │
│     Mark step as failed but continue workflow    │
└─────────────────────────────────────────────────┘
```

### Visual Representation

When "Run alternative path" is selected:

```
         ┌──────────┐
         │  Gmail   │
         │ Trigger  │
         └────┬─────┘
              │
         ┌────▼──────┐
         │   Slack   │ ──┐ (success path)
         │  Message  │   │
         └────┬──────┘   │
              │          │ (error path, dashed red)
       ┌──────▼───────┐  │
       │ Send Success │  │
       │    Email     │  │
       └──────────────┘  │
                         │
              ┌──────────▼─────────┐
              │ Send Error to      │
              │ Discord #alerts    │
              └────────────────────┘
```

**Visual Cues:**
- Error paths shown as dashed red lines
- Success paths shown as solid blue lines
- Alternative nodes have orange outline

---

## 7. Schedule in Publish Modal

### Publish Modal Updates

```
┌─────────────────────────────────────────────────┐
│ Publish Workflow: "Send Daily Reports"          │
├─────────────────────────────────────────────────┤
│                                                  │
│ Activation Type:                                 │
│ ( ) Trigger-based (runs when event occurs)      │
│ (•) Scheduled (runs on a schedule)               │
│                                                  │
│ Schedule Settings:                               │
│ ┌───────────────────────────────────────────┐  │
│ │ Frequency: [Daily ▼]                       │  │
│ │   • Once, Hourly, Daily, Weekly, Monthly   │  │
│ │                                            │  │
│ │ Time: [9:00 AM ▼]                          │  │
│ │ Timezone: [America/New_York ▼]             │  │
│ │                                            │  │
│ │ Days: [✓] M [✓] T [✓] W [✓] Th [✓] F [ ] S [ ] Su │
│ │                                            │  │
│ │ Start: [Oct 21, 2025 ▼]                    │  │
│ │ End: [ Never ▼ ] or [specific date]        │  │
│ └───────────────────────────────────────────┘  │
│                                                  │
│ Next scheduled run: Oct 22, 2025 at 9:00 AM EST │
│                                                  │
│ [Cancel] [Publish Workflow]                      │
└─────────────────────────────────────────────────┘
```

### Schedule Options

**Frequency Types:**
1. **Once:** Run one time at specific date/time
2. **Hourly:** Every N hours
3. **Daily:** Every day at specific time
4. **Weekly:** Specific days of week at specific time
5. **Monthly:** Specific day of month (1st, 15th, last day, etc.)
6. **Custom (Cron):** For advanced users

**Key Features:**
- Visual day-of-week selector
- Timezone picker (detects user's timezone)
- Start/end date optional
- Preview of next run time
- Disable/enable schedule without unpublishing

---

## Summary Table

| Feature | Location | Type | Plan Required |
|---------|----------|------|---------------|
| Workflow History | Builder Tab | Tab | Free+ |
| Workflow Settings | Builder Tab | Tab | Free+ |
| Error Notifications | Settings Tab | Config | Starter+ |
| Auto-retry | Settings Tab | Config | Starter+ |
| AI Agent Chains | Node Config | Visual Builder | Professional+ |
| Path/If-Else Node | Node Type | Visual Builder | Starter+ |
| Delay Action | Node Type | Duration/Date | Starter+ |
| HTTP Request | Node Type | Form | Starter+ |
| Per-Node Error Handling | Node Settings | Dropdown | Starter+ |
| Scheduled Workflows | Publish Modal | Config | Starter+ |

---

## Next Steps

1. ✅ Create wireframes for each UI component
2. ⏭️ Implement Workflow History tab
3. ⏭️ Implement Workflow Settings tab
4. ⏭️ Build Path/If-Else visual criteria builder
5. ⏭️ Build AI Agent chain configuration UI
6. ⏭️ Implement Delay action node
7. ⏭️ Implement HTTP Request action node
8. ⏭️ Add schedule UI to publish modal
9. ⏭️ Implement per-node error handling
10. ⏭️ Test entire flow end-to-end
