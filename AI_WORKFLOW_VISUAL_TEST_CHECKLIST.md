# AI Workflow Visual Testing Checklist & Fixes

## Pre-Test Setup
1. Open browser DevTools Console (F12)
2. Clear console
3. Navigate to http://localhost:3001/workflows/ai-agent
4. Have this checklist ready to mark off items

## Step-by-Step Visual Test

### 🔍 Step 1: AI Agent Page
**What to Check:**
- [ ] Page loads without errors
- [ ] Input field is visible and functional
- [ ] Can type: "when I get an email, send it to Slack"

**Common Issues & Fixes:**
- If page doesn't load: Check console for errors
- If integrations aren't loading: Check `/api/integrations` is returning data

---

### 🔍 Step 2: After Clicking Send
**What Should Happen:**
- [ ] Redirects to `/workflows/builder/{id}?aiChat=true&initialPrompt=...`
- [ ] React Agent panel opens automatically on the right
- [ ] Shows "Analyzing your request..." message

**Console Should Show:**
```
[NewWorkflowBuilderContent] Processing initial prompt: when I get an email, send it to Slack
[NewWorkflowBuilderContent] Connected integrations for initial prompt: [...]
```

**If Not Working:**
- Check if redirect URL has `initialPrompt` parameter
- Verify `aiChat=true` is in URL
- Look for errors in console

---

### 🔍 Step 3: Planning Phase
**What Should Show:**
- [ ] "Analyzing your request..." status message
- [ ] No approval dialog (should auto-approve)

**Console Should Show:**
```
[STREAM] Auto-approving plan, continuing to build immediately
[STREAM] Plan structure: { hasNodes: true, nodeCount: 2, planKeys: [...] }
```

**If Seeing Errors:**
- `Stream workflow error`: Check plan structure is valid
- `Invalid plan structure`: AI response format is wrong

---

### 🔍 Step 4: Batch Node Creation (CRITICAL)
**What Should Happen IMMEDIATELY:**
- [ ] Message: "Creating workflow structure..."
- [ ] ALL nodes appear at once (e.g., Gmail trigger AND Slack action)
- [ ] Nodes have dashed gray borders
- [ ] Nodes are semi-transparent (60% opacity)
- [ ] Nodes show "Pending" badge
- [ ] ALL edges/connections appear between nodes
- [ ] Nodes are collapsed (not expanded)

**Console Should Show:**
```
[INITIAL_PROMPT] Auto-building plan: [nodes array]
[STREAM] Phase 2: Starting node creation
[INITIAL_PROMPT] node_created (for each node with isPending: true)
[INITIAL_PROMPT] edge_created
```

**If Nodes Don't All Appear:**
- Check `creating_all_nodes` event is received
- Verify each `node_created` has `isPending: true`
- Look for `optimizedOnNodesChange` calls

**If Nodes Don't Look Right:**
- Missing dashed border: Check CustomNode.tsx has `case 'pending'`
- Not semi-transparent: Verify `opacity-60` class is applied
- No "Pending" badge: Check `aiBadgeText: 'Pending'` in node data

---

### 🔍 Step 5: Progress Indicator
**What Should Show:**
- [ ] Progress bar appears below React Agent messages
- [ ] Shows "Node 1 of 2: New Email Trigger"
- [ ] Progress bar at 0%
- [ ] Node dots at bottom (2 dots, first one highlighted)

**If Missing:**
- Check `configuration_progress` event is received
- Verify `WorkflowBuildProgress` component is imported
- Check `configurationProgress` state is set

---

### 🔍 Step 6: First Node Configuration
**Visual Changes to First Node:**
1. [ ] Changes from dashed to solid border
2. [ ] Opacity goes from 60% to 100%
3. [ ] Border color: gray → blue
4. [ ] Node expands automatically
5. [ ] Badge changes: "Pending" → "Preparing" → "Configuring"
6. [ ] Fields appear one by one inside the node
7. [ ] Each field shows with a slight delay (animation)
8. [ ] Since it's a trigger, skips testing (no yellow border)
9. [ ] Completes with green border and "Ready" badge

**Console Should Show:**
```
[INITIAL_PROMPT] node_preparing
[INITIAL_PROMPT] field_configured: {fieldKey: "...", fieldValue: "..."}
[INITIAL_PROMPT] Adding field to node config: fieldKey = fieldValue
```

**If Fields Don't Appear:**
- Check `field_configured` events are being sent
- Verify event handler updates node config
- Check `autoExpand: true` is set

---

### 🔍 Step 7: Second Node Configuration
**What Should Happen:**
- [ ] First node stays green and complete
- [ ] Second node starts preparing (solid gray border)
- [ ] Progress updates: "Node 2 of 2: Send Slack Message"
- [ ] Progress bar at 50%
- [ ] Second dot becomes highlighted
- [ ] Same visual progression as first node
- [ ] Shows "Testing" phase (yellow border) for action nodes
- [ ] Test data appears in node
- [ ] Completes with green border

---

### 🔍 Step 8: Completion
**Final State:**
- [ ] Message: "✅ Workflow complete! Created 2 nodes"
- [ ] All nodes have green borders
- [ ] Progress indicator disappears
- [ ] All nodes are fully opaque
- [ ] Workflow is connected and ready

**Console Should Show:**
```
[INITIAL_PROMPT] workflow_complete
```

---

## Quick Diagnostic Commands

### Check Current Node Status in Console:
```javascript
// Get all nodes and their status
document.querySelectorAll('[data-id^="node-"]').forEach(n => {
  const node = n.__reactInternalInstance?.memoizedProps?.data;
  console.log(node?.title, ':', node?.aiStatus, node?.aiBadgeText);
});
```

### Check if Events Are Being Received:
```javascript
// Monitor SSE events (add to console before starting)
const origFetch = window.fetch;
window.fetch = function(...args) {
  if (args[0].includes('stream-workflow')) {
    console.log('Stream request:', args);
  }
  return origFetch.apply(this, args);
};
```

---

## Common Visual Issues & Fixes

### Issue: Nodes appear one by one instead of all at once
**Fix:** Ensure all `node_created` events are sent before configuration starts

### Issue: No visual distinction between pending/active nodes
**Fix:** Check CustomNode.tsx border styles for each aiStatus

### Issue: Fields don't animate in
**Fix:** Verify sleep delays between field_configured events

### Issue: Progress bar not updating
**Fix:** Check configurationProgress state updates on events

### Issue: Nodes don't auto-expand during configuration
**Fix:** Verify autoExpand: true is set when status changes

### Issue: Double-click doesn't open configuration
**Fix:** Check onConfigure callback is added to node data

---

## What to Report Back

If something isn't working, please share:
1. Which step failed (use numbers above)
2. What you saw vs. what was expected
3. Any console errors (red text)
4. The console logs around the failure point
5. Screenshot if possible

This will help me fix the exact issue quickly!