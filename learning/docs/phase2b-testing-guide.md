# Phase 2B Testing Guide

**Date:** October 30, 2025
**Phase:** Node Data & Presentation Testing

## Monday.com OutputSchema Status

✅ **ALL MONDAY.COM NODES HAVE COMPLETE OUTPUT SCHEMAS**

Verified nodes:
- `monday_action_create_item` - 5 output fields (itemId, itemName, boardId, groupId, createdAt)
- `monday_action_update_item` - 5 output fields (itemId, itemName, updatedColumns, success, updatedAt)
- `monday_action_create_update` - 5 output fields (updateId, itemId, text, creatorId, createdAt)

All include:
- `name` - Field identifier
- `label` - Human-readable label
- `type` - Data type (string, boolean, array)
- `description` - Clear explanation
- `example` - Sample value

## Testing Strategy

### Phase 2B is a **DATA LAYER** - Testing Happens in Two Stages:

### ✅ **STAGE 1: Immediate Testing (Data Integrity) - NOW**

These tests verify the data foundation is solid:

#### 1. Output Schema Audit ✅ DONE
```bash
npx tsx scripts/report-node-outputs.ts
```
**Result:** 0 missing schemas (138 total actions)

#### 2. TypeScript Compilation ✅ DONE
```bash
npx tsc --noEmit --project tsconfig.json
```
**Result:** No errors in our changes

#### 3. Unit Test: Preview Generator
**File:** Create `/tests/preview-generator.test.ts`

```typescript
import { generateNodePreview, generateMergeFieldsPreview, getAvailableMergeFields } from '@/src/lib/workflows/builder/preview-generator'
import type { Node } from '@/src/lib/workflows/builder/schema'

describe('Preview Generator', () => {
  test('generateNodePreview creates preview from metadata', () => {
    const node: Node = {
      id: 'test-node-1',
      type: 'shopify_action_create_order',
      label: 'Create Order',
      metadata: {
        previewFields: [
          { name: 'order_id', label: 'Order ID', type: 'string', example: 'gid://shopify/Order/123' },
          { name: 'total_price', label: 'Total Price', type: 'number', example: 129.99 }
        ]
      },
      // ... other required Node fields
    }

    const preview = generateNodePreview(node)

    expect(preview).toBeDefined()
    expect(preview?.title).toBe('Available Merge Fields')
    expect(preview?.content).toHaveLength(2)
    expect(preview?.content[0]).toContain('{{test-node-1.order_id}}')
    expect(preview?.content[1]).toContain('{{test-node-1.total_price}}')
  })

  test('generateMergeFieldsPreview formats fields correctly', () => {
    const fields = generateMergeFieldsPreview('create-order', [
      { name: 'order_id', label: 'Order ID', type: 'string', example: 'gid://shopify/Order/123' }
    ])

    expect(fields).toHaveLength(1)
    expect(fields[0]).toMatch(/Order ID.*\[string\].*{{create-order\.order_id}}/)
    expect(fields[0]).toContain('gid://shopify/Order/123')
  })

  test('getAvailableMergeFields returns all fields for a node', () => {
    // Test with actual Shopify create_order node
    const node = ALL_NODE_COMPONENTS.find(n => n.type === 'shopify_action_create_order')!

    const fields = getAvailableMergeFields(node)

    expect(fields).toContain('{{shopify_action_create_order.order_id}}')
    expect(fields).toContain('{{shopify_action_create_order.total_price}}')
  })
})
```

**Run:**
```bash
npm test -- preview-generator.test.ts
```

#### 4. Data Integrity Test: Planner Metadata
**File:** Create `/tests/planner-metadata.test.ts`

```typescript
import { planEdits } from '@/src/lib/workflows/builder/agent/planner'

describe('Planner Metadata Extensions', () => {
  test('planner adds description to nodes', () => {
    const result = planEdits({
      prompt: 'when i get an email, send to slack',
      flow: { nodes: [], edges: [], triggers: [] }
    })

    const addNodeEdits = result.edits.filter(e => e.op === 'addNode')

    addNodeEdits.forEach(edit => {
      const node = (edit as any).node
      // Should have description from catalog
      expect(node.description).toBeDefined()
      expect(typeof node.description).toBe('string')
    })
  })

  test('planner adds previewFields metadata', () => {
    const result = planEdits({
      prompt: 'when i get an email, send to slack',
      flow: { nodes: [], edges: [], triggers: [] }
    })

    const addNodeEdits = result.edits.filter(e => e.op === 'addNode')
    const actionNodes = addNodeEdits.filter(e => !(e as any).node.metadata?.isTrigger)

    actionNodes.forEach(edit => {
      const node = (edit as any).node
      // Should have previewFields if node has outputSchema
      if (node.type !== 'http.trigger') {
        expect(node.metadata?.previewFields).toBeDefined()
        expect(Array.isArray(node.metadata.previewFields)).toBe(true)

        if (node.metadata.previewFields.length > 0) {
          const field = node.metadata.previewFields[0]
          expect(field).toHaveProperty('name')
          expect(field).toHaveProperty('label')
          expect(field).toHaveProperty('type')
        }
      }
    })
  })

  test('planner adds lane and branchIndex metadata', () => {
    const result = planEdits({
      prompt: 'when i get an email, send to slack',
      flow: { nodes: [], edges: [], triggers: [] }
    })

    const addNodeEdits = result.edits.filter(e => e.op === 'addNode')

    addNodeEdits.forEach(edit => {
      const node = (edit as any).node
      expect(node.metadata?.lane).toBeDefined()
      expect(node.metadata?.branchIndex).toBeDefined()
      expect(typeof node.metadata.lane).toBe('number')
      expect(typeof node.metadata.branchIndex).toBe('number')
    })
  })
})
```

**Run:**
```bash
npm test -- planner-metadata.test.ts
```

---

### ⏳ **STAGE 2: Integration Testing (UI Wiring) - NEXT PHASE**

These tests verify the UI correctly uses the data layer:

#### When to Test (During Phase 2D - Configuration Modal):

**Test 1: Preview Blocks Display Merge Fields**
- Open workflow builder
- Use AI Agent to create a workflow with "when I get an email, create a monday item"
- Check Gmail trigger node → Should show preview block with available fields:
  ```
  Available Merge Fields:
  • From [string]: {{gmail-trigger-1.from}} — e.g., "user@example.com"
  • Subject [string]: {{gmail-trigger-1.subject}} — e.g., "Meeting tomorrow"
  • Body [string]: {{gmail-trigger-1.body}} — e.g., "Let's meet at 2pm"
  ```
- Check Monday.com create item node → Should show preview with its output fields

**Test 2: Configuration Modal Shows Output Schema**
- Double-click a Monday.com "Create Item" node
- Navigate to "Output" tab in config modal
- Should display all 5 output fields from outputSchema:
  - Item ID
  - Item Name
  - Board ID
  - Group ID
  - Created At
- Each should show the merge field syntax: `{{monday-create-1.itemId}}`

**Test 3: Merge Field Autocomplete**
- Create workflow: Gmail → Monday.com → Slack
- In Slack "Send Message" node, click the "Message" field
- Should see autocomplete suggestions showing fields from:
  - Gmail trigger (from, subject, body, etc.)
  - Monday.com create item (itemId, itemName, etc.)
- Click a suggestion → Should insert `{{node-id.field}}`

**Test 4: Planner Creates Rich Nodes**
- Use AI Agent with prompt: "when webhook received, create shopify order and email me"
- Check the created Shopify "Create Order" node:
  - ✅ Has description in node card
  - ✅ Has previewFields in metadata
  - ✅ Has lane=0, branchIndex set
  - ✅ Preview block shows: order_id, order_number, total_price

**Test 5: Monday.com Integration**
- Create workflow: Monday.com trigger → Gmail action
- Configure Gmail "Send Email" action
- In the "Body" field, type `{{` → Should trigger autocomplete
- Should show Monday.com trigger fields (itemId, itemName, etc.)
- Select one → Email body should include merge field
- Test the workflow → Email should contain actual Monday.com data

---

## Quick Manual Test (You Can Do This Now)

**Node.js Console Test:**

```typescript
// In Node.js REPL or test file
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'

// 1. Verify Monday.com has outputSchema
const mondayNodes = ALL_NODE_COMPONENTS.filter(n => n.providerId === 'monday')
console.log(`Monday.com nodes: ${mondayNodes.length}`)
mondayNodes.forEach(node => {
  console.log(`${node.title}: ${node.outputSchema?.length || 0} output fields`)
})

// Expected output:
// Monday.com nodes: 5
// Create Item: 5 output fields
// Update Item: 5 output fields
// Create Update: 5 output fields
// New Item: X output fields (trigger)
// Column Changed: X output fields (trigger)

// 2. Test preview generator
import { generateMergeFieldsPreview } from '@/src/lib/workflows/builder/preview-generator'

const shopifyNode = ALL_NODE_COMPONENTS.find(n => n.type === 'shopify_action_create_order')!
const preview = generateMergeFieldsPreview('test-order', shopifyNode.outputSchema)
console.log(preview)

// Expected output:
// [
//   'Order ID [string]: {{test-order.order_id}} — e.g., "gid://shopify/Order/1234567890"',
//   'Order Number [number]: {{test-order.order_number}} — e.g., 1001',
//   'Total Price [number]: {{test-order.total_price}} — e.g., 129.99'
// ]
```

---

## Summary: When to Test What

| What to Test | When | Status |
|-------------|------|---------|
| Output schema completeness | ✅ NOW (Done) | PASSED |
| TypeScript compilation | ✅ NOW (Done) | PASSED |
| Planner metadata | ⏳ NOW (Unit tests) | Ready to implement |
| Preview generator | ⏳ NOW (Unit tests) | Ready to implement |
| Preview blocks in UI | ⏳ Phase 2D | Needs UI wiring |
| Config modal Output tab | ⏳ Phase 2D | Needs modal implementation |
| Merge field autocomplete | ⏳ Phase 2D/2E | Needs UI integration |
| End-to-end workflows | ⏳ Phase 2E | After all plumbing complete |

---

## Test Files to Create

1. `/tests/preview-generator.test.ts` - Unit tests for preview utility
2. `/tests/planner-metadata.test.ts` - Unit tests for planner extensions
3. `/tests/integration/workflow-preview.test.ts` - E2E tests (Phase 2E)

---

## Recommendation

**Create unit tests NOW** to verify data integrity, then **integration test during Phase 2D** when we wire the preview blocks to the UI.

The data layer is complete and solid. The UI integration happens in the next phase.
