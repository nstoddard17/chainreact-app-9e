# Workflow Builder Test Checklist

## Changes to Test

### 1. ✅ Airtable Required Fields
- [x] All Airtable config modals have required fields marked
- Fields marked as required: `baseId`, `tableName`, `recordId` (where applicable)

### 2. ✅ Action Insertion Between Nodes
**Expected Behavior:**
- When clicking the plus button between two actions
- The new action should be placed where the lower action was
- The lower action and all nodes below should shift down by 160px
- The add action button at the end should be preserved

**Test Steps:**
1. Create a workflow with a trigger and 2+ actions
2. Hover over the edge between two actions to see the plus button
3. Click the plus button
4. Select an action and configure it
5. Verify the action is inserted at the correct position
6. Verify nodes below are pushed down
7. Verify the add action button still exists at the end

### 3. ✅ AI Agent Chain Creation with Proper Spacing
**Expected Behavior:**
- Clicking the plus button on AI Agent creates a chain box
- New chains are spaced 450px apart horizontally
- Existing chains shift right when needed

**Test Steps:**
1. Add an AI Agent node to the workflow
2. Click the plus button on the AI Agent node
3. Verify a "Chain 1" box appears below the AI agent
4. Click plus again to add "Chain 2"
5. Verify chains are 450px apart horizontally

### 4. ✅ Edge Plus Buttons
**Expected Behavior:**
- All edges between action nodes show a plus button on hover
- Edges use the custom edge type with button functionality

### 5. ✅ Delay Configuration
**Previously Implemented:**
- Delay action has dropdown for time units (seconds, minutes, hours, days, weeks, months)

### 6. ✅ Test Button
**Previously Implemented:**
- All config modals show "Test" instead of "Listen"

## Implementation Summary

### Files Modified:
1. `/components/workflows/CollaborativeWorkflowBuilder.tsx`
   - Updated `handleAddChain` for 450px spacing
   - Modified action insertion logic to push nodes down
   - Added custom edge type to all action-to-action edges
   - Preserve add action button when inserting between actions

2. `/lib/workflows/nodes/providers/airtable/index.ts`
   - Already has required fields marked correctly

3. `/lib/workflows/nodes/providers/logic/index.ts`
   - Delay node with time unit dropdown (previously completed)

4. `/components/workflows/configuration/fields/SimpleVariablePicker.tsx`
   - "Test" button (previously completed)

5. `/components/workflows/configuration/VariablePickerSidePanel.tsx`
   - "Test" button (previously completed)