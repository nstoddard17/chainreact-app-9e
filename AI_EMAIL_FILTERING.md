# AI-Powered Email Filtering

## Overview
Gmail "New Email" trigger now supports **AI-powered semantic filtering** built directly into the node. No separate classifier node needed!

## How It Works

### Example 1: Specific Email Address
**User says:** "When I get an email from stoddard.nathaniel@yahoo.com send it to slack"

**AI Agent configures:**
- `from`: "stoddard.nathaniel@yahoo.com"
- `aiContentFilter`: (empty)

**Result:** Triggers only on emails from that specific address. Fast, native Gmail filtering.

---

### Example 2: Semantic Topic Matching
**User says:** "When I get an email about our return policy send it to slack"

**AI Agent configures:**
- `from`: (empty - any sender)
- `subject`: (empty - any subject)
- `aiContentFilter`: "emails asking about or discussing our company's return policy"
- `aiFilterConfidence`: "medium"

**Result:**
1. Gmail trigger fires on ANY new email
2. AI reads the email body + subject
3. AI determines if it's about return policy (semantic understanding, not keywords)
4. If YES (confidence ≥ 70%) → workflow continues → send to Slack
5. If NO → workflow stops, nothing happens

---

### Example 3: Hybrid Filtering
**User says:** "When I get an email from support@company.com about billing issues send it to slack"

**AI Agent configures:**
- `from`: "support@company.com"
- `aiContentFilter`: "emails discussing billing issues, payment problems, or invoice questions"

**Result:**
- Native Gmail filter: Only from support@company.com (fast)
- Then AI filter: Only if about billing issues (semantic)
- Best of both worlds!

---

## Technical Implementation

### Schema Addition
Added two new fields to `gmail_trigger_new_email`:

```typescript
{
  name: "aiContentFilter",
  label: "AI Content Filter (Optional)",
  type: "textarea",
  description: "🤖 Use AI to filter emails by meaning and context..."
},
{
  name: "aiFilterConfidence",
  label: "AI Filter Strictness",
  type: "select",
  options: ["low" (50%), "medium" (70%), "high" (90%)]
}
```

### Execution Flow

**File:** `/lib/webhooks/gmail-processor.ts` (to be updated)

```typescript
async function processGmailEmail(email: Email, workflowConfig: Config) {
  // 1. Apply native Gmail filters (fast)
  if (!matchesBasicFilters(email, workflowConfig)) {
    return; // Stop early
  }

  // 2. If AI content filter is set, run semantic analysis
  if (workflowConfig.aiContentFilter) {
    const aiResult = await classifyEmailContent({
      intent: workflowConfig.aiContentFilter,
      emailBody: email.body,
      emailSubject: email.subject,
      threshold: workflowConfig.aiFilterConfidence || 'medium'
    });

    if (!aiResult.matches) {
      console.log(`Email filtered by AI: ${aiResult.reasoning}`);
      return; // Stop workflow
    }

    console.log(`Email matched AI filter (${aiResult.confidence}%): ${aiResult.reasoning}`);
  }

  // 3. Continue with workflow execution
  await executeWorkflow(email);
}
```

### AI Prompt Enhancement

**File:** `/lib/workflows/builder/agent/emailFilterDetector.ts`

The AI planner analyzes user prompts to detect:
- **Email addresses** → Configure `from` field
- **Semantic topics** (e.g., "about returns") → Configure `aiContentFilter`
- **Hybrid** → Configure both

---

## Benefits

✅ **No extra nodes** - All filtering built into one trigger node
✅ **Semantic understanding** - Goes beyond keyword matching
✅ **Efficient** - Native filters first (fast), AI second (if needed)
✅ **Intuitive** - Users just describe what they want in plain English
✅ **Flexible** - Supports exact matching OR semantic matching OR both

---

## Implementation Status

1. ✅ Update Gmail trigger schema (DONE)
2. ✅ Implement AI filtering in Gmail webhook processor (DONE)
3. ⏳ Update AI planner to detect semantic filtering intent (NEXT)
4. ⏳ Test with real Gmail emails
5. ⏳ Add usage metrics/costs (AI calls per email)

## Completed Implementation Details

### Files Modified

**1. Schema Definition:** [newEmail.schema.ts](lib/workflows/nodes/providers/gmail/triggers/newEmail.schema.ts)
- Added `aiContentFilter` textarea field with helpful examples
- Added `aiFilterConfidence` dropdown (low/medium/high strictness)
- Updated descriptions to clarify "blank = any" behavior

**2. Webhook Processor:** [gmail-processor.ts](lib/webhooks/gmail-processor.ts)
- Added `classifyEmailWithAI()` function using Claude 3.5 Sonnet
- Updated `GmailTriggerFilters` type with AI fields
- Modified `resolveGmailTriggerFilters()` to extract AI config
- Updated `checkEmailMatchesFilters()` to be async and call AI classifier
- Added proper error handling with fail-open strategy

**3. Filter Resolution:**
```typescript
function resolveGmailTriggerFilters(triggerNode: any): GmailTriggerFilters {
  return {
    from: normalizeFromFilters(rawConfig, savedOptions),
    subject: normalizeSubjectFilter(rawConfig),
    subjectExactMatch: rawConfig?.subjectExactMatch ?? true,
    hasAttachment: normalizeAttachmentFilter(rawConfig),
    aiContentFilter: rawConfig?.aiContentFilter?.trim() || undefined,
    aiFilterConfidence: rawConfig?.aiFilterConfidence || 'medium'
  }
}
```

**4. AI Classification Logic:**
- Uses Claude 3.5 Sonnet with 512 max tokens
- Temperature 0.3 for consistent classification
- Returns: `{ matches: boolean, confidence: number, reasoning: string }`
- Applies threshold based on confidence level (low=50%, medium=70%, high=90%)
- Security-conscious logging (no email content in logs)
- Fail-open: If AI errors, workflow continues (doesn't block emails)

---

## Cost Considerations

- **Without AI filter:** $0 per email (uses Gmail's native filtering)
- **With AI filter:** ~$0.001 per email checked (~500 tokens/email)
- **Smart execution:** AI only runs if basic filters pass first

Example: 1000 emails/day with AI filtering = ~$1/day = ~$30/month
