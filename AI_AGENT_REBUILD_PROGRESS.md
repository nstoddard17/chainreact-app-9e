# AI Agent Workflow Builder Rebuild - Progress Tracker

**Goal:** Match Kadabra reference implementation for AI Agent node placement, styling, configuration, and results display.

**Last Updated:** 2025-10-30

---

## Phase 1: Node Visual Foundation ✅ COMPLETE

### Step 1.1: Audit & Document Current Node Structure ✅ COMPLETE
- [x] Find FlowNode component location → `/components/workflows/builder/FlowNodes.tsx`
- [x] Find AI Agent planner location (Planner.ts) → `/src/lib/workflows/builder/agent/planner.ts`
- [x] Document current node data structure → See PHASE1_STEP1_AUDIT.md
- [x] Document current props/state → FlowNodeData interface documented
- [x] List all node states currently supported → `.isGrey`, `.isActive`, `:hover` (CSS only, no enum)
- [x] **Test Checkpoint:** Show file locations and structure → PHASE1_STEP1_AUDIT.md created

### Step 1.2: Add State Management ✅ COMPLETE
- [x] Create state enum: `skeleton | ready | running | passed | failed`
- [x] Add state field to node data structure
- [x] Wire state to FlowNode component
- [x] Add description and preview fields to node data
- [x] Implement getStatusBadge helper function
- [x] Implement getStateStyles function for state-specific styling
- [x] Add status badge rendering
- [x] Add description field display
- [x] Add preview block rendering with scrolling
- [x] Create node-states.css with animations and badge styles
- [x] **Test Checkpoint:** Ready for manual testing - see Testing Instructions below

### Step 1.3: Style States (Visual Only) ✅ COMPLETE
- [x] Implement grey skeleton styling (via getStateStyles)
- [x] Add green "passed" border/badge (2px solid green-600)
- [x] Add red "failed" styling (2px solid destructive)
- [x] Add neutral "ready" styling (default card styling)
- [x] **Test Checkpoint:** Ready for visual testing

### Step 1.4: Add Running Animation ✅ COMPLETE
- [x] Create blue wave gradient keyframe animation (wave-running in node-states.css)
- [x] Apply animation to running state (via .node-running class)
- [x] Test animation performance (2s linear infinite)
- [x] Add reduced motion support
- [x] **Test Checkpoint:** Animation ready for testing

### Step 1.5: Add Preview Blocks ✅ COMPLETE
- [x] Add preview data structure to node schema (FlowNodeData.preview)
- [x] Render preview blocks below description
- [x] Make preview blocks scrollable (maxHeight: 120px, overflowY: auto)
- [x] Support merge field display (ready for `{{field.name}}` when implemented)
- [x] Support both string and array content
- [x] **Test Checkpoint:** Preview blocks ready for testing

---

## Phase 2: Canvas Placement & Camera Control 📋 NOT STARTED

### Step 2.1: Layout Calculation
- [ ] Find/create layout algorithm for sequential node placement
- [ ] Implement branch-aware layout (parallel lanes)
- [ ] Precompute coordinates when plan is generated
- [ ] **Test Checkpoint:** Generate plan, verify coordinates are calculated

### Step 2.2: Sequential Node Dropping
- [ ] Implement animated node placement (one at a time)
- [ ] Add delay between node drops
- [ ] Apply skeleton styling during build
- [ ] **Test Checkpoint:** Watch nodes appear sequentially

### Step 2.3: Viewport Management
- [ ] Detect if new node is outside viewport margin
- [ ] Implement smooth zoom-out to fit all nodes
- [ ] Ensure nodes stay visible while chat panel is open
- [ ] **Test Checkpoint:** Verify all nodes visible during build

### Step 2.4: Camera Choreography
- [ ] After final node: brief hold on full skeleton view
- [ ] Animate camera to first node (lane 0)
- [ ] Apply zoom level matching reference
- [ ] Add temporary red focus halo to node #1
- [ ] **Test Checkpoint:** Complete build, verify zoom behavior

### Step 2.5: Branch Layout
- [ ] Implement parallel lane rendering for multiple outputs
- [ ] Offset lane 1 downward by fixed gutter
- [ ] Render curved edges to avoid overlap
- [ ] **Test Checkpoint:** Create branching workflow, verify layout

---

## Phase 3: Configuration Modal Structure 📋 NOT STARTED

### Step 3.1: Modal Shell
- [ ] Create modal component matching node catalog size
- [ ] Add header: icon, name, description, billing note, docs link
- [ ] Add "Add tools to agent" CTA button
- [ ] Add tab navigation: Setup, Output fields, Advanced, Results
- [ ] **Test Checkpoint:** Open modal, verify size/position matches catalog

### Step 3.2: Tab Navigation
- [ ] Implement tab switching
- [ ] Style active/inactive tabs
- [ ] Maintain tab state
- [ ] **Test Checkpoint:** Click tabs, verify switching works

---

## Phase 4: Modal Tabs Content 📋 NOT STARTED

### Step 4.1: Setup Tab
- [ ] Render config fields from configSchema
- [ ] Add info tooltips for each field
- [ ] Add required badges
- [ ] Add "Connect" icon (variable picker trigger)
- [ ] Add "Loop" toggle
- [ ] Implement validation messaging
- [ ] Add "Agent Context Setup" accordion
- [ ] Show upstream nodes with output counts
- [ ] Add tool attachments region
- [ ] **Test Checkpoint:** Open Setup tab, verify all elements render

### Step 4.2: Output Fields Tab
- [ ] Create editable output fields list
- [ ] Add name/type/cardinality dropdowns
- [ ] Implement "Add new field" button
- [ ] Implement "Add Table" button with column config
- [ ] Persist changes to node config
- [ ] **Test Checkpoint:** Add/edit/remove fields, verify persistence

### Step 4.3: Advanced Tab
- [ ] Create Run Behavior radio group (Normal/Skip/Stop)
- [ ] Add Conditional Execution section with toggle
- [ ] Add "Add Condition" button (stub for now)
- [ ] Create Output Processing list
- [ ] Add filter/transform/limit icons per field
- [ ] **Test Checkpoint:** Toggle options, verify UI updates

### Step 4.4: Results Tab (Pre-run State)
- [ ] Show "No results available" card
- [ ] Add "Expected Output Fields" collapsible
- [ ] Group fields by type (Tables/Single Values)
- [ ] Show field metadata (type, cardinality)
- [ ] **Test Checkpoint:** Open Results tab before run, verify layout

### Step 4.5: Results Tab (Post-run State)
- [ ] Add run header (status chip, duration, attempts)
- [ ] Render output field sections
- [ ] Add search bars for multi-valued fields
- [ ] Make content areas scrollable
- [ ] Add download/export buttons
- [ ] Add "Fields without results" collapsible
- [ ] **Test Checkpoint:** Mock run data, verify display

---

## Phase 5: Data Integration & Variable Picker 📋 NOT STARTED

### Step 5.1: Wire Modal to Builder State
- [ ] Load node config into modal on open
- [ ] Save config changes back to node
- [ ] Persist user-defined output schemas
- [ ] Persist conditions/processing choices
- [ ] **Test Checkpoint:** Edit config, close/reopen modal, verify persistence

### Step 5.2: Variable Picker (Stub)
- [ ] Create variable picker drawer/popover
- [ ] Show searchable tree (Node → Field → Type)
- [ ] List upstream node outputs by schema
- [ ] Insert merge token on selection (`{{node.field}}`)
- [ ] Store structured reference
- [ ] **Test Checkpoint:** Click "Connect", select variable, verify insertion

### Step 5.3: Results Data Integration
- [ ] Connect Results tab to node run logs
- [ ] Fetch latest run data on tab open
- [ ] Handle loading/error states
- [ ] Sync preview blocks on canvas with results
- [ ] **Test Checkpoint:** Run node, verify results appear

---

## Phase 6: Output Schema Audit & Completion 📋 NOT STARTED

### Step 6.1: Audit Missing Schemas
- [ ] Generate report of 45 nodes lacking outputSchema
- [ ] Document existing schema patterns
- [ ] **Test Checkpoint:** Review audit report

### Step 6.2: Fill Missing Schemas
- [ ] Add outputSchema for each missing node
- [ ] Include friendly labels
- [ ] Add descriptions
- [ ] Add examples where possible
- [ ] **Test Checkpoint:** Verify all nodes have complete schemas

### Step 6.3: Planner Metadata Enhancement
- [ ] Extend planner to include node descriptions
- [ ] Add preview block schema per node
- [ ] Add branch/lane information
- [ ] **Test Checkpoint:** Generate plan, verify metadata present

---

## Phase 7: Polish & Accessibility 📋 NOT STARTED

### Step 7.1: Keyboard Navigation
- [ ] Tab navigation through modal tabs
- [ ] Focus management in form fields
- [ ] Modal closure via Escape key
- [ ] **Test Checkpoint:** Navigate with keyboard only

### Step 7.2: Screen Reader Support
- [ ] Add ARIA labels for status badges
- [ ] Add live regions for state changes
- [ ] Label output sections
- [ ] Label variable picker tree
- [ ] **Test Checkpoint:** Test with screen reader

### Step 7.3: Reduced Motion Support
- [ ] Detect prefers-reduced-motion
- [ ] Disable animations when preferred
- [ ] Provide instant state transitions
- [ ] **Test Checkpoint:** Enable reduced motion, verify behavior

### Step 7.4: Final QA
- [ ] Test branch layout with multiple outputs
- [ ] Test variable picker populates preview blocks
- [ ] Test variable picker populates downstream fields
- [ ] Verify all animations are smooth
- [ ] Check responsive behavior
- [ ] **Test Checkpoint:** Complete end-to-end test

---

## Phase 8: Assets & Documentation 📋 NOT STARTED

### Step 8.1: Provider Icons
- [ ] Audit existing icons in `public/integrations/`
- [ ] Identify missing provider icons
- [ ] Add missing icons
- [ ] **Test Checkpoint:** All providers show correct icons

### Step 8.2: Design Tokens & Styling
- [ ] Document typography tokens
- [ ] Document color tokens
- [ ] Verify paddings match screenshots
- [ ] Verify rounded corners match
- [ ] Add grey background tokens
- [ ] **Test Checkpoint:** Visual comparison with screenshots

### Step 8.3: Animation Assets
- [ ] Create running wave CSS keyframes
- [ ] Add status badge transition animations
- [ ] Test animation performance
- [ ] **Test Checkpoint:** Animations run smoothly

### Step 8.4: Documentation
- [ ] Add inline code comments
- [ ] Document component APIs
- [ ] Create designer handoff notes
- [ ] Document testing procedures
- [ ] **Test Checkpoint:** Developer can understand code

---

## Notes & Discoveries

### Known Issues
- (Will track issues as we discover them)

### Technical Decisions
- **Node State Management**: Implemented as optional fields on FlowNodeData to maintain backward compatibility
- **Styling Approach**: Using inline styles for state-specific borders/colors and CSS classes for animations
- **Preview Blocks**: Support both string and string array content for flexibility

### Future Enhancements
- (Will track nice-to-have features)

---

## Testing Instructions - Phase 1: Node Visual Foundation

### Quick Start: Using the Test Panel (Recommended)

**I've created a test panel component to make testing super easy!**

1. **Add the test panel** to WorkflowBuilderV2.tsx:

   ```typescript
   // At the top of the file, add import:
   import { NodeStateTestPanel } from './NodeStateTestPanel'

   // Inside the JSX, add anywhere (I suggest near the bottom):
   <NodeStateTestPanel />
   ```

2. **Start the dev server** (if not already running):
   ```bash
   npm run dev
   ```

3. **Open the Workflow Builder V2** in your browser

4. **Click the "🧪 Test Node States" button** in the bottom-right corner

5. **Add test nodes** by clicking the buttons for each state:
   - Skeleton Node - Grey, muted appearance with "Building..." badge
   - Ready Node - Normal appearance, no badge
   - Running Node - Blue wave animation with "Running" badge
   - Passed Node - Green border with "See results" badge
   - Failed Node - Red border with "Failed" badge

6. **Verify each state** matches the checklist below

7. **Clean up** when done:
   - Click "Clear All Test Nodes" to remove test nodes
   - Remove the `<NodeStateTestPanel />` component from WorkflowBuilderV2.tsx
   - Remove the import

### Alternative: Manual Testing via Console

If you prefer manual testing, you can modify nodes in the browser console:

   ```javascript
   // Get the ReactFlow instance (this is a simplified approach)
   // In practice, you'll need to access the nodes through the builder's state

   // Example: Update first node to 'skeleton' state
   {
     state: 'skeleton',
     description: 'This node is being built by AI...'
   }

   // Example: Update to 'running' state
   {
     state: 'running',
     description: 'Executing workflow step...',
     preview: {
       title: 'Sample Data',
       content: ['Processing item 1...', 'Processing item 2...']
     }
   }

   // Example: Update to 'passed' state
   {
     state: 'passed',
     description: 'Successfully completed!',
     preview: {
       title: 'Results',
       content: 'Found 42 records matching criteria'
     }
   }

   // Example: Update to 'failed' state
   {
     state: 'failed',
     description: 'An error occurred during execution'
   }
   ```

4. **What to verify for each state:**

   **Skeleton State:**
   - [ ] Node has muted grey background (50% opacity)
   - [ ] Border is light and semi-transparent
   - [ ] Text is muted foreground color
   - [ ] "Building..." badge appears with grey styling
   - [ ] Description text is visible and grey

   **Ready State (default):**
   - [ ] Node has normal card background
   - [ ] Standard border color
   - [ ] No status badge shown
   - [ ] Normal text colors

   **Running State:**
   - [ ] Blue animated wave moves across the node (2s cycle)
   - [ ] "Running" badge appears with blue styling
   - [ ] Wave animation is smooth and continuous
   - [ ] Description and preview are visible if provided
   - [ ] If reduced motion is enabled, animation stops (static blue tint)

   **Passed State:**
   - [ ] Green border (2px solid)
   - [ ] Subtle green shadow around node
   - [ ] "See results" badge appears with green styling
   - [ ] Badge is clickable with hover effect
   - [ ] Preview block shows results data

   **Failed State:**
   - [ ] Red border (2px solid)
   - [ ] Subtle red shadow around node
   - [ ] "Failed" badge appears with red styling
   - [ ] Description explains the error

5. **Test Preview Blocks:**
   - [ ] Preview with title shows title in bold above content
   - [ ] Preview with string content displays as single paragraph
   - [ ] Preview with array content displays as separate lines
   - [ ] Preview block is scrollable when content exceeds 120px height
   - [ ] Preview has light grey background

6. **Test Description Field:**
   - [ ] Description appears below title/sublabel when provided
   - [ ] Description text is readable with proper line height
   - [ ] Description doesn't break node layout

### Alternative Testing Approach

If direct state modification is difficult, you can also:

1. Add a test button in the UI that cycles through states
2. Use React DevTools to modify node data directly
3. Create a test workflow with pre-configured node states

### Expected Behavior Summary

- Node states should visually change immediately when data updates
- Animations should be smooth and performant
- Text should remain readable in all states
- Preview blocks should handle long content gracefully
- Badges should clearly indicate current state

**Report any issues with:**
- Colors not matching
- Animations not running
- Text not visible
- Layout breaking
- Preview blocks not scrolling

---

## Quick Reference

**Current Phase:** Phase 1 COMPLETE ✅ | Ready to start Phase 2
**Last Completed:** Phase 1 - Node Visual Foundation (all 5 steps)
**Next Milestone:** Phase 2 - Canvas Placement & Camera Control
**Blocking Issues:** None currently
**Ready for Testing:** Phase 1 complete - Use NodeStateTestPanel to verify all states work correctly

### Phase 1 Summary - What Was Accomplished:

**Files Created:**
- `/components/workflows/builder/styles/node-states.css` - Animations and badge styling
- `/components/workflows/builder/NodeStateTestPanel.tsx` - Testing utility
- `/AI_AGENT_REBUILD_PROGRESS.md` - Progress tracker
- `/PHASE1_STEP1_AUDIT.md` - Initial audit documentation

**Files Modified:**
- `/components/workflows/builder/FlowNodes.tsx` - Added state management, description, preview blocks

**Features Implemented:**
- ✅ Node state enum (skeleton, ready, running, passed, failed)
- ✅ State-aware styling with inline styles
- ✅ Status badges for each state (top-right corner with pulse animation)
- ✅ Description field display
- ✅ Preview blocks with scrolling
- ✅ Running animation (blue wave gradient on node + pulse on badge)
- ✅ Half-moon handles that blend with node state colors
- ✅ Handles centered vertically on node edge
- ✅ Provider icons on test nodes (Gmail, Slack, Discord, Notion, Airtable)
- ✅ Reduced motion support (disables all animations)
- ✅ Accessibility (ARIA labels, live regions)

**Testing Tools:**
- NodeStateTestPanel component for easy state testing
- Comprehensive testing checklist
- Clear verification criteria for each state
