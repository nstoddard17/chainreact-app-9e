# AI Agent Flow - Integration Guide

**Date**: October 31, 2025
**Status**: Ready for Integration
**Estimated Time**: 2-3 hours

---

## Overview

This guide shows how to integrate the AI Agent Flow infrastructure into your workflow builder. All core components are built and tested—you just need to wire them together.

---

## What's Been Built

### Core Infrastructure ✅

1. **Design Tokens** - `/lib/workflows/ai-agent/design-tokens.ts`
2. **Chat Persistence** - Database schema + API + client service
3. **Build Choreography** - `/lib/workflows/ai-agent/build-choreography.ts`
4. **Cost Tracking** - `/lib/workflows/ai-agent/cost-tracker.ts`

### UI Components ✅

1. **BuildBadge** - `/components/workflows/ai-agent/BuildBadge.tsx`
2. **GuidedSetupCard** - `/components/workflows/ai-agent/GuidedSetupCard.tsx`
3. **AgentChatPanel** - `/components/workflows/ai-agent/AgentChatPanel.tsx`
4. **CostDisplay** - `/components/workflows/ai-agent/CostDisplay.tsx`

### Integration Hook ✅

- **useAgentFlowBuilder** - `/hooks/workflows/useAgentFlowBuilder.ts`

### Styles ✅

- **agent-flow.css** - `/components/workflows/ai-agent/agent-flow.css`

---

## Integration Steps

### Step 1: Import Styles

Add to your builder component or layout:

```tsx
import '@/components/workflows/ai-agent/agent-flow.css'
```

---

### Step 2: Add the Hook

In your workflow builder component:

```tsx
import { useAgentFlowBuilder } from '@/hooks/workflows/useAgentFlowBuilder'

function WorkflowBuilder({ flowId }: { flowId: string }) {
  const reactFlowWrapper = useReactFlow()

  const { state, actions } = useAgentFlowBuilder({
    flowId,
    onBuildComplete: () => {
      console.log('Build complete!')
    },
    onNodeSetupComplete: (nodeId) => {
      console.log('Node setup complete:', nodeId)
      // Move to next node
    },
    preferReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  // ... rest of your component
}
```

---

### Step 3: Add Chat Panel

Replace or add alongside your existing sidebar:

```tsx
<div className="flex h-full">
  {/* Agent Chat Panel (left side - 420px) */}
  <AgentChatPanel
    messages={state.messages}
    currentSetupNode={getCurrentSetupNode(state.currentSetupNodeId)}
    isBuilding={state.isBuilding}
    onNodeSetupContinue={actions.completeNodeSetup}
    onNodeSetupSkip={actions.skipNodeSetup}
  />

  {/* Canvas (center) */}
  <div className="flex-1 relative">
    <ReactFlow {...reactFlowProps} />

    {/* Build Badge Overlay */}
    {state.badgeText && (
      <BuildBadge
        text={state.badgeText}
        subtext={state.badgeSubtext}
        stage={state.stage}
      />
    )}
  </div>

  {/* Inspector Panel (right side - 380px) */}
  <div className="inspector-panel">
    {/* Your existing inspector */}
  </div>
</div>
```

---

### Step 4: Add Cost Display to Header

In your header/toolbar:

```tsx
<CostDisplay
  estimate={state.costEstimate}
  actual={state.totalCost}
  breakdown={actions.getCostBreakdown()}
  variant="header"
/>
```

---

### Step 5: Wire Build Choreography

When your planner generates a plan and creates nodes:

```tsx
async function handleBuildFromPlan(plan: PlannerResult) {
  // 1. Add user prompt to chat
  await actions.addUserPrompt(userInputText)

  // 2. Add plan as assistant response
  await actions.addAssistantResponse(
    'Here's the flow I created:',
    { plan }
  )

  // 3. Create nodes and edges from plan
  const { nodes, edges } = applyEditsToFlow(plan.edits)

  // 4. Execute build choreography
  await actions.executeBuildSequence(nodes, edges)

  // 5. Start guided setup for first node (if needed)
  if (nodes.length > 0 && needsSetup(nodes[0])) {
    actions.startNodeSetup(nodes[0].id)
  }
}
```

---

### Step 6: Handle Node Setup

Implement the setup continuation logic:

```tsx
async function handleNodeSetupContinue(nodeId: string): Promise<SetupResult> {
  try {
    // 1. Validate node configuration
    const node = getNode(nodeId)
    const validation = validateNodeConfig(node)

    if (!validation.valid) {
      return {
        success: false,
        error: validation.error
      }
    }

    // 2. Run quick test
    const testResult = await testNode(nodeId)

    if (testResult.success) {
      // 3. Track cost (if applicable)
      await actions.completeNodeSetup(
        nodeId,
        testResult.cost,
        testResult.tokens
      )

      // 4. Move to next node
      const nextNode = getNextNode(nodeId)
      if (nextNode && needsSetup(nextNode)) {
        actions.startNodeSetup(nextNode.id)
      }

      return {
        success: true,
        testData: testResult.data
      }
    }

    return {
      success: false,
      error: testResult.error || 'Test failed'
    }
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Setup failed'
    }
  }
}
```

---

### Step 7: Apply Node States

Update your CustomNode component to use the state classes:

```tsx
function CustomNode({ id, data, selected }: NodeProps) {
  const { state } = useAgentFlowBuilder({ flowId })

  const isActive = state.activeNodeId === id
  const isSkeleton = state.stage === 'skeleton-build'

  return (
    <div
      className={cn(
        'custom-node',
        isSkeleton && 'node-skeleton node-shimmer',
        isActive && 'node-active-halo',
        data.state === 'running' && 'node-running-pulse',
        data.state === 'success' && 'node-success',
        data.state === 'error' && 'node-error'
      )}
    >
      {/* Node content */}
    </div>
  )
}
```

---

### Step 8: Database Migration (User Action)

**⚠️ IMPORTANT**: The database migration needs to be applied manually due to baseline schema conflicts.

**Option 1: Apply Only New Migration**

Create a temporary migration file with just the chat persistence table:

```bash
# Create new migration
supabase migration new agent_chat_only

# Copy ONLY the agent_chat_messages table and related code
# from: supabase/migrations/20251031230754_agent_chat_persistence.sql

# Apply
supabase db push
```

**Option 2: Direct SQL (Quickest)**

Run this SQL directly in Supabase Studio:

```sql
-- Create table
CREATE TABLE IF NOT EXISTS agent_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'status')),
  text TEXT NOT NULL,
  subtext TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meta JSONB DEFAULT '{}'::jsonb,
  sequence INTEGER NOT NULL DEFAULT 0
);

-- Create indexes
CREATE INDEX idx_agent_chat_flow_user ON agent_chat_messages(flow_id, user_id, created_at DESC);
CREATE INDEX idx_agent_chat_created_at ON agent_chat_messages(created_at DESC);

-- Enable RLS
ALTER TABLE agent_chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own chat messages"
  ON agent_chat_messages FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own chat messages"
  ON agent_chat_messages FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own chat messages"
  ON agent_chat_messages FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own chat messages"
  ON agent_chat_messages FOR DELETE
  USING (user_id = auth.uid());

-- Helper function
CREATE OR REPLACE FUNCTION get_agent_chat_history(
  p_flow_id UUID,
  p_user_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  role TEXT,
  text TEXT,
  subtext TEXT,
  created_at TIMESTAMPTZ,
  meta JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.role,
    m.text,
    m.subtext,
    m.created_at,
    m.meta
  FROM agent_chat_messages m
  WHERE m.flow_id = p_flow_id AND m.user_id = p_user_id
  ORDER BY m.created_at DESC, m.sequence DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_agent_chat_history TO authenticated;
```

---

## Testing Checklist

After integration, test these scenarios:

### Chat Persistence
- [ ] Create new workflow → prompt → verify message saved
- [ ] Refresh page → verify messages restored
- [ ] Add plan → verify assistant message appears
- [ ] Update status → verify no duplicates

### Build Choreography
- [ ] Generate plan → verify zoom-fit animation
- [ ] Verify skeleton nodes appear with stagger
- [ ] Verify pan to first node
- [ ] Verify blue halo on active node
- [ ] Test with `prefers-reduced-motion` → instant transitions

### Guided Setup
- [ ] Verify setup card shows for first node
- [ ] Click Continue → verify test runs
- [ ] Verify advance to next node
- [ ] Click Skip → verify advance
- [ ] Test with missing secrets → verify warning
- [ ] Test with errors → verify retry button

### Cost Tracking
- [ ] Verify estimate shows in header
- [ ] Run workflow → verify actual cost updates
- [ ] Click cost badge → verify breakdown popover
- [ ] Verify token counts accurate

### Design Tokens
- [ ] Measure agent panel → 420px ± 4
- [ ] Measure inspector panel → 380px ± 4
- [ ] Measure node gaps → X=160±12, Y=96±12
- [ ] Verify badge centered
- [ ] Verify edge stroke 1.5px

---

## Troubleshooting

### Chat messages not persisting

**Check**:
- Database migration applied?
- API route working? (test `/api/workflows/[id]/chat`)
- Browser console for errors?

**Fix**:
```bash
# Test API
curl http://localhost:3000/api/workflows/your-flow-id/chat

# Check database
supabase db diff --linked
```

### Build choreography not animating

**Check**:
- ReactFlow instance available?
- Nodes have positions?
- `preferReducedMotion` set correctly?

**Fix**:
```tsx
// Ensure reactFlowInstance is available
const reactFlowInstance = useReactFlow()

// Log to debug
console.log('ReactFlow instance:', reactFlowInstance)
console.log('Nodes:', reactFlowInstance.getNodes())
```

### Panel widths not matching tokens

**Check**:
- CSS imported? (`import '@/components/workflows/ai-agent/agent-flow.css'`)
- Classes applied? (`className="agent-panel"`)

**Fix**:
```tsx
// Verify in browser dev tools
<div className="agent-panel"> {/* Should be 420px */}
```

### Guided setup not advancing

**Check**:
- `onNodeSetupComplete` callback called?
- `getCurrentSetupNode()` helper correct?
- Next node logic working?

**Fix**:
```tsx
// Add debug logging
const handleNodeSetupComplete = async (nodeId: string) => {
  console.log('Setup complete for:', nodeId)
  const nextNode = getNextNode(nodeId)
  console.log('Next node:', nextNode)

  if (nextNode) {
    actions.startNodeSetup(nextNode.id)
  }
}
```

---

## Example Integration (Full)

Here's a complete example showing all pieces together:

```tsx
'use client'

import { useReactFlow, ReactFlow } from '@xyflow/react'
import { useAgentFlowBuilder } from '@/hooks/workflows/useAgentFlowBuilder'
import { AgentChatPanel } from '@/components/workflows/ai-agent/AgentChatPanel'
import { BuildBadge } from '@/components/workflows/ai-agent/BuildBadge'
import { CostDisplay } from '@/components/workflows/ai-agent/CostDisplay'
import '@/components/workflows/ai-agent/agent-flow.css'

export function AIWorkflowBuilder({ flowId }: { flowId: string }) {
  const reactFlowInstance = useReactFlow()

  const { state, actions } = useAgentFlowBuilder({
    flowId,
    onBuildComplete: () => {
      console.log('Build complete!')
    },
    onNodeSetupComplete: (nodeId) => {
      const nextNode = getNextUnsetupNode(nodeId)
      if (nextNode) {
        actions.startNodeSetup(nextNode.id)
      }
    },
    preferReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches
  })

  const handleNodeSetupContinue = async (nodeId: string) => {
    // Validate and test node
    const result = await testNode(nodeId)

    if (result.success) {
      await actions.completeNodeSetup(nodeId, result.cost, result.tokens)
    }

    return result
  }

  return (
    <div className="flex h-screen">
      {/* Agent Chat Panel */}
      <AgentChatPanel
        messages={state.messages}
        currentSetupNode={getCurrentSetupNode(state.currentSetupNodeId)}
        isBuilding={state.isBuilding}
        onNodeSetupContinue={handleNodeSetupContinue}
        onNodeSetupSkip={actions.skipNodeSetup}
      />

      {/* Canvas */}
      <div className="flex-1 relative">
        {/* Header */}
        <div className="absolute top-4 right-4 z-10">
          <CostDisplay
            estimate={state.costEstimate}
            actual={state.totalCost}
            breakdown={actions.getCostBreakdown()}
          />
        </div>

        {/* Build Badge */}
        {state.badgeText && (
          <BuildBadge
            text={state.badgeText}
            subtext={state.badgeSubtext}
            stage={state.stage}
          />
        )}

        {/* ReactFlow Canvas */}
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
        />
      </div>

      {/* Inspector Panel */}
      <div className="inspector-panel">
        {/* Your inspector content */}
      </div>
    </div>
  )
}
```

---

## Performance Notes

- **Chat Loading**: Messages fetch once on mount, then update via optimistic UI
- **Choreography**: Uses RequestAnimationFrame for 60fps animations
- **Cost Tracking**: In-memory accumulation, no database writes until complete
- **Panel Widths**: Fixed (not responsive) per design tokens

---

## Accessibility

All components include:
- ✅ ARIA labels
- ✅ aria-live regions for status updates
- ✅ Keyboard navigation
- ✅ Focus management
- ✅ Reduced motion support

---

## Next Steps

1. **Apply database migration** (see Step 8)
2. **Add import to builder** (see Step 1)
3. **Add hook** (see Step 2)
4. **Add UI components** (see Steps 3-4)
5. **Wire build logic** (see Steps 5-7)
6. **Test** (see Testing Checklist)

---

## Support

If you encounter issues:

1. Check this guide's Troubleshooting section
2. Review `/learning/docs/agent-flow-parity-report.md` for acceptance tests
3. Check browser console for errors
4. Verify database migration applied
5. Test API endpoints directly

---

**Integration Time**: 2-3 hours
**Testing Time**: 1-2 hours
**Total**: Half day to full integration

Ready to integrate? Start with Step 1!
