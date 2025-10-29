# Flow V2 Animated Build UX

## Overview

The Kadabra-style animated build UX provides a guided, staged workflow creation experience that walks users through the process of building automation flows step-by-step. This is a **frontend-only feature** that sits on top of the existing Flow V2 backend infrastructure.

## Architecture

### State Machine

The build process follows a finite state machine with the following states:

1. **IDLE** - Waiting for user input
2. **THINKING** - Agent is processing the request
3. **SUBTASKS** - Breaking down the task into smaller steps
4. **COLLECT_NODES** - Identifying relevant integration nodes
5. **OUTLINE** - Creating a flow outline
6. **PURPOSE** - Defining the flow's purpose
7. **PLAN_READY** - Plan is complete, ready to build
8. **BUILDING_SKELETON** - Creating the visual flow on canvas
9. **WAITING_USER** - Waiting for user to configure current node
10. **PREPARING_NODE** - Setting up node configuration
11. **TESTING_NODE** - Testing node functionality
12. **COMPLETE** - Flow is fully configured and ready

### Key Files

- **`src/lib/workflows/v2/BuildState.ts`** - State machine definitions and helpers
- **`components/workflows/v2/styles/FlowBuilder.anim.css`** - Animation styles
- **`components/workflows/WorkflowBuilderV2.tsx`** - Main builder component with animated build integration

## How to Use

The animated build UX is **enabled by default** for all Flow V2 workflows. No configuration required!

### Starting from AI Agent Page (Recommended)

1. Navigate to `/workflows/ai-agent`
2. Enter your natural language prompt (e.g., "Send me a Slack message when I get an email")
3. Press Enter or click Submit
4. You'll be redirected to `/workflows/builder` with your new flow
5. The animated build process starts automatically

### Starting from Builder Directly

1. Navigate to `/workflows/builder`
2. Open the React Agent panel on the left (should be open by default)
3. Enter your prompt and press Enter
4. The animated build process begins

## User Experience Flow

### Phase 1: Planning (States: THINKING → SUBTASKS → COLLECT_NODES → OUTLINE → PURPOSE)

1. User types a natural language request (e.g., "Send me a Slack message when I get an email")
2. System shows animated chips indicating progress through planning stages:
   - **Thinking** - Shimmer effect with pulsing dot
   - **Subtasks** - Lists the breakdown of steps needed
   - **Collect Nodes** - Shows relevant integration nodes with icons
   - **Outline** - Displays the flow structure
   - **Purpose** - Shows the workflow's goal

### Phase 2: Build Skeleton (State: BUILDING_SKELETON)

1. User clicks "Build" button
2. Nodes appear on canvas in greyscale (all have `node-grey` CSS class)
3. Camera pans to fit all nodes
4. System transitions to node-by-node configuration

### Phase 3: Node Configuration (States: WAITING_USER → PREPARING_NODE → TESTING_NODE)

For each node in the plan:

1. **WAITING_USER** - System pans camera to current node
   - Current node gets `node-active` class (glowing animation)
   - Setup card appears with:
     - Connection selector (pick existing or create new)
     - Parameter inputs
     - Continue/Skip buttons

2. **PREPARING_NODE** - User fills in configuration
   - "Preparing [NodeName]..." badge shows

3. **TESTING_NODE** - System tests the node
   - "Testing [NodeName]..." badge shows
   - Node transitions from `node-active` to `node-done`

4. Repeat for next node

### Phase 4: Complete (State: COMPLETE)

- All nodes have `node-done` class
- Success message shows with "Publish" and "Test all" buttons

## Animation Details

### Staged Chips

Visual indicators that show progression through planning states:

- **Blue chips** - Active/in-progress states
- **Green chips** - Completed states
- **Shimmer effect** - Applied during active processing
- **Pulsing dot** - Shows ongoing activity
- **Bouncing dots** - Three-dot animation for longer operations

### Node Styling

- **`node-grey`** - Greyscale filter, 75% opacity (skeleton/future nodes)
- **`node-active`** - Glowing blue border with pulse animation (current node)
- **`node-done`** - Full color, no filters (completed nodes)

### Camera Animations

- **Skeleton build** - Fit view with 800ms duration, 0.2 padding
- **Node focus** - Pan to node center with 800ms duration

### Floating Badge

Displays current build state at the top center of the screen:

- Auto-updates based on state transitions
- Shows spinner or dots depending on operation
- Includes subtext for additional context

## API Integration

The animated build UX uses existing Flow V2 APIs:

- **`actions.askAgent(prompt)`** - Generates flow plan from natural language
- **`actions.applyEdits(edits)`** - Creates nodes on canvas
- **`actions.runFromHere(nodeId)`** - Tests individual nodes (TODO: wire up)

No backend changes are required.

## Implementation Checklist

- [x] Create BuildState.ts with state machine
- [x] Create FlowBuilder.anim.css with animations
- [x] Add build state machine to WorkflowBuilderV2
- [x] Implement staged progression UI in agent panel
- [x] Add floating badge component
- [x] Implement node CSS class application
- [x] Add camera panning animations
- [x] Wire up Build button handler
- [x] Make animated build the default (removed feature flag)
- [x] Implement auto-submit from AI agent page
- [ ] Wire up actual secrets picker in setup cards
- [ ] Wire up actual params form controls
- [ ] Implement node testing with `actions.runFromHere()`
- [ ] Add Jest tests for state machine
- [ ] Add Playwright E2E tests for full build flow
- [ ] Update IMPLEMENTATION_PLAN.md with checklist

## Testing

### Manual Smoke Test

1. Go to `/workflows/ai-agent`
2. Enter prompt: "Send a Slack message when I receive a Gmail email"
3. Press Enter
4. Verify redirect to `/workflows/builder`
5. Verify React Agent panel is open (left side)
6. Verify prompt appears in chat and build starts automatically
7. Verify progression through all planning states (chips appear sequentially)
8. Click "Build" button when plan is ready
9. Verify nodes appear on canvas in greyscale
10. Verify camera pans to show all nodes
11. Verify first node becomes active (glowing)
12. Fill in connection and parameters
13. Click "Continue"
14. Verify node transitions to "done" state
15. Verify next node becomes active
16. Complete all nodes
17. Verify "Complete" state shows success message

### Automated Tests (TODO)

```bash
# Unit tests for state machine
npm run test -- BuildState.test.ts

# E2E tests for animated build
npm run test:e2e -- flow-v2-animated-build.spec.ts
```

## Debugging

### Common Issues

1. **Nodes not getting styled** - Check that CSS file import path is correct in WorkflowBuilderV2.tsx
2. **State machine not progressing** - Check console for errors from `actions.askAgent()`
3. **Camera not panning** - Verify `reactFlowInstanceRef.current` is set in ReactFlow's `onInit`
4. **Badge not showing** - Ensure state is not IDLE (should show once agent starts thinking)
5. **Auto-submit not working** - Check that sessionStorage or URL prompt parameter is being set correctly from AI agent page

### Debug Tips

```typescript
// Add to WorkflowBuilderV2.tsx to log state transitions
useEffect(() => {
  console.log('[AnimatedBuild] State:', buildMachine.state, 'Progress:', buildMachine.progress)
}, [buildMachine.state, buildMachine.progress])
```

## Future Enhancements

- [ ] Add undo/redo support during build process
- [ ] Allow editing plan before building
- [ ] Add node reordering during build
- [ ] Implement drag-and-drop for plan items
- [ ] Add voice guidance for accessibility
- [ ] Add tooltips explaining each stage
- [ ] Add keyboard shortcuts for Continue/Skip
- [ ] Add bulk node configuration for similar nodes
- [ ] Add AI-powered parameter suggestions
- [ ] Add real-time collaboration for team flows

## Related Documentation

- `/learning/docs/integration-development-guide.md` - Adding new integrations
- `/learning/docs/workflow-execution-implementation-guide.md` - Execution patterns
- `/learning/docs/field-implementation-guide.md` - Node configuration fields
