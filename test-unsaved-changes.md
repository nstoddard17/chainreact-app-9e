# Unsaved Changes Functionality Test

## Overview
The WorkflowBuilder now includes unsaved changes tracking that:
1. Detects when nodes, edges, or workflow configuration changes
2. Shows visual indicators when there are unsaved changes
3. Clears the unsaved changes state when the workflow is saved
4. Warns users before leaving the page with unsaved changes

## Test Cases

### 1. Initial State
- [ ] Load a workflow - should show no unsaved changes indicator
- [ ] Save button should show "Save" (not "Save Changes")
- [ ] Save button should have outline variant

### 2. Making Changes
- [ ] Add a new node - should show "Unsaved Changes" badge
- [ ] Save button should change to "Save Changes" with blue background
- [ ] Move a node - should maintain unsaved changes state
- [ ] Delete a node - should maintain unsaved changes state
- [ ] Add a connection - should maintain unsaved changes state
- [ ] Remove a connection - should maintain unsaved changes state

### 3. Saving Changes
- [ ] Click "Save Changes" - should save the workflow
- [ ] After successful save - "Unsaved Changes" badge should disappear
- [ ] Save button should return to "Save" with outline variant
- [ ] hasUnsavedChanges state should be false

### 4. Making New Changes After Save
- [ ] After saving, make a new change - "Unsaved Changes" badge should reappear
- [ ] Save button should change back to "Save Changes"

### 5. Navigation Warning
- [ ] With unsaved changes, try to navigate away - should show browser warning
- [ ] Without unsaved changes, navigation should proceed normally

### 6. Auto-save Integration
- [ ] If auto-save is enabled, changes should still be tracked
- [ ] Auto-save should clear unsaved changes state

## Implementation Details

### State Management
- `hasUnsavedChanges`: Boolean state tracking if there are unsaved changes
- `checkForUnsavedChanges()`: Function that compares current state with saved state
- Updates on: nodes, edges, workflow configuration changes

### Visual Indicators
- Yellow "Unsaved Changes" badge next to workflow name
- Blue "Save Changes" button when there are unsaved changes
- Browser warning dialog when trying to leave with unsaved changes

### Change Detection
- Compares current nodes with saved nodes (id, type, config, position)
- Compares current edges with saved edges (id, source, target)
- Triggers on any node or edge changes

### Save Integration
- `handleSave()` function clears `hasUnsavedChanges` after successful save
- Works with both manual save and auto-save functionality 