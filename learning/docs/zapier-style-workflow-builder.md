# Zapier-Style Workflow Builder Implementation

**Status:** Planning
**Created:** 2025-01-15
**Last Updated:** 2025-01-15

## Overview

This document outlines the implementation plan for updating the ChainReact workflow builder to match Zapier's UX pattern, where new workflows start with empty placeholder nodes for a trigger and action, guiding users through the required workflow structure.

---

## Table of Contents

1. [Problem Statement](#problem-statement)
2. [Solution Overview](#solution-overview)
3. [Design Decisions](#design-decisions)
4. [Implementation Plan](#implementation-plan)
5. [AI Agent Integration](#ai-agent-integration)
6. [Testing Strategy](#testing-strategy)
7. [Edge Cases](#edge-cases)

---

## Problem Statement

### Current Behavior
- New workflows open to an empty canvas
- No visual guidance on required structure
- Users must know to add trigger first, then action
- No indication of minimum viable workflow requirements

### User Pain Points
- Cognitive overhead: "Where do I start?"
- No clear mental model of workflow structure
- Possible to create invalid workflows (action without trigger)
- Inconsistent with industry standards (Zapier, Make, n8n)

---

## Solution Overview

### Zapier Pattern
When a user creates a new workflow (without using the AI agent), the builder should display:

1. **Empty Trigger Node** (placeholder)
   - Position: (400, 100)
   - Visual state: Unconfigured, prompting user to select
   - Label: "Trigger" with subtext "When this happens..."

2. **Empty Action Node** (placeholder)
   - Position: (400, 300) - 200px below trigger
   - Visual state: Unconfigured, prompting user to select
   - Label: "Action" with subtext "Do this..."

3. **Pre-connected Edge**
   - Dashed/ghost edge connecting trigger → action
   - Indicates the flow direction

### Benefits
✅ Clear mental model: Trigger → Action
✅ Reduced cognitive load
✅ Industry-standard UX
✅ Prevents invalid workflows
✅ Guides new users through correct sequence

---

## Design Decisions

### Visual Design

#### Placeholder Node Styling
```tsx
// Light Mode
className="bg-gray-50 border-2 border-dashed border-gray-300 text-gray-500"

// Dark Mode
className="dark:bg-gray-800 dark:border-gray-600 dark:text-gray-400"
```

**Key Visual Characteristics:**
- Lighter background than configured nodes
- Dashed border (2px) instead of solid
- Muted text color
- Subtle icon indicating node type (trigger/action)
- Optional: Pulsing animation on trigger to indicate "start here"

#### Placeholder Node Content
```
┌─────────────────────────┐
│  [Icon]  Trigger        │ ← Title
│  When this happens...   │ ← Subtext
│                         │
│  [Select trigger app]   │ ← CTA Button
└─────────────────────────┘
```

#### Edge Styling
- Dashed line (`strokeDasharray: "5,5"`)
- Lighter color than normal edges
- Arrow indicator at action node

### Node Types

Create two new node types:

1. **`trigger_placeholder`**
   - Component: `TriggerPlaceholderNode.tsx`
   - Data: `{ type: 'trigger_placeholder', isPlaceholder: true }`

2. **`action_placeholder`**
   - Component: `ActionPlaceholderNode.tsx`
   - Data: `{ type: 'action_placeholder', isPlaceholder: true }`

---

## Implementation Plan

### ✅ Phase 1: Create Placeholder Node Components
**Status:** ✅ Completed
**Estimated Time:** 2-3 hours

#### Tasks
- [x] Create `/components/workflows/nodes/TriggerPlaceholderNode.tsx`
  - [x] Design placeholder UI with dashed border
  - [x] Add "When this happens..." subtext
  - [x] Include "Select trigger app" button
  - [x] Handle click to open integration selection panel

- [x] Create `/components/workflows/nodes/ActionPlaceholderNode.tsx`
  - [x] Design placeholder UI matching trigger style
  - [x] Add "Do this..." subtext
  - [x] Include "Select action" button
  - [x] Handle click to open integration selection panel

- [x] Register placeholder node types
  - [x] Add to node types registry in `useWorkflowNodes.ts`
  - [x] Registered as `trigger_placeholder` and `action_placeholder`

#### Component Structure

**File:** `/components/workflows/nodes/TriggerPlaceholderNode.tsx`
```tsx
"use client"

import React from "react"
import { Handle, Position } from "@xyflow/react"
import { Button } from "@/components/ui/button"
import { Zap } from "lucide-react"

interface TriggerPlaceholderNodeProps {
  id: string
  data: {
    onConfigure?: (nodeId: string) => void
  }
}

export function TriggerPlaceholderNode({ id, data }: TriggerPlaceholderNodeProps) {
  const handleClick = () => {
    if (data.onConfigure) {
      data.onConfigure(id)
    }
  }

  return (
    <div className="relative bg-gray-50 dark:bg-gray-800 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 min-w-[200px] shadow-sm hover:shadow-md transition-shadow">
      {/* Title */}
      <div className="flex items-center gap-2 mb-2">
        <Zap className="w-5 h-5 text-gray-400" />
        <h3 className="font-semibold text-gray-700 dark:text-gray-300">Trigger</h3>
      </div>

      {/* Subtext */}
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
        When this happens...
      </p>

      {/* CTA Button */}
      <Button
        onClick={handleClick}
        variant="outline"
        size="sm"
        className="w-full"
      >
        Select trigger app
      </Button>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-gray-400"
      />
    </div>
  )
}
```

**File:** `/components/workflows/nodes/ActionPlaceholderNode.tsx`
```tsx
"use client"

import React from "react"
import { Handle, Position } from "@xyflow/react"
import { Button } from "@/components/ui/button"
import { Play } from "lucide-react"

interface ActionPlaceholderNodeProps {
  id: string
  data: {
    onConfigure?: (nodeId: string) => void
  }
}

export function ActionPlaceholderNode({ id, data }: ActionPlaceholderNodeProps) {
  const handleClick = () => {
    if (data.onConfigure) {
      data.onConfigure(id)
    }
  }

  return (
    <div className="relative bg-gray-50 dark:bg-gray-800 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 min-w-[200px] shadow-sm hover:shadow-md transition-shadow">
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-gray-400"
      />

      {/* Title */}
      <div className="flex items-center gap-2 mb-2">
        <Play className="w-5 h-5 text-gray-400" />
        <h3 className="font-semibold text-gray-700 dark:text-gray-300">Action</h3>
      </div>

      {/* Subtext */}
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
        Do this...
      </p>

      {/* CTA Button */}
      <Button
        onClick={handleClick}
        variant="outline"
        size="sm"
        className="w-full"
      >
        Select action
      </Button>

      {/* Output Handle (for adding more actions) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-gray-400"
      />
    </div>
  )
}
```

---

### ✅ Phase 2: Initial State Logic
**Status:** ✅ Completed
**Estimated Time:** 2-3 hours

#### Tasks
- [x] Modify initial workflow state to include placeholder nodes
  - [x] Updated `useFlowV2Builder.ts` in `updateReactFlowGraph` function
  - [x] Placeholders added when `flow.nodes.length === 0`

- [x] Create placeholder edge connection
  - [x] Edge ID: `placeholder-edge`
  - [x] Source: trigger placeholder
  - [x] Target: action placeholder
  - [x] Style: Dashed (`strokeDasharray: '5,5'`), muted gray color

- [x] Add flag to detect placeholder state
  - [x] Detected via `node.data?.isPlaceholder` check
  - [x] Used to determine if workflow is "empty" or has user-added nodes

#### Implementation Location

**File to Modify:** `/src/lib/workflows/builder/useFlowV2LegacyAdapter.ts` or relevant API

```typescript
// Initial nodes for empty workflow
const INITIAL_PLACEHOLDER_NODES = [
  {
    id: 'trigger-placeholder',
    type: 'trigger_placeholder',
    position: { x: 400, y: 100 },
    data: {
      type: 'trigger_placeholder',
      isPlaceholder: true,
      title: 'Trigger',
    },
  },
  {
    id: 'action-placeholder',
    type: 'action_placeholder',
    position: { x: 400, y: 300 },
    data: {
      type: 'action_placeholder',
      isPlaceholder: true,
      title: 'Action',
    },
  },
]

const INITIAL_PLACEHOLDER_EDGE = {
  id: 'placeholder-edge',
  source: 'trigger-placeholder',
  target: 'action-placeholder',
  type: 'default',
  style: {
    strokeDasharray: '5,5',
    stroke: '#9CA3AF', // gray-400
  },
}

// When creating new workflow
function getInitialFlowState() {
  return {
    nodes: INITIAL_PLACEHOLDER_NODES,
    edges: [INITIAL_PLACEHOLDER_EDGE],
    hasPlaceholders: true,
  }
}
```

---

### ✅ Phase 3: Placeholder → Real Node Conversion
**Status:** ✅ Completed
**Estimated Time:** 3-4 hours

#### Tasks
- [x] Handle placeholder node click
  - [x] Updated `handleNodeConfigure` in `WorkflowBuilderV2.tsx`
  - [x] Opens integration panel when placeholder is clicked
  - [x] Stores selected placeholder ID in state

- [x] Implement node replacement logic
  - [x] Modified `handleNodeSelectFromPanel` to detect placeholder replacement
  - [x] Replaces placeholder with real node at same position
  - [x] Updates edges that connected to placeholder
  - [x] Removes placeholder edge when last placeholder is replaced

- [x] Update placeholder tracking
  - [x] Logs remaining placeholders after replacement
  - [x] Can be used for validation before save/activation

#### Conversion Flow

```typescript
// In WorkflowBuilderV2.tsx or relevant handler

const handlePlaceholderConfigure = useCallback(async (nodeId: string) => {
  // Determine if trigger or action placeholder
  const placeholderNode = nodes.find(n => n.id === nodeId)
  if (!placeholderNode) return

  const istrigger = placeholderNode.type === 'trigger_placeholder'
  const isAction = placeholderNode.type === 'action_placeholder'

  // Open integration selection panel
  setIsIntegrationsPanelOpen(true)
  // Store which placeholder we're replacing
  setReplacingPlaceholder({ id: nodeId, type: placeholderNode.type })
}, [nodes])

const handleNodeSelect = useCallback((nodeData: any) => {
  // Check if we're replacing a placeholder
  if (replacingPlaceholder) {
    const { id: placeholderId, type: placeholderType } = replacingPlaceholder

    // Get placeholder position
    const placeholderNode = nodes.find(n => n.id === placeholderId)
    const position = placeholderNode?.position || { x: 400, y: 100 }

    // Create new real node at placeholder position
    const newNode = {
      id: `node-${Date.now()}`,
      type: nodeData.type,
      position,
      data: {
        ...nodeData,
        title: nodeData.title,
        providerId: nodeData.providerId,
      },
    }

    // Replace placeholder with real node
    actions.replaceNode(placeholderId, newNode)

    // Update edges to point to new node
    actions.updateEdgesForReplacedNode(placeholderId, newNode.id)

    // Check if all placeholders are replaced
    const remainingPlaceholders = nodes.filter(n =>
      n.type === 'trigger_placeholder' || n.type === 'action_placeholder'
    )
    if (remainingPlaceholders.length === 1) {
      // Last placeholder replaced
      setHasPlaceholders(false)
    }

    setReplacingPlaceholder(null)
  } else {
    // Normal node addition (not replacing placeholder)
    // ... existing logic
  }
}, [replacingPlaceholder, nodes, actions])
```

---

### ✅ Phase 4: Edge Cases & Polish
**Status:** ✅ Completed
**Estimated Time:** 2-3 hours

#### Tasks
- [x] Handle AI agent clearing placeholders
  - [x] Updated `handleBuild` to clear all nodes (including placeholders)
  - [x] Added comment clarifying placeholder clearing

- [x] Handle "delete all nodes" scenario
  - [x] Updated `handleDeleteNodes` to detect when all real nodes are deleted
  - [x] Automatically resets to placeholder state (trigger + action)
  - [x] Preserves Zapier-style guided experience

- [x] Save/Load workflow with placeholders
  - [x] Placeholders are NOT saved to DB (they're UI-only)
  - [x] Generated fresh on load when `flow.nodes.length === 0`
  - [x] Ensures consistent experience across sessions

- [x] Activation prevention
  - [x] Added `hasPlaceholders()` validation function
  - [x] Created `handleToggleLiveWithValidation` handler
  - [x] Shows error: "Cannot activate workflow - Please configure all trigger and action nodes"
  - [x] Prevents activation until placeholders are replaced

- [x] Animation polish
  - [x] Subtle pulsing animation on trigger placeholder (3s cycle)
  - [x] Hover effects: scale(1.05) and shadow-md on both placeholders
  - [x] Smooth transitions (200ms duration)
  - [x] Respects `prefers-reduced-motion` for accessibility

- [ ] Handle partial placeholder deletion (OPTIONAL - Not implemented)
  - [ ] Future enhancement: If user deletes trigger placeholder, recreate it
  - [ ] Current behavior: Allows deletion, but unlikely to occur in normal usage

#### Edge Case: Delete All Nodes

```typescript
// When nodes are deleted
const handleNodesDelete = useCallback((nodeIds: string[]) => {
  // Delete nodes
  actions.deleteNodes(nodeIds)

  // Check if all nodes are deleted
  const remainingNodes = nodes.filter(n => !nodeIds.includes(n.id))

  if (remainingNodes.length === 0) {
    // Reset to placeholder state
    actions.setNodes(INITIAL_PLACEHOLDER_NODES)
    actions.setEdges([INITIAL_PLACEHOLDER_EDGE])
    setHasPlaceholders(true)
  }
}, [nodes, actions])
```

#### Validation Before Activation

```typescript
// Before activating workflow
const validateWorkflowForActivation = () => {
  // Check for placeholders
  const hasPlaceholders = nodes.some(n =>
    n.type === 'trigger_placeholder' || n.type === 'action_placeholder'
  )

  if (hasPlaceholders) {
    toast({
      title: "Cannot activate workflow",
      description: "Please configure all trigger and action nodes before activating.",
      variant: "destructive",
    })
    return false
  }

  // ... other validation
  return true
}
```

---

## AI Agent Integration

### Challenge
The AI agent builds workflows from scratch based on user prompts. We need to handle the interaction between:
1. **Manual workflow building** (starts with placeholders)
2. **AI-assisted workflow building** (generates complete plan)

### Solution: Clear Placeholder State on AI Build

When the AI agent generates a workflow plan, it should:
1. **Remove all placeholder nodes and edges**
2. **Build the workflow from scratch** based on the plan
3. **Set `hasPlaceholders: false`**

#### Implementation

**File to Modify:** `/components/workflows/builder/WorkflowBuilderV2.tsx`

```typescript
// In AI agent submit handler
const handleAgentSubmit = useCallback(async () => {
  setIsAgentLoading(true)
  setAgentStatus("Thinking...")

  try {
    // Step 1: Clear placeholder nodes if they exist
    const hasPlaceholders = nodes.some(n =>
      n.type === 'trigger_placeholder' || n.type === 'action_placeholder'
    )

    if (hasPlaceholders) {
      // Remove placeholders before AI build
      const nonPlaceholderNodes = nodes.filter(n =>
        n.type !== 'trigger_placeholder' && n.type !== 'action_placeholder'
      )
      const nonPlaceholderEdges = edges.filter(e =>
        e.id !== 'placeholder-edge'
      )

      actions.setNodes(nonPlaceholderNodes)
      actions.setEdges(nonPlaceholderEdges)
      setHasPlaceholders(false)
    }

    // Step 2: Let AI build workflow from scratch
    const result = await planWorkflowWithTemplates(
      actions,
      agentInput,
      selectedProviderId || undefined,
      user?.id,
      flowId
    )

    // Step 3: Apply AI-generated plan
    // ... existing logic

  } catch (error) {
    console.error("AI agent error:", error)
  } finally {
    setIsAgentLoading(false)
  }
}, [agentInput, nodes, edges, actions, user, flowId])
```

### Alternative: Smart Merge

If a user has already configured the trigger placeholder and THEN uses the AI agent:
- **Option A (Recommended):** Replace everything (user chose AI, respect that)
- **Option B:** Preserve configured trigger, let AI build around it (complex, may cause conflicts)

**Recommendation:** Go with Option A for simplicity and predictability.

---

## Testing Strategy

### Manual Testing Checklist

#### Basic Flow
- [ ] Create new workflow → Should show trigger + action placeholders
- [ ] Click trigger placeholder → Integration panel opens
- [ ] Select trigger → Placeholder replaced with real trigger node
- [ ] Click action placeholder → Integration panel opens
- [ ] Select action → Placeholder replaced with real action node
- [ ] Both placeholders replaced → `hasPlaceholders` is false
- [ ] Save workflow → Placeholders not saved to database

#### Edge Cases
- [ ] Delete trigger placeholder → Placeholder recreated (or workflow reset)
- [ ] Delete action placeholder → Placeholder recreated (or workflow reset)
- [ ] Delete all nodes → Reset to placeholder state
- [ ] Try to activate with placeholders → Show validation error
- [ ] Use AI agent on workflow with placeholders → Placeholders cleared, AI builds from scratch
- [ ] Use AI agent on workflow with configured nodes → AI replaces everything

#### Visual Testing
- [ ] Placeholders have dashed borders
- [ ] Placeholders have muted colors (light/dark mode)
- [ ] Edge between placeholders is dashed
- [ ] Transition from placeholder to real node is smooth
- [ ] Mobile responsive (placeholders visible on small screens)

### Automated Testing

#### Unit Tests
**File:** `/components/workflows/nodes/__tests__/TriggerPlaceholderNode.test.tsx`

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { TriggerPlaceholderNode } from '../TriggerPlaceholderNode'

describe('TriggerPlaceholderNode', () => {
  it('renders placeholder UI', () => {
    render(<TriggerPlaceholderNode id="test" data={{}} />)
    expect(screen.getByText('Trigger')).toBeInTheDocument()
    expect(screen.getByText('When this happens...')).toBeInTheDocument()
    expect(screen.getByText('Select trigger app')).toBeInTheDocument()
  })

  it('calls onConfigure when button clicked', () => {
    const onConfigure = jest.fn()
    render(<TriggerPlaceholderNode id="test" data={{ onConfigure }} />)

    fireEvent.click(screen.getByText('Select trigger app'))
    expect(onConfigure).toHaveBeenCalledWith('test')
  })
})
```

#### Integration Tests
**File:** `/tests/workflows/placeholder-workflow.spec.ts` (Playwright)

```typescript
import { test, expect } from '@playwright/test'

test('workflow starts with placeholders', async ({ page }) => {
  await page.goto('/workflows/new')

  // Should show trigger placeholder
  await expect(page.locator('[data-testid="trigger-placeholder"]')).toBeVisible()

  // Should show action placeholder
  await expect(page.locator('[data-testid="action-placeholder"]')).toBeVisible()

  // Should have dashed edge connecting them
  const edge = page.locator('[data-testid="placeholder-edge"]')
  await expect(edge).toHaveCSS('stroke-dasharray', '5, 5')
})

test('replace placeholder with real node', async ({ page }) => {
  await page.goto('/workflows/new')

  // Click trigger placeholder
  await page.click('[data-testid="trigger-placeholder"] button')

  // Integration panel should open
  await expect(page.locator('[data-testid="integrations-panel"]')).toBeVisible()

  // Select Gmail trigger
  await page.click('[data-testid="provider-gmail"]')
  await page.click('[data-testid="trigger-new-email"]')

  // Placeholder should be replaced
  await expect(page.locator('[data-testid="trigger-placeholder"]')).not.toBeVisible()
  await expect(page.locator('[data-testid="node-gmail-trigger"]')).toBeVisible()
})
```

---

## Edge Cases

### 1. User Deletes Placeholder Node
**Scenario:** User manually deletes the trigger or action placeholder.

**Solutions:**
- **Option A:** Immediately recreate the placeholder (enforces structure)
- **Option B:** Allow deletion, but show "Add trigger" / "Add action" button in empty area
- **Option C:** Show empty state with guidance

**Recommendation:** Option A - Recreate placeholder to maintain guided structure.

### 2. Workflow Saved with Placeholders
**Scenario:** User saves workflow but hasn't configured placeholders yet.

**Solutions:**
- **Option A:** Filter out placeholders before saving (workflow appears empty in DB)
- **Option B:** Save placeholders with `isPlaceholder: true` flag, recreate on load
- **Option C:** Prevent saving until placeholders are configured

**Recommendation:** Option B - Save placeholders so user's session state is preserved. On load, if `isPlaceholder: true`, render placeholder nodes.

### 3. AI Agent Used on Partial Workflow
**Scenario:** User configures trigger, then uses AI agent before configuring action.

**Behavior:**
- Clear ALL nodes (including configured trigger)
- Let AI build complete workflow from scratch
- Show warning: "This will replace your current workflow. Continue?"

**Implementation:**
```typescript
const handleAgentSubmit = useCallback(async () => {
  // Check if workflow has any configured nodes
  const hasConfiguredNodes = nodes.some(n =>
    n.type !== 'trigger_placeholder' && n.type !== 'action_placeholder'
  )

  if (hasConfiguredNodes) {
    // Show confirmation dialog
    const confirmed = await confirmDialog({
      title: "Replace current workflow?",
      description: "The AI will create a new workflow from scratch. Your current nodes will be replaced.",
    })

    if (!confirmed) return
  }

  // Clear all and let AI build
  actions.setNodes([])
  actions.setEdges([])

  // ... proceed with AI build
}, [nodes, actions])
```

### 4. Template Matching with Placeholders
**Scenario:** User has placeholders, submits AI prompt that matches a template.

**Behavior:**
- Clear placeholders
- Apply template plan (which already has trigger + actions)
- No need for placeholders anymore

**No special handling needed** - existing template logic will work.

### 5. Multi-Trigger Workflows
**Scenario:** Advanced users want multiple triggers or conditional logic.

**Behavior:**
- Start with 1 trigger + 1 action placeholders
- After both configured, user can add more triggers manually
- Or use AI agent for complex multi-trigger flows

**Recommendation:** Keep initial state simple (1 trigger + 1 action), allow expansion after.

---

## File Changes Summary

### New Files
```
/components/workflows/nodes/TriggerPlaceholderNode.tsx
/components/workflows/nodes/ActionPlaceholderNode.tsx
/components/workflows/nodes/__tests__/TriggerPlaceholderNode.test.tsx
/components/workflows/nodes/__tests__/ActionPlaceholderNode.test.tsx
/tests/workflows/placeholder-workflow.spec.ts
```

### Modified Files
```
/components/workflows/builder/WorkflowBuilderV2.tsx
  - Add placeholder node types to registry
  - Handle placeholder click (open integration panel)
  - Clear placeholders when AI agent used
  - Reset to placeholders when all nodes deleted

/src/lib/workflows/builder/useFlowV2LegacyAdapter.ts (or relevant API)
  - Initialize new workflows with placeholder nodes
  - Add hasPlaceholders state

/components/workflows/builder/IntegrationsSidePanel.tsx (if needed)
  - Handle node replacement vs. node addition
  - Pass context if replacing placeholder

/lib/workflows/validation.ts (or relevant file)
  - Validate workflow cannot be activated with placeholders
  - Show helpful error messages
```

---

## Design Mockups (Updated - Exact Zapier Match)

### Light Mode
```
┌─────────────────────────────────────────────┐
│  ● Trigger                            ···   │
│  1. Select the event that starts your       │
│     workflow                                │
└──────────────────┬──────────────────────────┘
                   │ (dashed line)
                   ↓
┌─────────────────────────────────────────────┐
│  ▶ Action                             ···   │
│  2. Select the event for your workflow      │
│     to run                                  │
└─────────────────────────────────────────────┘
```

**Design Features:**
- **Width**: 360px (rectangular, not square)
- **Numbered steps**: "1." and "2." clearly indicate sequence
- **Three dots menu**: Top right corner (visual only)
- **Round icon badges**: Dark circles with white icons
- **Clean borders**: Dashed 2px border
- **White/Dark background**: Matches app theme
- **Blue connection dots**: Visible connection points

### Dark Mode
- Background: `dark:bg-gray-900`
- Border: `dark:border-gray-600`
- Text: `dark:text-gray-100` (title), `dark:text-gray-300` (description)
- Icons: White on dark gray circles

### Automatic Centering ✨
- Calculates viewport width and height on load
- Accounts for agent panel width (420px if open, 0px if closed)
- Centers horizontally in available space
- Centers vertically with slight upward offset
- Updates position when all nodes deleted
- Uses `fitView()` for smooth centering animation (400ms)

---

## Success Criteria

### User Experience
- [ ] New users immediately understand workflow structure
- [ ] Clear visual guidance: "Configure trigger → Configure action"
- [ ] Placeholders are visually distinct from real nodes
- [ ] Smooth transition from placeholder to configured node
- [ ] No confusion about what to do first

### Technical
- [ ] Placeholder nodes render correctly
- [ ] Placeholder → real node conversion works
- [ ] AI agent integration works seamlessly
- [ ] Edge cases handled gracefully
- [ ] No bugs in save/load with placeholders
- [ ] Activation prevented if placeholders present

### Code Quality
- [ ] Components are reusable and well-tested
- [ ] Clear separation of concerns
- [ ] Documented code with comments
- [ ] Follows existing patterns in codebase
- [ ] TypeScript types are complete

---

## Rollout Plan

### Phase 1: Internal Testing
- [ ] Implement all components
- [ ] Test manually with all edge cases
- [ ] Fix bugs and polish UI

### Phase 2: Beta Testing
- [ ] Enable for beta users (flag in settings?)
- [ ] Gather feedback
- [ ] Iterate based on feedback

### Phase 3: Full Rollout
- [ ] Enable for all users
- [ ] Monitor for issues
- [ ] Update documentation

### Phase 4: Iteration
- [ ] Add animations/polish based on usage
- [ ] Consider advanced features (e.g., placeholder for multiple actions)

---

## Related Documentation
- `/learning/docs/drag-and-drop-workflow-builder.md`
- `/learning/docs/action-trigger-implementation-guide.md`
- `/CLAUDE.md` - AI Agent Flow section

---

## Questions for Discussion

1. **Should we allow deletion of placeholders?**
   - Option A: Recreate immediately (enforces structure)
   - Option B: Allow deletion, show empty state

2. **How should we handle save with placeholders?**
   - Option A: Filter out placeholders (workflow appears empty)
   - Option B: Save with `isPlaceholder: true` flag
   - Option C: Prevent save until configured

3. **Should we show a confirmation when AI agent will replace placeholders?**
   - Option A: Always replace silently (placeholders are temporary)
   - Option B: Show warning if trigger is configured

4. **Should we add progressive hints?**
   - Example: After trigger configured, highlight action placeholder
   - Example: Tooltip on first visit: "Start by selecting a trigger"

---

## Implementation Notes

### Key Considerations
- **Backwards Compatibility:** Existing workflows should not be affected
- **Performance:** Placeholder rendering should be instant
- **Accessibility:** Proper ARIA labels for screen readers
- **Mobile:** Placeholders should be touch-friendly

### Performance Optimizations
- Memoize placeholder components (React.memo)
- Avoid re-renders when placeholder state unchanged
- Lazy load integration panel only when needed

### Accessibility
```tsx
<div
  role="button"
  aria-label="Configure workflow trigger"
  tabIndex={0}
  onKeyPress={(e) => e.key === 'Enter' && handleClick()}
>
  {/* Placeholder content */}
</div>
```

---

## Changelog

| Date | Author | Changes |
|------|--------|---------|
| 2025-01-15 | Claude Code | Initial documentation created |
| 2025-01-15 | Claude Code | ✅ Phase 1-3 implementation complete |
| 2025-01-15 | Claude Code | ✅ AI agent integration complete |
| 2025-01-15 | Claude Code | 📝 Documentation updated with progress |
| 2025-01-15 | Claude Code | ✅ Phase 4 complete: Delete all nodes reset |
| 2025-01-15 | Claude Code | ✅ Activation prevention implemented |
| 2025-01-15 | Claude Code | ✅ Animation polish added (pulsing, hover effects) |
| 2025-01-15 | Claude Code | 🎉 Implementation 95% complete - Ready for testing |
| 2025-01-15 | Claude Code | 🎨 Updated to exact Zapier design (rectangular, numbered steps) |
| 2025-01-15 | Claude Code | 🎯 Added automatic centering based on agent panel state |
| 2025-01-15 | Claude Code | ✨ Placeholders now perfectly centered on first load |

---

## Status Tracking

**Overall Progress:** 95% (Implementation Complete, Manual Testing Recommended)

- [x] Phase 1: Create Placeholder Node Components (100% ✅)
- [x] Phase 2: Initial State Logic (100% ✅)
- [x] Phase 3: Placeholder → Real Node Conversion (100% ✅)
- [x] Phase 4: Edge Cases & Polish (100% ✅ - All core features complete)
- [ ] Testing (0% - Manual testing recommended)
- [x] Documentation (100% ✅)

---

## Next Steps

1. ✅ ~~Review this document with team/stakeholders~~ - Complete
2. ✅ ~~Make design decisions on open questions~~ - Complete
3. ✅ ~~Start Phase 1-4 implementation~~ - Complete
4. **Manual Testing** - Test the complete flow:
   - [ ] Create new workflow → Verify placeholders appear
   - [ ] Click trigger placeholder → Verify integrations panel opens
   - [ ] Select trigger → Verify placeholder replaced
   - [ ] Click action placeholder → Verify integrations panel opens
   - [ ] Select action → Verify placeholder replaced
   - [ ] Delete all nodes → Verify placeholders reappear
   - [ ] Try to activate with placeholders → Verify error message
   - [ ] Use AI agent → Verify placeholders cleared
   - [ ] Test in light and dark mode
5. **Production Deploy** - After testing passes
6. **Monitor user feedback** - Gather insights on UX improvement

---

*Last updated: 2025-01-15*
