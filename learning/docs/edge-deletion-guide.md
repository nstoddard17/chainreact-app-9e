# Edge Deletion in Workflow Builder

## Feature Overview
You can now delete connections (edges) between nodes in the workflow builder when editing templates or creating workflows.

## How to Use

### 1. Select an Edge
- **Click on any connection line** between two nodes to select it
- Selected edges appear in blue with increased thickness

### 2. Delete the Edge
Three ways to delete a selected edge:

1. **Keyboard Shortcuts**
   - Press `Delete` or `Backspace` key
   - Works when an edge is selected and you're not typing in an input field

2. **Toolbar Button**
   - When an edge is selected, a red trash icon appears in the toolbar
   - Click the trash icon to delete the connection

3. **Visual Feedback**
   - Selected edge appears in blue (#3b82f6)
   - "Connection Selected" badge appears in toolbar
   - Confirmation toast appears after deletion

### 3. Deselect an Edge
- Press `Escape` to deselect
- Click anywhere else in the workflow
- Select a different edge

## Technical Implementation

### Files Modified
1. **`/hooks/workflows/useWorkflowBuilder.ts`**
   - Added `selectedEdgeId` state
   - Added `handleEdgeClick` handler
   - Added `deleteSelectedEdge` function
   - Added keyboard event listeners
   - Updated `processedEdges` to show selection styling

2. **`/components/workflows/CollaborativeWorkflowBuilder.tsx`**
   - Added `onEdgeClick` prop to ReactFlow
   - Passed edge handlers to WorkflowToolbar

3. **`/components/workflows/builder/WorkflowToolbar.tsx`**
   - Added delete button that appears when edge is selected
   - Added "Connection Selected" badge
   - Integrated with edge deletion functionality

## Features
- ✅ Click to select edges
- ✅ Visual feedback for selected edges (blue highlight)
- ✅ Delete with keyboard (Delete/Backspace)
- ✅ Delete with toolbar button
- ✅ Escape to deselect
- ✅ Click outside to deselect
- ✅ Toast notification on deletion
- ✅ Unsaved changes tracking

## Usage Notes
- Deleting edges marks the workflow as having unsaved changes
- You must save the workflow to persist edge deletions
- Edge deletion works in both workflow creation and template editing modes
- Cannot delete edges while typing in input fields (prevents accidental deletion)

## Styling
- Default edge color: `#b1b1b7`
- Selected edge color: `#3b82f6` (blue)
- Default edge width: 2px
- Selected edge width: 2.5px