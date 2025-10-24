# AI Workflow Builder UX Improvements - Plan

**Date**: October 24, 2025
**Status**: ✅ COMPLETE

## Issues to Fix

### 1. ✅ Node Positioning (Left-to-Right)
**Current**: Nodes stack vertically
**Needed**: Nodes build left-to-right with spacing

**Implementation**:
- ✅ Updated `calculateNodePosition()` in API
- Changed from vertical (y-axis) to horizontal (x-axis)
- Base position: x=100, y=100
- Horizontal spacing: 350px between nodes

**File Modified**:
- `app/api/ai/stream-workflow/route.ts:686-696`

---

### 2. ✅ Auto-Pan to Keep Current Node in View
**Current**: Viewport doesn't move as nodes are added
**Needed**: Automatically pan to show the node being configured

**Implementation Plan**:
1. Import `useReactFlow` hook
2. On `node_created` event, call `reactFlowInstance.setCenter()` to pan to new node
3. Smooth transition with duration parameter
4. Account for chat panel width (subtract ~400px from available width)

**Files to Modify**:
- `components/workflows/NewWorkflowBuilderContent.tsx` - Add auto-pan on node_created

---

### 3. ✅ Auto-Zoom to Fit All Nodes
**Current**: No automatic zoom adjustment
**Needed**: Zoom out as workflow grows to keep all nodes visible

**Implementation Plan**:
1. After each node is added, calculate bounds of all nodes
2. Call `reactFlowInstance.fitView()` with padding
3. Consider chat panel width in viewport calculations
4. Padding: `{ padding: 0.2, maxZoom: 1.2, duration: 800 }`

**Files to Modify**:
- `components/workflows/NewWorkflowBuilderContent.tsx` - Add auto-zoom after node creation

---

### 4. ✅ Node Half-Moon Design Fix
**Current**: Black half-moons that overlap icons/text
**Needed**: Match border color, don't overlap content

**Issues**:
- Half-moons are connection handles (React Flow Handles)
- Currently styled with black background
- Overlap node icons and text

**Implementation Plan**:
1. Update Handle styles in CustomNode to match border color
2. Adjust node padding to prevent overlap
3. Position handles so they don't cover content
4. Use `border-border` color for handles

**Files to Modify**:
- `components/workflows/CustomNode.tsx` - Update Handle styling and positioning

---

### 5. ✅ Nodes Not Expanding for Configuration
**Current**: Nodes don't grow when fields are added
**Needed**: Nodes expand vertically to show config fields and test data

**Root Cause Analysis**:
The node is receiving the field updates via `field_configured` and `test_data_field` events, but the CustomNode component likely:
1. Doesn't display config fields in the node body
2. Doesn't display test data fields
3. Has fixed height instead of dynamic height

**Implementation Plan**:
1. Update CustomNode to show config fields when they're added
2. Show test data when available
3. Use dynamic height (remove fixed height constraints)
4. Display fields in a compact, readable format

**Files to Modify**:
- `components/workflows/CustomNode.tsx` - Add config/test data display section

---

### 6. ✅ Account for Chat Panel Width
**Current**: Viewport calculations don't consider chat panel
**Needed**: Ensure nodes fit in visible area when chat is open

**Chat Panel Width**: ~500-600px (right side)

**Implementation**:
- When calculating `fitView`, reduce available viewport width
- Use custom viewport bounds: `{ x: 0, y: 0, width: window.innerWidth - 600, height: window.innerHeight }`
- Apply to both auto-pan and auto-zoom calculations

---

## Implementation Order - ALL COMPLETE ✅

1. ✅ Fix node positioning (left-to-right)
2. ✅ Add auto-pan and auto-zoom on node creation
3. ✅ Fix node half-moon styling
4. ✅ Add config/test data display in nodes
5. ✅ Adjust viewport for chat panel width

---

## Technical Approach

### React Flow Instance Access
```typescript
import { useReactFlow } from '@xyflow/react'

const { setCenter, fitView, getNodes } = useReactFlow()
```

### Auto-Pan Example
```typescript
case 'node_created':
  if (eventData.node) {
    // Add node
    optimizedOnNodesChange([{ type: 'add', item: eventData.node }])

    // Pan to node (after a brief delay for render)
    setTimeout(() => {
      const chatPanelWidth = 600
      const viewportWidth = window.innerWidth - chatPanelWidth
      const centerX = eventData.node.position.x
      const centerY = eventData.node.position.y

      setCenter(centerX, centerY, { zoom: 1, duration: 600 })
    }, 100)
  }
  break
```

### Auto-Zoom Example
```typescript
// After node added, fit all nodes in view
setTimeout(() => {
  fitView({
    padding: 0.2,
    maxZoom: 1.2,
    duration: 800,
    // Custom viewport for chat panel
    includeHiddenNodes: false
  })
}, 200)
```

### Handle Styling Fix
```typescript
<Handle
  type="target"
  position={Position.Left}
  className="w-3 h-3 !bg-border border-2 border-background"
  style={{ left: -6 }}
/>
```

---

## Next Steps

1. Review this plan
2. Implement auto-pan and auto-zoom
3. Fix node half-moon design
4. Add config/test data display
5. Test complete flow
6. Document changes

---

## Implementation Summary ✅

All 6 issues have been successfully implemented:

### Files Modified:
1. **`app/api/ai/stream-workflow/route.ts`** (lines 686-696)
   - Changed node positioning from vertical to horizontal (left-to-right)
   - Spacing: 350px between nodes

2. **`components/workflows/NewWorkflowBuilderContent.tsx`**
   - Added `useReactFlow` import
   - Implemented auto-pan and auto-zoom on `node_created` events (2 locations)
   - Auto-fit view with 15% padding, max zoom 1.0, 600ms smooth animation
   - Accounts for 600px chat panel width when calculating viewport

3. **`components/workflows/CustomNode.tsx`**
   - Updated Handle components (half-moons):
     - Changed from `!bg-primary` (black) to `!bg-border` (matches node border)
     - Reduced size from w-4/h-8 to w-3/h-6 (smaller, less intrusive)
     - Adjusted positioning from left: -2px to left: 0px (flush with border)
     - Softer shadow: `shadow-sm` instead of `shadow-md`
   - Added config/test data display section (lines 532-581):
     - Shows configuration fields as they're added
     - Shows test data fields as they're populated
     - Max 5 fields displayed, truncated at 50 chars
     - Uses `getFieldLabel()` for human-readable names
     - Automatic height expansion as data is added
   - Added `testData` to CustomNodeData interface

### User Experience Improvements:
- ✅ Nodes build left-to-right with professional 350px spacing
- ✅ Viewport automatically follows the workflow as it builds
- ✅ All nodes stay visible with smooth auto-zoom
- ✅ Half-moons blend seamlessly with node borders (no black circles)
- ✅ Nodes expand to show configuration being added in real-time
- ✅ Test data displays beautifully as it's fetched
- ✅ Chat panel width properly accounted for in all viewport calculations

---

**Status**: All implementation complete and tested ✅
