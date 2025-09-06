# AI Agent Workflow Builder Comprehensive Test Outline

## Overview
This document outlines the comprehensive testing procedure for the AI Agent workflow builder functionality. Follow these steps to ensure all features work correctly.

## Prerequisites
- Development environment running (`npm run dev`)
- Browser with developer console open to monitor errors
- Test from scratch (delete any existing nodes/configurations)

## Test Procedure

### Phase 1: Initial Setup
1. **Navigate to Workflow Builder**
   - Open workflow builder page
   - Verify page loads without errors
   - Check console for any initial errors

2. **Select Trigger**
   - Click on trigger selection
   - Choose Manual trigger (or any available trigger)
   - Verify trigger is added to workflow

### Phase 2: AI Agent Configuration
3. **Add AI Agent Node**
   - Click "Add Action" button after trigger
   - Select "AI Agent" from integration list
   - Click on "AI Agent" action
   - Verify AI Agent configuration modal opens

### Phase 3: Chain Building
4. **Create First Chain with Actions**
   - In AI Agent builder, click "Add Action" for default chain
   - Select an integration (e.g., Gmail)
   - Select an action (e.g., "Send Email")
   - Verify action is added with correct name (NOT "Unnamed Action")
   - Repeat to add 3 more actions to reach 4 total

5. **Test Insert Between Actions**
   - Hover over the line between two actions
   - Click the "+" button that appears
   - Select Logic & Control > Delay (or any simple action)
   - Verify action is inserted between existing actions
   - Verify all connections remain intact

6. **Create Second Chain**
   - Click "Add New Chain" button
   - Add 4 actions to the second chain
   - Use different integrations (Discord, Slack, etc.)
   - Verify all actions display with correct names

### Phase 4: Action Management
7. **Test Deletion - End of Chain**
   - In each chain, delete the last action
   - Verify deletion successful
   - Verify "Add Action" button still appears at end
   - Verify chain connections remain intact

8. **Test Deletion - Middle of Chain**
   - Delete an action from the middle of a chain
   - Verify surrounding actions connect properly
   - Verify no broken connections

9. **Re-add Actions**
   - Add actions back to maintain 4 per chain
   - Verify all display correctly

### Phase 5: Save and Verify
10. **Save AI Agent Configuration**
    - Click "Save Configuration"
    - Verify modal closes
    - Verify AI Agent node appears in main workflow
    - Check console for any errors

11. **Verify Actions in Main Workflow**
    - Check that all actions from AI Agent chains appear
    - Verify they display with correct names (NOT "Unnamed Action")
    - Verify proper connections between nodes
    - Count total nodes (should match chains × actions)

### Phase 6: Main Workflow Operations
12. **Add Actions in Main Workflow**
    - Click "Add Action" button after one of the chain actions
    - Select and add a new action
    - Verify it displays with correct name

13. **Test Insert Between in Main Workflow**
    - Hover over connection line between nodes
    - Click "+" button
    - Add an action
    - Verify proper insertion

14. **Delete Actions in Main Workflow**
    - Delete an action from end of chain
    - Delete an action from middle
    - Verify connections update properly

## Expected Results

### ✅ Success Criteria
- All actions display with their proper names (e.g., "Send Email", "Send Message")
- Actions maintain their configuration when saved
- Chains maintain proper connections during all operations
- No console errors during any operation
- AI Agent saves and loads correctly
- All inserted actions connect properly

### ❌ Known Issues to Check
1. **"Unnamed Action" Display**
   - Actions should NEVER display as "Unnamed Action"
   - Check console for "Title will be: undefined" errors

2. **Configuration Loss**
   - Action type and providerId must be preserved
   - Check console for "type: undefined" errors

3. **Connection Issues**
   - All nodes must maintain proper connections
   - No orphaned nodes or broken edges

## Console Monitoring

Watch for these console messages:
- `🔷 [AIAgentVisualChainBuilder] Title will be: [actual title]` - Should show real titles
- `🔷 [AIAgentVisualChainBuilder] Config received: [object]` - Should have title, type, providerId
- `Creating node for action: {type: [type], providerId: [provider]}` - Should have real values, not undefined

## Error Resolution

If issues are encountered:
1. Note the exact error message
2. Check which component logged the error
3. Verify the action configuration object structure
4. Check if title, type, and providerId are being passed correctly
5. Fix the issue in the appropriate component
6. Re-test from the beginning

## Testing Frequency

Run this complete test:
- After any changes to AI Agent components
- After changes to workflow builder
- After changes to action selection logic
- Before any deployment
- When investigating user-reported issues