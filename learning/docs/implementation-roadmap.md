# Implementation Roadmap - Advanced Workflow Features

**Created:** October 21, 2025
**Priority:** High - Competitive Features

This roadmap outlines the implementation order for all advanced workflow features designed to compete with Zapier.

---

## Phase 1: Foundation (Week 1-2)

### ✅ COMPLETED
- [x] Plan-based restrictions system
- [x] Pricing updated to Option B (AI in Professional $39/mo)
- [x] Design specifications for all features
- [x] Architecture decisions documented

### 🔨 IN PROGRESS
None currently

### ⏭️ NEXT UP

#### 1.1 Workflow Builder Tabs Infrastructure
**Files to Create/Modify:**
- `/components/workflows/builder/WorkflowBuilderTabs.tsx` (NEW)
- `/components/workflows/builder/HistoryTab.tsx` (NEW)
- `/components/workflows/builder/SettingsTab.tsx` (NEW)
- `/app/workflows/builder/[id]/page.tsx` (MODIFY - add tabs)

**Why First:** Foundation for history and settings features

**Estimated Time:** 4 hours

---

## Phase 2: Core Action Nodes (Week 2-3)

### 2.1 Path/If-Else Node (HIGHEST PRIORITY)
**Why:** Essential for workflow logic, competitive necessity

**Files to Create:**
- `/lib/workflows/nodes/PathNode.ts` - Node definition
- `/components/workflows/configuration/providers/path/PathConfiguration.tsx` - UI
- `/components/workflows/configuration/providers/path/CriteriaBuilder.tsx` - Visual builder
- `/lib/workflows/actions/path/executePathAction.ts` - Execution logic

**Key Features:**
- 3-dropdown visual builder (Field/Operator/Value)
- Context-aware field suggestions from previous node
- Multiple condition support (AND/OR)
- Variable comparison
- Visual branch representation on canvas

**Estimated Time:** 12 hours

**Dependencies:** None

---

### 2.2 Delay Action Node
**Why:** Common use case, enables drip campaigns

**Files to Create:**
- `/lib/workflows/nodes/DelayNode.ts`
- `/components/workflows/configuration/providers/delay/DelayConfiguration.tsx`
- `/lib/workflows/actions/delay/executeDelayAction.ts`

**Key Features:**
- Wait duration (minutes/hours/days/weeks)
- Wait until specific date/time
- Variable-based dates ({{reminder_date}})
- Future: AI follow-up email option

**Estimated Time:** 6 hours

**Dependencies:** None

---

### 2.3 Filter Action Node
**Why:** Saves tasks by stopping workflows early

**Files to Create:**
- `/lib/workflows/nodes/FilterNode.ts`
- `/components/workflows/configuration/providers/filter/FilterConfiguration.tsx`
- `/lib/workflows/actions/filter/executeFilterAction.ts`

**Key Features:**
- Similar criteria builder to Path node
- "Stop workflow if conditions not met"
- Clear messaging: "Stopped by filter" vs "Failed"

**Estimated Time:** 8 hours (reuse Path node criteria builder)

**Dependencies:** Path node (for criteria builder component)

---

### 2.4 HTTP Request Action
**Why:** Universal connector, webhook sender

**Files to Create:**
- `/lib/workflows/nodes/HttpRequestNode.ts`
- `/components/workflows/configuration/providers/http/HttpRequestConfiguration.tsx`
- `/lib/workflows/actions/http/executeHttpRequestAction.ts`

**Key Features:**
- GET, POST, PUT, DELETE, PATCH
- Headers, query params, body
- Auth templates (API Key, Bearer, Basic, OAuth)
- Variable insertion
- Test request button
- Response data capture

**Estimated Time:** 10 hours

**Dependencies:** None

---

## Phase 3: Workflow Management (Week 3-4)

### 3.1 Workflow History Tab
**Why:** Users need to see execution results

**Files to Create:**
- `/components/workflows/builder/HistoryTab.tsx`
- `/components/workflows/builder/ExecutionDetailModal.tsx`
- `/app/api/workflows/[id]/executions/route.ts` (API)

**Key Features:**
- List of all executions with filters
- Success/failed indicators
- Click to view step-by-step details
- Input/output data for each step
- JSON viewer for raw payloads
- Retention based on plan tier

**Estimated Time:** 8 hours

**Dependencies:** Tabs infrastructure

---

### 3.2 Workflow Settings Tab
**Why:** Error handling, scheduling, advanced config

**Files to Create:**
- `/components/workflows/builder/SettingsTab.tsx`
- `/components/workflows/builder/settings/ErrorHandlingSection.tsx`
- `/components/workflows/builder/settings/ScheduleSection.tsx`
- `/app/api/workflows/[id]/settings/route.ts` (API)

**Key Features:**
- General settings (name, description, folder)
- Error handling configuration
- Schedule settings
- Advanced options (concurrency, timeout)

**Estimated Time:** 10 hours

**Dependencies:** Tabs infrastructure

---

### 3.3 Error Handling - Global Workflow Settings
**Why:** Users need to know when workflows fail

**Files to Modify:**
- `/components/workflows/builder/settings/ErrorHandlingSection.tsx` (from 3.2)
- `/app/api/workflows/[id]/settings/route.ts` (from 3.2)
- `/lib/notifications/sendErrorNotification.ts` (NEW)

**Key Features:**
- Email, Slack, Discord, SMS notifications
- Auto-retry with exponential backoff
- Configurable max retries
- Discovery tooltip on first publish

**Estimated Time:** 6 hours

**Dependencies:** Settings tab

---

### 3.4 Per-Node Error Handling (Try/Catch)
**Why:** Alternative paths for specific failures

**Files to Modify:**
- All existing action node configurations (add Error Handling tab)
- `/components/workflows/configuration/ErrorHandlingTab.tsx` (NEW - reusable)
- Workflow execution engine to handle error paths

**Key Features:**
- Stop workflow (use global)
- Retry automatically
- Run alternative path (visual dashed red connection)
- Continue anyway (ignore error)

**Estimated Time:** 12 hours

**Dependencies:** None (can be done in parallel)

---

## Phase 4: Scheduling (Week 4)

### 4.1 Scheduled Workflows (Publish Modal)
**Why:** Recurring workflows without triggers

**Files to Modify:**
- `/components/workflows/builder/PublishModal.tsx` (existing) - add schedule UI
- `/app/api/workflows/[id]/route.ts` - save schedule config
- `/lib/workflows/scheduler/WorkflowScheduler.ts` (NEW) - cron-like scheduler

**Key Features:**
- Activation type: Trigger-based vs Scheduled
- Frequency: Once, Hourly, Daily, Weekly, Monthly, Custom (Cron)
- Time, timezone, days of week
- Start/end dates
- Preview next run time

**Estimated Time:** 10 hours

**Dependencies:** None

---

## Phase 5: AI Features (Week 5-6)

### 5.1 AI Agent Chain Configuration UI
**Why:** Professional plan differentiator

**Files to Modify:**
- `/components/workflows/ai-builder/AIAgentConfigModal.tsx` (existing)
- Add "Chain Criteria Builder" section
- `/components/workflows/ai-builder/ChainCriteriaBuilder.tsx` (NEW)

**Key Features:**
- Natural language chain descriptions
- Context-aware criteria hints
- Field suggestions from previous node
- Email-specific: subject/body contains, sentiment, priority
- Notion-specific: status, priority, assignee
- Generic: JSON path selector

**Estimated Time:** 14 hours

**Dependencies:** Must understand AI agent existing structure

---

### 5.2 AI Follow-Up Email (Future/Premium)
**Why:** Advanced automation for Professional+ users

**Files to Modify:**
- Gmail send action node (add checkbox "Generate AI follow-up")
- Delay node (detect email + delay pattern)
- AI generation service

**Key Features:**
- Detect first email + delay + second email pattern
- Checkbox: "Generate AI follow-up after delay"
- AI pre-fills subject ("Re: ...") and body
- User can edit before publishing

**Estimated Time:** 8 hours

**Dependencies:** Delay node, AI service integration

**Note:** Low priority, can be Phase 6

---

## Phase 6: Polish & UX (Week 6-7)

### 6.1 In-Node Test Run Data Display
**Why:** User wants to see output in nodes during test

**Files to Modify:**
- Workflow canvas nodes (add data overlay during test mode)
- Test execution flow to capture and display data
- `/components/workflows/builder/NodeDataOverlay.tsx` (NEW)

**Key Features:**
- After test run, show input/output data on each node
- Collapsible overlay on node
- JSON viewer
- Copy to clipboard
- Clear indicators for success/failure

**Estimated Time:** 8 hours

**Dependencies:** None

---

### 6.2 Template Page Enhancements
**Why:** Better template discovery

**Files to Modify:**
- `/app/templates/page.tsx` (existing)
- Add categories: Popular, Recently Added
- Add search/filter by integration
- Improve layout

**Estimated Time:** 6 hours

**Dependencies:** None

---

## Phase 7: Backend & Infrastructure (Ongoing)

### 7.1 Task Tracking & Billing Reset
**Why:** Usage-based pricing enforcement

**Files to Create:**
- `/lib/tasks/trackTaskUsage.ts` (NEW)
- `/lib/tasks/resetMonthlyTasks.ts` (NEW - cron job)
- Modify workflow execution engine to increment tasks_used

**Key Features:**
- Increment tasks_used on each workflow execution
- Check tasks_limit before execution
- Monthly reset based on billing_period_start
- Overage handling (stop or allow with fee)

**Estimated Time:** 8 hours

**Dependencies:** None

---

### 7.2 Stripe Integration (Future)
**Why:** Actual payment processing

**Files to Create:**
- `/app/api/stripe/checkout/route.ts`
- `/app/api/stripe/webhook/route.ts`
- `/lib/stripe/createCheckoutSession.ts`
- `/lib/stripe/handleSubscription.ts`

**Key Features:**
- Upgrade plan flow → Stripe checkout
- Subscription management
- Plan changes
- Invoice history

**Estimated Time:** 16 hours

**Dependencies:** None (can be done in parallel)

---

## Priority Matrix

### High Priority (Week 1-4)
1. **Path/If-Else Node** - Essential for workflow logic
2. **Delay Node** - Common use case
3. **HTTP Request** - Universal connector
4. **History Tab** - Users need execution visibility
5. **Settings Tab + Error Handling** - Reliability & trust

### Medium Priority (Week 4-6)
6. **Filter Node** - Task savings
7. **Scheduled Workflows** - Recurring automation
8. **Per-Node Error Handling** - Advanced users
9. **AI Agent Chain UI** - Professional plan differentiator

### Low Priority (Week 6-7)
10. **In-Node Test Data** - Nice-to-have UX
11. **Template Enhancements** - Discoverability
12. **AI Follow-Up Email** - Premium feature

### Infrastructure (Ongoing)
13. **Task Tracking** - Backend enforcement
14. **Stripe Integration** - Monetization

---

## Estimated Total Time

- **Phase 1 (Foundation):** 4 hours
- **Phase 2 (Action Nodes):** 36 hours
- **Phase 3 (Management):** 36 hours
- **Phase 4 (Scheduling):** 10 hours
- **Phase 5 (AI Features):** 22 hours
- **Phase 6 (Polish):** 14 hours
- **Phase 7 (Backend):** 24 hours

**Total:** ~146 hours (approximately 4-5 weeks with full-time effort)

---

## Success Metrics

### Technical Metrics
- [ ] All action nodes execute successfully
- [ ] Error handling catches and retries as expected
- [ ] Scheduled workflows run on time
- [ ] History shows accurate execution data
- [ ] AI agent chains route correctly

### Business Metrics
- [ ] Users upgrade from Free to Starter (Path/Filter/Delay value)
- [ ] Users upgrade from Starter to Professional (AI Agents value)
- [ ] Users upgrade from Professional to Team (Team sharing value)
- [ ] Average workflows per user increases
- [ ] Task usage increases (more valuable workflows)

### User Experience Metrics
- [ ] Users can build complex workflows without documentation
- [ ] Error notifications reduce support tickets
- [ ] History tab reduces "did my workflow run?" questions
- [ ] AI agent chains reduce need for manual Path nodes

---

## Next Steps

**Immediate (Today):**
1. Review and approve this roadmap
2. Decide which phase to start with
3. Set up project tracking (GitHub Projects, Linear, etc.)

**This Week:**
1. Implement tabs infrastructure
2. Start Path/If-Else node implementation
3. Create reusable CriteriaBuilder component

**This Month:**
1. Complete Phase 1-3 (Foundation + Core Nodes + Management)
2. Beta test with select users
3. Gather feedback and iterate

**Next Month:**
1. Complete Phase 4-6 (Scheduling + AI + Polish)
2. Launch publicly
3. Monitor usage and iterate based on data

---

## Questions for Discussion

1. **Should we implement in this exact order, or prioritize differently?**
2. **Do we need all features before launch, or can we ship iteratively?**
3. **Should AI features (Phase 5) come before or after Scheduling (Phase 4)?**
4. **What's the minimum viable feature set to compete with Zapier?**
5. **Should we focus on breadth (many features) or depth (fewer features, very polished)?**

---

## Files Created Today

- [x] `/lib/utils/plan-restrictions.ts` - Plan-based feature gating
- [x] `/hooks/use-plan-restrictions.ts` - React hook for restrictions
- [x] `/components/plan-restrictions/LockedFeature.tsx` - Wrapper component
- [x] `/components/plan-restrictions/UpgradePlanModal.tsx` - Upgrade dialog
- [x] `/components/workflows/WorkflowShareButton.tsx` - Example usage
- [x] `/learning/docs/plan-restrictions-implementation.md` - Documentation
- [x] `/learning/docs/workflow-advanced-features-design.md` - Full wireframes
- [x] `/learning/docs/answers-to-your-questions.md` - Q&A summary
- [x] `/learning/docs/implementation-roadmap.md` - This document

**Next file to create:** `/components/workflows/builder/WorkflowBuilderTabs.tsx`
