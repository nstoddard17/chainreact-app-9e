# Monday.com Integration Coverage Analysis

**Date:** October 30, 2025
**Comparison:** ChainReact vs Zapier vs Make.com

## Current ChainReact Coverage

### ✅ Actions (3)
1. **Create Item** - Create new item in board
2. **Update Item** - Update column values
3. **Create Update** - Post comment/update

### ✅ Triggers (2)
1. **New Item** - When item created
2. **Column Changed** - When column value changes

### ✅ Output Schema Status
- All 3 actions have complete `outputSchema` ✅
- All include descriptions and example values
- Ready for Phase 2B integration

---

## Zapier Coverage (Competition Analysis)

### Triggers (9)
1. ✅ **New Item in Board** (Instant) - We have this
2. ❌ **New Board** (Polling) - Missing
3. ✅ **Column Values Changed** - We have this (column_changed)
4. ❌ **Specific Columns Values Changed** - Missing (more granular version)
5. ❌ **Subitem Column Changed** - Missing
6. ❌ **Item Moved to Group** - Missing
7. ❌ **New Subitem Created** - Missing
8. ❌ **New Update in Board** (Instant) - Missing
9. ❌ **New User** (Polling) - Missing

**Gap:** 7 out of 9 triggers missing (78% gap)

### Actions
1. ✅ **Create Item** - We have this
2. ✅ **Create Update** - We have this
3. ✅ **Update Column Values** - We have this (update_item)
4. ❌ **Create Column** - Missing
5. ❌ **Update Subitem** - Missing
6. ❌ **API Request (Beta)** - Missing (raw GraphQL)

**Gap:** 3 out of 6 actions missing (50% gap)

---

## Make.com Coverage (Competition Analysis)

### Board Management
1. ❌ **Create Board** - Missing
2. ❌ **Add Column to Board** - Missing
3. ❌ **Add Subscribers to Board** - Missing
4. ❌ **List Boards** - Missing

### Group Management
1. ❌ **Create Group** - Missing
2. ❌ **List Groups** - Missing

### Item Management
1. ✅ **Create Item** - We have this
2. ❌ **Create Subitem** - Missing
3. ❌ **Delete/Archive Item** - Missing
4. ✅ **Update Column Values** - We have this
5. ❌ **Move Item to Group** - Missing
6. ❌ **List Items** - Missing

### Update Management
1. ✅ **Create Update** - We have this
2. ❌ **List Updates** - Missing

### File Management
1. ❌ **Add File to Column** - Missing
2. ❌ **Add File to Update** - Missing
3. ❌ **List Files** - Missing

### Tag Management
1. ❌ **Create/Get Tags** - Missing

### Advanced
1. ❌ **Execute GraphQL Query** - Missing
2. ❌ **List Users** - Missing
3. ❌ **Get User Details** - Missing

**Gap:** Significant - we have only 3 of ~25 actions (88% gap)

---

## Recommendations: Priority Node Additions

### 🔥 **HIGH PRIORITY** (Match Zapier baseline)

#### Triggers (Add 4)
1. **New Board**
   - Trigger when new board created
   - Use case: Automatically set up integrations for new projects
   - Difficulty: Medium

2. **Item Moved to Group**
   - Trigger when item changes group
   - Use case: Notify team when tasks move to different stages
   - Difficulty: Easy (webhook-based)

3. **New Subitem Created**
   - Trigger when subitem added to item
   - Use case: Track sub-task creation
   - Difficulty: Medium

4. **New Update in Board** (Instant)
   - Trigger when comment/update posted
   - Use case: Real-time collaboration notifications
   - Difficulty: Easy (webhook-based)

#### Actions (Add 3)
5. **Create Subitem**
   - Create sub-task under item
   - Use case: Auto-generate checklists, break down tasks
   - Difficulty: Medium
   - High demand in workflows

6. **Delete/Archive Item**
   - Remove or archive items
   - Use case: Cleanup workflows, automated maintenance
   - Difficulty: Easy

7. **Create Board**
   - Create new board programmatically
   - Use case: Project templating, automated board setup
   - Difficulty: Medium

### 📊 **MEDIUM PRIORITY** (Power user features)

#### Actions (Add 5)
8. **Create Group**
   - Add new section/group to board
   - Use case: Dynamic board organization
   - Difficulty: Easy

9. **Create Column**
   - Add custom columns to board
   - Use case: Board customization workflows
   - Difficulty: Medium

10. **Move Item to Group**
    - Programmatically move items between groups
    - Use case: Automated workflow stages
    - Difficulty: Easy

11. **List Items in Board**
    - Query/search items
    - Use case: Reporting, bulk operations
    - Difficulty: Easy

12. **Add File to Column**
    - Upload files to file column
    - Use case: Automated file management
    - Difficulty: Medium

### 🚀 **NICE TO HAVE** (Advanced features)

#### Actions (Add 4)
13. **Execute GraphQL Query**
    - Raw API access for custom operations
    - Use case: Advanced users, edge cases
    - Difficulty: Easy (pass-through)
    - High flexibility

14. **List Boards**
    - Get all boards in workspace
    - Use case: Discovery, reporting
    - Difficulty: Easy

15. **Add Subscribers to Board**
    - Manage board permissions
    - Use case: Team management automation
    - Difficulty: Easy

16. **Get User Details**
    - Retrieve user information
    - Use case: Personalization, reporting
    - Difficulty: Easy

---

## Implementation Roadmap

### Phase 1: Match Zapier Parity (8 nodes)
**Estimated Time:** 2-3 weeks

1. New Board trigger
2. Item Moved to Group trigger
3. New Subitem Created trigger
4. New Update in Board trigger
5. Create Subitem action
6. Delete/Archive Item action
7. Create Board action
8. Execute GraphQL Query action (quick win)

### Phase 2: Power User Features (5 nodes)
**Estimated Time:** 1-2 weeks

1. Create Group action
2. Create Column action
3. Move Item to Group action
4. List Items action
5. Add File to Column action

### Phase 3: Complete Coverage (7 nodes)
**Estimated Time:** 1-2 weeks

1. List Boards action
2. List Groups action
3. List Updates action
4. List Files action
5. Add Subscribers action
6. Get User Details action
7. Create/Get Tags action

---

## Technical Implementation Notes

### GraphQL API
Monday.com uses GraphQL API exclusively. All actions should:
- Use Monday GraphQL endpoint: `https://api.monday.com/v2`
- Include API token in Authorization header
- Handle rate limits (complexity-based)
- Return structured data matching our outputSchema pattern

### Webhooks
Monday supports webhooks for instant triggers:
- Column value changed
- Item created
- Item moved
- Update created
- Subitem created

**Setup Pattern:**
```typescript
// Register webhook in trigger lifecycle
async onActivate(context) {
  const webhookUrl = `https://chainreact.app/api/workflow/monday/${workflowId}`

  const mutation = `
    mutation {
      create_webhook(
        board_id: ${boardId},
        url: "${webhookUrl}",
        event: "create_item"
      ) {
        id
      }
    }
  `

  const webhookId = await mondayGraphQL(mutation)
  await storeTriggerResource(workflowId, webhookId)
}
```

### Output Schemas
All new actions should include complete outputSchema like existing nodes:
- name, label, type, description, example
- Use Monday.com's GraphQL field names
- Include relevant IDs for chaining

---

## Competitive Position

### Current State
- **Coverage:** ~15% of Make.com, ~30% of Zapier
- **Quality:** ✅ Complete output schemas
- **Usability:** ✅ Ready for Phase 2B preview blocks

### After Phase 1 (Zapier Parity)
- **Coverage:** ~100% of Zapier triggers, ~65% of Zapier actions
- **Position:** Competitive with Zapier for Monday.com workflows

### After All Phases
- **Coverage:** ~80% of Make.com (missing some niche features)
- **Position:** Feature parity with major automation platforms

---

## User Demand Signals

Based on Monday.com community and integration forums:

**High Demand:**
1. ⭐⭐⭐ Subitem automation (create, trigger on change)
2. ⭐⭐⭐ File management (upload, attach)
3. ⭐⭐ Board/group creation (templating use cases)
4. ⭐⭐ Move items between groups (status automation)

**Medium Demand:**
1. ⭐ List operations (reporting, bulk actions)
2. ⭐ Raw GraphQL (power users, edge cases)
3. ⭐ Tag management (organization)

---

## Recommendation Summary

### **PRIORITIZE PHASE 1** (Zapier Parity)

**Why:**
1. **Competitive necessity** - Users expect baseline triggers (new item, column changed, etc.)
2. **High ROI** - Subitem and board management are frequently requested
3. **Quick wins** - Several nodes are easy to implement (GraphQL query, delete item)
4. **Market positioning** - "Feature parity with Zapier" is a strong selling point

### **Timeline:**
- Phase 1: 2-3 weeks → Zapier-level coverage
- Phase 2: 1-2 weeks → Power user features
- Phase 3: 1-2 weeks → Complete coverage

**Total: 4-7 weeks to go from 15% to 80% coverage**

### **Immediate Next Steps:**
1. Create 8 node schemas for Phase 1
2. Implement webhooks for instant triggers
3. Build GraphQL query executor (easiest, highest flexibility)
4. Test with real Monday.com boards

This would position ChainReact as a **tier-1 Monday.com automation platform** alongside Zapier and Make.com.
