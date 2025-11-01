# AI Agent Flow - Enhancement Roadmap

**Created**: October 31, 2025
**Status**: Post-MVP Enhancements
**Current Completion**: 12/12 Core Features (100%)

---

## 📊 Enhancement Status Overview

| Enhancement | Priority | Effort | Status | Impact |
|-------------|----------|--------|--------|--------|
| Planner Node Descriptions | High | Medium | Not Started | UX Clarity |
| Complete Output Schemas | High | High | Not Started | Variable Picker |
| Runtime Execution States | Medium | Medium | Not Started | Visual Feedback |
| Sample Data Preview | Medium | High | Not Started | Testing UX |
| Node Testing in Guided Setup | High | Medium | Not Started | Quality Assurance |
| Actual Cost Tracking | Low | Low | Not Started | Analytics |

---

## 🎯 Enhancement #1: Planner Node Descriptions

### Current State:
- Planner generates basic node edits with type only
- Canvas shows nodes with default titles
- No descriptions or subtitles on canvas
- Node cards lack rich preview information

### What's Missing:
```typescript
// Current planner output
{
  op: "addNode",
  node: {
    type: "gmail_action_send_email",
    position: { x: 400, y: 100 }
  }
}

// Enhanced planner output needed
{
  op: "addNode",
  node: {
    type: "gmail_action_send_email",
    position: { x: 400, y: 100 },
    description: "Send notification email to team",  // ← Missing
    subtitle: "To: team@company.com",                // ← Missing
    previewSnippet: "Subject: Task completed"        // ← Missing
  }
}
```

### Implementation Plan:

1. **Update Planner Prompt** (30 min)
   - File: `/src/lib/workflows/builder/agent/planner.ts`
   - Add instructions to generate descriptions
   - Include context-aware subtitles
   - Generate preview snippets

2. **Update Canvas Node Component** (1 hour)
   - File: `/components/workflows/CustomNode.tsx`
   - Display description below title
   - Show subtitle in muted text
   - Add preview snippet tooltip

3. **Update FlowV2AgentPanel** (30 min)
   - File: `/components/workflows/builder/FlowV2AgentPanel.tsx`
   - Display rich descriptions in plan list
   - Show preview snippets in node cards

### Example Output:
```typescript
// Gmail Send Email Node
{
  title: "Gmail.SendEmail",
  description: "Send notification email to team",
  subtitle: "To: team@company.com",
  previewSnippet: "Subject: Task completed\nBody: The workflow has finished...",
}

// Slack Post Message Node
{
  title: "Slack.Post",
  description: "Post status update to #engineering",
  subtitle: "Channel: #engineering",
  previewSnippet: "Message: Deployment successful ✅",
}
```

### Success Criteria:
- ✅ Planner generates descriptions for every node
- ✅ Canvas shows descriptions below node titles
- ✅ Agent panel displays rich previews
- ✅ Tooltips show preview snippets on hover

### Priority: **HIGH**
**Why**: Significantly improves clarity of what each node does in the workflow.

---

## 🎯 Enhancement #2: Complete Output Schemas

### Current State:
- Some nodes have `outputSchema` defined
- Many nodes return data but schema is incomplete
- Variable picker can't suggest all available fields
- Type safety is partial

### What's Missing:

**Nodes Without Complete Output Schemas:**
- Gmail triggers: `newAttachment`, `newStarredEmail`, `newLabeledEmail`
- Gmail actions: `createDraft`, `createDraftReply`, `archiveEmail`, `deleteEmail`, `removeLabel`, `createLabel`, `replyToEmail`, `getAttachment`, `downloadAttachment`, `advancedSearch`, `updateSignature`, `markAsRead`, `markAsUnread`
- Slack actions: `addReminder`, `deleteMessage`, `findUser`, `getThreadMessages`, `pinMessage`, `postInteractiveBlocks`, `setChannelPurpose`, `setChannelTopic`, `unpinMessage`, `updateMessage`, `uploadFile`
- Slack triggers: `channelCreated`, `memberJoinedChannel`, `memberLeftChannel`, `newDirectMessage`, `newGroupDirectMessage`, `newMessagePrivateChannel`, `reactionRemoved`, `slashCommand`
- Airtable actions: All actions need schemas
- Google Drive actions: All actions need schemas
- Google Sheets actions: All actions need schemas
- Notion actions: All actions need schemas
- Mailchimp actions: All actions need schemas

### Implementation Plan:

1. **Audit All Nodes** (2 hours)
   - Create spreadsheet of all 247 nodes
   - Mark which have complete `outputSchema`
   - Document expected output for each

2. **Define Output Schemas** (8-10 hours)
   - File pattern: `/lib/workflows/nodes/providers/{provider}/actions/{action}.schema.ts`
   - For each node, add `outputSchema` using Zod
   - Document all return fields with types

3. **Update Node Definitions** (2 hours)
   - Ensure all nodes export `outputSchema`
   - Update `availableNodes.ts` imports
   - Test schema validation

### Example Output Schema:

```typescript
// Gmail Send Email - COMPLETE
export const sendEmailActionSchema = {
  type: "gmail_action_send_email",
  title: "Send Email",
  outputSchema: z.object({
    messageId: z.string().describe("Gmail message ID"),
    threadId: z.string().describe("Gmail thread ID"),
    sentTo: z.array(z.string()).describe("Email recipients"),
    subject: z.string().describe("Email subject line"),
    sentAt: z.string().datetime().describe("Timestamp when sent"),
    success: z.boolean().describe("Whether send was successful"),
  }),
}

// Slack Post Message - COMPLETE
export const sendMessageActionSchema = {
  type: "slack_action_send_message",
  title: "Post Message",
  outputSchema: z.object({
    ts: z.string().describe("Message timestamp (unique ID)"),
    channel: z.string().describe("Channel ID where posted"),
    permalink: z.string().url().describe("Permanent link to message"),
    text: z.string().describe("Message text that was posted"),
  }),
}
```

### Variable Picker Integration:

Once schemas are complete, the variable picker can suggest fields:

```tsx
// User types {{
// Dropdown shows:
{{trigger.messageId}}       // string - Gmail message ID
{{trigger.subject}}          // string - Email subject line
{{trigger.from}}             // string - Sender email
{{sendEmail.messageId}}      // string - Sent email ID
{{sendEmail.sentAt}}         // datetime - When email was sent
{{slackPost.permalink}}      // url - Link to Slack message
```

### Success Criteria:
- ✅ All 247 nodes have complete `outputSchema`
- ✅ Variable picker suggests all available fields
- ✅ Merge field syntax works for all outputs
- ✅ Type checking catches invalid references

### Priority: **HIGH**
**Why**: Critical for variable picker, type safety, and workflow composability.

**Estimated Total Time**: 12-14 hours

---

## 🎯 Enhancement #3: Runtime Execution States

### Current State:
- Build choreography shows skeleton → ready states
- During actual workflow execution, no visual states
- Nodes don't show success/failure during runs
- No real-time progress indicators

### What's Missing:

**Visual States Needed During Execution:**
1. **Queued** - Node waiting to execute (grey)
2. **Running** - Node currently executing (blue pulse)
3. **Success** - Node completed successfully (green)
4. **Failed** - Node failed with error (red)
5. **Skipped** - Node skipped due to conditional (yellow)

### Implementation Plan:

1. **Update Execution Engine** (1 hour)
   - File: `/lib/execution/advancedExecutionEngine.ts`
   - Emit real-time status updates
   - Use WebSocket or Server-Sent Events

2. **Create Execution State Hook** (1 hour)
   - File: `/hooks/workflows/useExecutionState.ts`
   ```typescript
   export function useExecutionState(flowId: string, runId: string) {
     const [nodeStates, setNodeStates] = useState<Record<string, ExecutionState>>({})

     useEffect(() => {
       // Subscribe to execution updates
       const subscription = subscribeToExecution(runId, (update) => {
         setNodeStates(prev => ({
           ...prev,
           [update.nodeId]: update.state
         }))
       })

       return () => subscription.unsubscribe()
     }, [runId])

     return nodeStates
   }
   ```

3. **Apply Visual States** (1 hour)
   - File: `/components/workflows/CustomNode.tsx`
   - Add CSS classes based on execution state
   - Show progress indicators
   - Display error badges

4. **Add Real-Time Updates** (2 hours)
   - Create SSE endpoint: `/api/workflows/[id]/runs/[runId]/stream`
   - Stream execution events
   - Update UI in real-time

### Example Visual States:

```css
/* Queued */
.node-queued {
  opacity: 0.6;
  filter: grayscale(0.3);
}

/* Running */
.node-running {
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.5);
  animation: pulse 1.5s ease-in-out infinite;
}

/* Success */
.node-success {
  border-color: hsl(var(--success));
  background: linear-gradient(to bottom, transparent, rgba(34, 197, 94, 0.05));
}

/* Failed */
.node-failed {
  border-color: hsl(var(--destructive));
  background: linear-gradient(to bottom, transparent, rgba(239, 68, 68, 0.05));
}

/* Skipped */
.node-skipped {
  opacity: 0.5;
  border-style: dashed;
}
```

### Success Criteria:
- ✅ Nodes show real-time execution states
- ✅ Success/failure visually distinct
- ✅ Running nodes have animated indicators
- ✅ Failed nodes show error badges
- ✅ State updates stream in real-time

### Priority: **MEDIUM**
**Why**: Improves debugging and monitoring, but workflows still execute without this.

**Estimated Time**: 5-6 hours

---

## 🎯 Enhancement #4: Sample Data Preview

### Current State:
- Nodes execute and return data
- No preview of output data on canvas
- Can't see what data looks like without checking logs
- Testing requires multiple clicks

### What's Missing:

**Sample Data Preview Block:**
```tsx
// On canvas after node execution
┌─────────────────────────┐
│ Gmail.Trigger           │
├─────────────────────────┤
│ ✓ Test successful       │
│                         │
│ Sample Output:          │
│ {                       │
│   "subject": "Hello",   │
│   "from": "user@...",   │
│   "messageId": "18a..." │
│ }                       │
└─────────────────────────┘
```

### Implementation Plan:

1. **Add Sample Data to Node State** (30 min)
   - Update node data model to include `sampleOutput`
   - Store after test execution

2. **Create Preview Component** (2 hours)
   - File: `/components/workflows/NodeDataPreview.tsx`
   - Collapsible JSON viewer
   - Syntax highlighting
   - Copy individual fields

3. **Integrate with Test Flow** (1 hour)
   - When node is tested in guided setup
   - Save output to node state
   - Display in preview block

4. **Add to Canvas Node** (1 hour)
   - Show preview block below node
   - Expandable/collapsible
   - Max height with scroll

### Example Preview:

```tsx
<NodeDataPreview
  data={{
    subject: "Meeting Tomorrow",
    from: "boss@company.com",
    messageId: "18abc123",
    receivedAt: "2025-10-31T10:30:00Z",
    labels: ["INBOX", "IMPORTANT"]
  }}
  schema={gmailTriggerOutputSchema}
  onCopyField={(field) => copyMergeField(nodeId, field)}
/>
```

### Success Criteria:
- ✅ Sample data shown after test execution
- ✅ JSON formatted with syntax highlighting
- ✅ Individual fields copyable as merge fields
- ✅ Preview collapses to save space
- ✅ Schema validation highlights type mismatches

### Priority: **MEDIUM**
**Why**: Nice to have for testing, but not critical for workflow execution.

**Estimated Time**: 4-5 hours

---

## 🎯 Enhancement #5: Node Testing in Guided Setup

### Current State:
- Guided setup shows Continue/Skip buttons
- Continue button doesn't actually test the node
- No validation that configuration works
- Users can skip broken nodes

### What's Missing:

**Test Execution in Guided Setup:**
1. User configures node (connection, fields)
2. Clicks "Continue"
3. **System tests the node with config**
4. Shows success/failure
5. Displays sample output
6. Advances to next node on success

### Implementation Plan:

1. **Create Test Execution API** (2 hours)
   - Endpoint: `/api/workflows/[id]/nodes/[nodeId]/test`
   - Execute single node with current config
   - Return success/failure + sample data

2. **Update handleContinueNode** (1 hour)
   - File: `/components/workflows/builder/WorkflowBuilderV2.tsx`
   ```typescript
   const handleContinueNode = async () => {
     const currentNode = builder.nodes[buildMachine.progress.currentIndex]

     // Save configuration
     await actions.updateNodeConfig(currentNode.id, nodeConfigs[currentNode.id])

     transitionTo(BuildState.TESTING_NODE)

     try {
       // Test the node
       const result = await testNode(flowId, currentNode.id)

       // Save sample data
       await actions.updateNodeData(currentNode.id, {
         sampleOutput: result.output,
         lastTestedAt: new Date()
       })

       // Track cost
       if (result.cost) {
         costTracker.addEntry(
           result.provider,
           result.model,
           result.tokens,
           result.cost
         )
       }

       transitionTo(BuildState.WAITING_USER)
       advanceToNextNode()

     } catch (error) {
       // Show error, stay on current node
       toast({ title: "Test failed", description: error.message })
       transitionTo(BuildState.WAITING_USER)
     }
   }
   ```

3. **Add Test Results UI** (1 hour)
   - Show success/failure badge
   - Display sample output
   - Retry button on failure

4. **Update Cost Tracking** (30 min)
   - Track cost per tested node
   - Update CostDisplay with actual costs
   - Compare estimate vs actual

### Success Criteria:
- ✅ Continue button tests node before advancing
- ✅ Success/failure clearly shown
- ✅ Sample output displayed
- ✅ Cost tracked per test
- ✅ Can retry failed tests
- ✅ Can skip untested nodes (with warning)

### Priority: **HIGH**
**Why**: Critical for ensuring workflows are configured correctly before deployment.

**Estimated Time**: 4-5 hours

---

## 🎯 Enhancement #6: Actual Cost Tracking

### Current State:
- Cost estimation before build
- No tracking during actual execution
- CostDisplay shows estimate only
- No historical cost data

### What's Missing:

**Actual Cost Tracking:**
1. Track tokens used per node during execution
2. Calculate actual cost per run
3. Show estimate vs actual comparison
4. Store cost history per workflow

### Implementation Plan:

1. **Update Execution Engine** (1 hour)
   - Track tokens used per AI operation
   - Calculate cost using current pricing
   - Store in `flow_v2_run_nodes` table

2. **Add Cost to Execution Results** (30 min)
   - Include cost in execution response
   - Update CostTracker with actuals

3. **Create Cost History View** (2 hours)
   - File: `/components/workflows/CostHistory.tsx`
   - Show estimate vs actual per run
   - Chart cost over time
   - Breakdown by node type

4. **Update Database Schema** (30 min)
   - Already has `estimated_cost` and `actual_cost` columns
   - Add indexes for querying

### Example Cost Comparison:

```tsx
<CostComparison>
  Estimate: $0.0045
  Actual:   $0.0052  (+15%)

  Breakdown:
  - AI Agent:      $0.0035 (67%)
  - Gmail Send:    $0.0000 (0%)
  - Slack Post:    $0.0000 (0%)
  - Format Text:   $0.0017 (33%)
</CostComparison>
```

### Success Criteria:
- ✅ Actual costs tracked per execution
- ✅ Estimate vs actual shown after run
- ✅ Cost history chart available
- ✅ Breakdown by node type
- ✅ Historical cost trends visible

### Priority: **LOW**
**Why**: Nice to have for analytics, but not critical for core workflow functionality.

**Estimated Time**: 4 hours

---

## 📈 Implementation Priorities

### Phase 1: Quality & UX (HIGH Priority)
**Total Time**: ~10 hours

1. **Node Testing in Guided Setup** (4-5 hours)
   - Ensures workflows are configured correctly
   - Prevents broken deployments

2. **Planner Node Descriptions** (2 hours)
   - Improves clarity of what each node does
   - Better UX in agent panel

3. **Complete Output Schemas** (Start with top 20 nodes) (4 hours)
   - Enables variable picker for most common nodes
   - Incremental improvement approach

### Phase 2: Visual Feedback (MEDIUM Priority)
**Total Time**: ~9-10 hours

4. **Runtime Execution States** (5-6 hours)
   - Real-time visual feedback
   - Better debugging experience

5. **Sample Data Preview** (4-5 hours)
   - See output data on canvas
   - Easier testing

### Phase 3: Analytics (LOW Priority)
**Total Time**: ~4 hours

6. **Actual Cost Tracking** (4 hours)
   - Historical cost data
   - Optimization insights

---

## 🎯 Quick Wins

If you want immediate impact with minimal effort:

### 1 Hour Wins:
- ✅ **Planner Node Descriptions** (UI only)
  - Update agent panel to show richer descriptions
  - No planner changes yet

### 2 Hour Wins:
- ✅ **Top 10 Output Schemas**
  - Gmail: sendEmail, newEmail
  - Slack: sendMessage, newMessage
  - AI: aiAgent, aiGenerate
  - Covers 80% of use cases

### 4 Hour Wins:
- ✅ **Basic Node Testing**
  - Test button in guided setup
  - Success/failure only (no sample data)

---

## 📊 ROI Analysis

| Enhancement | User Impact | Dev Time | ROI |
|-------------|------------|----------|-----|
| Node Testing | 🔥 Critical | 4-5h | Very High |
| Output Schemas (Top 20) | 🔥 High | 4h | Very High |
| Planner Descriptions | ⭐ High | 2h | High |
| Runtime States | ⭐ Medium | 5-6h | Medium |
| Sample Preview | ⭐ Medium | 4-5h | Medium |
| Cost Tracking | 💡 Low | 4h | Low |

---

## 🚀 Recommended Implementation Order

**Week 1: Core Quality** (10 hours)
1. Node Testing in Guided Setup (4-5h)
2. Planner Node Descriptions (2h)
3. Top 20 Output Schemas (4h)

**Week 2: Visual Feedback** (10 hours)
4. Runtime Execution States (5-6h)
5. Sample Data Preview (4-5h)

**Week 3: Polish** (8 hours)
6. Remaining Output Schemas (4h)
7. Actual Cost Tracking (4h)

**Total Time**: ~28 hours over 3 weeks

---

## 🔧 Technical Dependencies

### Must Have Before Starting:
- ✅ Database migration applied (chat persistence)
- ✅ Core AI Agent Flow tested and working
- ✅ No blocking bugs from current implementation

### Nice to Have:
- 📊 Usage analytics to prioritize schemas
- 👥 User feedback on what features matter most
- 🎨 Design mockups for new visual states

---

## 📝 Documentation Needed

For each enhancement:
1. **Implementation Guide** - Step-by-step instructions
2. **API Documentation** - New endpoints and payloads
3. **User Guide** - How to use the feature
4. **Testing Checklist** - Verify it works

---

## ✅ Success Metrics

**Node Testing:**
- 90%+ of workflows tested before deployment
- 50% reduction in broken workflow deployments
- User satisfaction: 8/10+

**Output Schemas:**
- 100% of nodes have complete schemas
- 80%+ of users use variable picker
- Type errors caught before execution

**Runtime States:**
- Real-time updates within 500ms
- Visual states accurate 99%+ of time
- Reduced debugging time by 30%

**Sample Preview:**
- 70%+ of users view sample data
- Faster iteration on workflow development

**Cost Tracking:**
- Cost estimates within 20% of actuals
- Users optimize workflows for cost

---

## 🎉 Summary

**Current State**: 12/12 core features complete (100%)

**Enhancement Path**:
- 6 enhancements identified
- ~28 hours total implementation
- Prioritized by user impact
- Incremental rollout plan

**Next Step**: Test current implementation, then prioritize enhancements based on real usage data.

---

**Document Version**: 1.0
**Last Updated**: October 31, 2025
**Author**: Claude Agent
**Status**: Ready for Implementation
