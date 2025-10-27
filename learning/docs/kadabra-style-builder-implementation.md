# Kadabra-Style Workflow Builder - Implementation Guide

**Created:** October 26, 2025
**Status:** Complete Implementation Ready
**Purpose:** Complete guide for using the new Kadabra-style AI workflow builder

---

## 🎯 What We've Built

A complete Kadabra-style AI workflow building experience that includes:

1. ✅ **Natural Language Workflow Creation** - Describe in plain English, get a working workflow
2. ✅ **Plan Approval UI** - Review and approve the AI's plan before building
3. ✅ **Sequential Node Building** - Builds one node at a time, not all at once
4. ✅ **Interactive Chat Configuration** - All config happens in chat with "Press Enter ↵" UX
5. ✅ **Inline OAuth** - Connect integrations right in the chat flow
6. ✅ **Animated Cursor Tutorials** - Shows users where their data went
7. ✅ **Node Testing** - Tests each node after configuration
8. ✅ **Seamless Variable Passing** - Auto-maps variables between nodes
9. ✅ **Manual Workflow Building** - Non-AI users can still build workflows

---

## 📂 File Structure

```
lib/workflows/ai/
├── SequentialWorkflowBuilder.ts      # Core sequential builder engine
├── TutorialOrchestrator.ts           # Animated tutorial system

components/workflows/ai/
├── KadabraStyleWorkflowBuilder.tsx   # Main integration component
├── WorkflowPlanApproval.tsx          # Plan approval UI
├── InteractiveNodeConfig.tsx         # Chat-based config UI
├── AnimatedCursor.tsx                # Animated cursor component

app/api/ai/
├── generate-workflow-plan/route.ts   # AI plan generation endpoint
```

---

## 🚀 How to Use

### Step 1: Add to Your App

Create a new page or integrate into existing workflow builder:

**File:** `app/workflows/ai/page.tsx`

```typescript
import { KadabraStyleWorkflowBuilder } from '@/components/workflows/ai/KadabraStyleWorkflowBuilder'
import { useSession } from '@/hooks/useSession'
import { useRouter } from 'next/navigation'

export default function AIWorkflowBuilderPage() {
  const { user, organization } = useSession()
  const router = useRouter()

  if (!user) {
    router.push('/login')
    return null
  }

  return (
    <KadabraStyleWorkflowBuilder
      userId={user.id}
      organizationId={organization.id}
      onWorkflowComplete={(nodes, edges) => {
        // Save the workflow
        console.log('Workflow complete!', { nodes, edges })
        router.push(`/workflows/${workflowId}`)
      }}
      onCancel={() => {
        router.push('/workflows')
      }}
    />
  )
}
```

### Step 2: Set Up Environment Variables

**GOOD NEWS:** If you already have OpenAI set up for your AI workflows, the AI workflow builder will use the same API key!

Make sure you have OpenAI API key in your `.env.local` file:

```bash
OPENAI_API_KEY=sk-...
```

**If you don't have it yet:**
1. Go to https://platform.openai.com/api-keys
2. Create an account or sign in
3. Click "Create new secret key"
4. Copy it to your `.env.local` file

**Without this key, you will see:**
> "AI service not configured. Please set OPENAI_API_KEY environment variable."

### Step 3: That's It!

The system is fully self-contained. Just navigate to `/workflows/ai` and start describing workflows.

---

## 🎬 User Experience Flow

### 1. Initial Prompt

User sees a clean interface with example prompts:
- "Send a Slack message when I get an email from support@example.com"
- "Log customer feedback emails to a Google Sheet"
- etc.

User types: **"When I get an email from a customer, analyze the sentiment and log it to a Google Sheet"**

### 2. AI Generates Plan

Chat shows:
> "Let me think about how to build this workflow..."

AI generates a plan with 5 steps:
1. Create Google Sheet for logging
2. Monitor Gmail for customer emails
3. Extract sentiment with AI
4. Transform data for logging
5. Insert row into Google Sheet

### 3. Plan Approval

Beautiful plan card shows:
- Workflow name: "Customer Email Sentiment Logger"
- Estimated time: "2-3 minutes"
- All 5 steps with icons and descriptions
- Big blue "Let's build this!" button

### 4. Sequential Building

**Node 1: Create Google Sheet**

```
Agent: "Step 1 of 5: Create Sentiment Log Sheet"

[Connect to Google button]

After connection:
Agent: "What should we name the spreadsheet?"
[Text input with "Press Enter ↵" label]

User types: "Customer Sentiment Log"
[Value appears below with green checkmark]

[Continue] [Skip]
```

**Tutorial Animation:**
- Cursor moves to the new node on canvas
- Double-clicks to open config
- Scrolls to show where "Customer Sentiment Log" is stored
- Closes config
- Right-clicks and clicks "Test Node"

**Node 2: Monitor Gmail**

```
Agent: "Step 2 of 5: Monitor Customer Emails"

Already connected to Google ✓

Agent: "Which email addresses should I watch for?"
[Text input: "support@example.com" - Press Enter ↵]
✓ support@example.com
[Text input: "sales@example.com" - Press Enter ↵]
✓ sales@example.com

[Continue] [Skip]
```

Tutorial shows where these emails are configured.

**Continues for all 5 nodes...**

### 5. Workflow Complete

```
Agent: "🎉 Your workflow is complete! All nodes are configured and tested."

[View Workflow] [Create Another]
```

Nodes are already on the canvas, edges are auto-created with variable mappings!

---

## 🔧 How It Works (Technical)

### Architecture

```
User Prompt
    ↓
AI Plan Generation (Claude API)
    ↓
SequentialWorkflowBuilder
    ├── Generates plan
    ├── Gets user approval
    ├── For each node:
    │   ├── Check auth
    │   ├── Collect config (interactive chat)
    │   ├── Create node
    │   ├── Run tutorial (animated cursor)
    │   └── Test node
    └── Create edges with variable mappings
    ↓
Complete Workflow (nodes + edges)
```

### Event Flow

The `SequentialWorkflowBuilder` emits events:

1. `plan_generated` - AI created the plan
2. `awaiting_plan_approval` - Waiting for user
3. `plan_approved` - User clicked "Let's build this!"
4. `node_starting` - Starting node N of M
5. `needs_auth` - Need to connect provider
6. `auth_complete` - OAuth successful
7. `collecting_config` - Show field input
8. `config_collected` - User provided value
9. `config_complete` - All fields done
10. `node_creating` - Creating node object
11. `node_created` - Node added to canvas
12. `tutorial_starting` - Starting animation
13. `tutorial_step` - Each tutorial action
14. `tutorial_complete` - Animation done
15. `testing_node` - Running node test
16. `node_tested` - Test result
17. `node_complete` - Moving to next
18. `workflow_complete` - All done!

### Tutorial Animation

The `TutorialOrchestrator` scripts cursor movements:

```typescript
const tutorial = new TutorialOrchestrator((state) => {
  // Update cursor position and animation
  setCursorState(state)
})

tutorial.buildNodeConfigTutorial(nodeId)
await tutorial.play()
```

Steps:
1. Move to node (1000ms)
2. Wait (500ms)
3. Double-click (500ms) + actually open config
4. Wait for modal (800ms)
5. Move to content (600ms)
6. Scroll (2000ms)
7. Wait (1000ms)
8. Move to close (500ms)
9. Click close (300ms)
10. Move back to node (800ms)
11. Right-click (500ms)
12. Click "Test" (300ms)

Total: ~8 seconds of beautiful UI demonstration!

### Variable Mapping

When creating edges:

```typescript
const sourceOutputs = [
  { name: 'from', type: 'string', label: 'From Email' },
  { name: 'subject', type: 'string', label: 'Subject' },
  { name: 'body', type: 'string', label: 'Email Body' }
]

const targetInputs = [
  { name: 'text', type: 'string', label: 'Text to Analyze' }
]

// Auto-map: body → text
const mapping = {
  'text': '{{body}}'
}
```

Variables flow seamlessly!

---

## 🎨 Customization

### Change AI Model

Edit `app/api/ai/generate-workflow-plan/route.ts`:

```typescript
const completion = await openai.chat.completions.create({
  model: 'gpt-4o', // Options: gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo
  max_tokens: 4000,
  temperature: 0.7, // Adjust creativity (0-1)
  // ...
})
```

**Model Recommendations:**
- `gpt-4o` - Best results, higher cost (current default)
- `gpt-4o-mini` - Good balance, lower cost (recommended for production)
- `gpt-4-turbo` - Fast, good quality
- `gpt-3.5-turbo` - Budget option (may produce less accurate plans)

### Add More Node Types

Edit the `NODE_CATALOG` constant:

```typescript
const NODE_CATALOG = `
Available Nodes:

TRIGGERS:
- gmailTrigger: ...
- YOUR_NEW_TRIGGER: ...

ACTIONS:
- gmailSendEmail: ...
- YOUR_NEW_ACTION: ...
`
```

### Customize Tutorial Speed

Edit `TutorialOrchestrator.ts` durations:

```typescript
{
  type: 'move',
  duration: 1000, // Make faster: 500
}
```

### Change Color Scheme

Edit component styles:

```typescript
// From blue to purple:
className="bg-blue-600" → className="bg-purple-600"
className="text-blue-600" → className="text-purple-600"
```

---

## 🧪 Testing

### Manual Test

1. Navigate to `/workflows/ai`
2. Type: "Send me an email every morning with yesterday's Airtable records"
3. Approve the plan
4. Watch it build!

### Playwright Test

**File:** `tests/ai-workflow-builder.spec.ts`

```typescript
import { test, expect } from '@playwright/test'

test('AI workflow builder creates workflow', async ({ page }) => {
  await page.goto('/workflows/ai')

  // Type prompt
  await page.fill('input[placeholder*="Describe"]',
    'Send a Slack message when I get an email')
  await page.click('button:has-text("Generate")')

  // Wait for plan
  await expect(page.locator('text=Let\'s build this!')).toBeVisible({ timeout: 30000 })

  // Approve plan
  await page.click('button:has-text("Let\'s build this!")')

  // Wait for first config
  await expect(page.locator('text=Press Enter')).toBeVisible({ timeout: 5000 })

  // Provide values
  // ... fill in config fields ...

  // Wait for completion
  await expect(page.locator('text=Your workflow is complete!')).toBeVisible({
    timeout: 60000
  })

  // Verify nodes on canvas
  const nodes = await page.locator('[data-id]').count()
  expect(nodes).toBeGreaterThan(0)
})
```

---

## 🐛 Troubleshooting

### Issue: AI Doesn't Generate Plan

**Check:**
1. Is `ANTHROPIC_API_KEY` set?
2. Check console for API errors
3. Is prompt too vague? Try being more specific

**Fix:**
```bash
# Verify API key
echo $ANTHROPIC_API_KEY

# Test API directly
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-3-5-sonnet-20241022","max_tokens":1024,"messages":[{"role":"user","content":"Hello"}]}'
```

### Issue: OAuth Not Working

**Check:**
1. OAuth credentials configured in Supabase?
2. Redirect URLs correct?
3. Check `/api/integrations/[provider]/status` endpoint

**Fix:**
See `/learning/docs/oauth-setup-guide.md`

### Issue: Tutorial Cursor Doesn't Animate

**Check:**
1. Are node IDs correct? (Use `data-id` attribute)
2. Is modal using `data-modal="node-config"` attribute?
3. Check browser console for errors

**Fix:**
Add data attributes to your components:

```tsx
// On nodes
<div data-id={node.id}>...</div>

// On config modal
<div data-modal="node-config">
  <div data-modal-content="config-fields">...</div>
  <button data-modal-close>Close</button>
</div>

// On context menu
<button data-action="test-node">Test Node</button>
```

### Issue: Variables Not Passing Between Nodes

**Check:**
1. Do nodes have `outputSchema` defined?
2. Are edges created with `data.variables` mapping?
3. Is execution engine resolving `{{fieldName}}` syntax?

**Fix:**
Ensure node definitions include schemas:

```typescript
{
  type: 'gmailGetEmails',
  outputSchema: {
    fields: [
      { name: 'from', type: 'string', label: 'From' },
      { name: 'body', type: 'string', label: 'Body' }
    ]
  }
}
```

---

## 📈 Next Steps

### Phase 1: Launch (You Are Here!)
- [x] Basic AI workflow generation
- [x] Sequential building
- [x] Interactive config
- [x] Animated tutorials
- [x] Variable passing

### Phase 2: Enhancements
- [ ] Multi-turn conversation refinement
- [ ] "Edit workflow with AI" for existing workflows
- [ ] Workflow templates from AI-generated workflows
- [ ] Smart error recovery

### Phase 3: Advanced Features
- [ ] AI suggests optimizations
- [ ] Learns from user's past workflows
- [ ] Collaborative editing with AI assistant
- [ ] Natural language debugging

---

## 🎓 Learning Resources

### Understanding the Code

1. **Start here:** `lib/workflows/ai/SequentialWorkflowBuilder.ts`
   - This is the brain of the system
   - Async generator pattern for sequential execution

2. **Then:** `components/workflows/ai/KadabraStyleWorkflowBuilder.tsx`
   - See how events are handled
   - How UI responds to builder events

3. **Finally:** `lib/workflows/ai/TutorialOrchestrator.ts`
   - Learn how animations are scripted
   - DOM manipulation techniques

### Key Concepts

**Async Generators:**
```typescript
async *buildWorkflow() {
  yield { type: 'step1' }
  await delay(1000)
  yield { type: 'step2' }
  // etc.
}
```

**Event-Driven Architecture:**
```typescript
builder.addEventListener((event) => {
  switch (event.type) {
    case 'node_created':
      updateUI(event.node)
      break
  }
})
```

**DOM Manipulation:**
```typescript
const element = document.querySelector('[data-id="node-1"]')
element.dispatchEvent(new MouseEvent('dblclick'))
```

---

## 🙏 Credits

Inspired by Kadabra's excellent UX (getkadabra.com)

Built for ChainReact by Claude Code

---

*For support, see `/learning/docs/` or ask in Discord*
