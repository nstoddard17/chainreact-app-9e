# Phase 2 Next Step Recommendation

**Date:** October 30, 2025
**Completed:** Phase 2B - Node Data & Presentation ✅
**Recommendation:** **Phase 2D - Configuration Modal** 🎯

## Why Phase 2D Next (Instead of 2A)?

### ✅ **Direct Benefit from Phase 2B Work**
Phase 2D (Configuration Modal) **immediately uses** all the data layer work we just completed:

- **Output Tab** → Uses `previewFields` metadata and `generateNodePreview()` utility
- **Setup Tab** → Displays fields from `configSchema` with descriptions
- **Results Tab** → Shows test data matched against `outputSchema` fields
- **All Tabs** → Benefit from complete node descriptions

Phase 2A (Canvas Placement & Animations) is pure visual polish and doesn't leverage the data work.

### ✅ **More Immediately Testable**
- Configuration Modal is a **concrete UI component** we can build and test
- Canvas animations are harder to verify without the full workflow being functional
- Modal provides immediate user value (configure nodes, see available fields)

### ✅ **Critical Path for User Experience**
The modal is where users spend most of their time:
1. User adds a node → Opens modal
2. Configures fields → **Setup Tab**
3. Sees what data it produces → **Output Tab** (Phase 2B work!)
4. Adjusts advanced settings → **Advanced Tab**
5. Tests and sees results → **Results Tab**

Without a good modal experience, the workflow builder is incomplete.

### ✅ **Builds Momentum**
- Visible progress (users can see the new modal)
- Enables full testing of Phase 2B work
- Sets up Phase 2E (Data & Plumbing) which wires modal to state

---

## Phase 2D: Configuration Modal - Scope

### Goal
Replace the current inline/small configuration UI with a **large, Kadabra-style modal** with 4 tabs.

### Design Reference (From Requirements)
```
┌─────────────────────────────────────────────────┐
│  Configure: Gmail - Send Email           [×]   │
├─────────────────────────────────────────────────┤
│  [Setup] [Output] [Advanced] [Results]         │
├─────────────────────────────────────────────────┤
│                                                 │
│  SETUP TAB:                                     │
│  ┌───────────────────────────────────────────┐ │
│  │ To                                        │ │
│  │ [user@example.com_____________]           │ │
│  │                                           │ │
│  │ Subject                                   │ │
│  │ [Meeting Reminder_____________]           │ │
│  │                                           │ │
│  │ Body                                      │ │
│  │ [______________________________]          │ │
│  │ [______________________________]          │ │
│  │                                           │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│                    [Cancel] [Save]              │
└─────────────────────────────────────────────────┘
```

### Tab Breakdown

#### 1. **Setup Tab** (Primary Configuration)
**Content:**
- All `configSchema` fields from the node definition
- Grouped by category/section (like Slack sections)
- Field validation with inline error messages
- AI field toggle (robot icon) for `supportsAI: true` fields
- Variable picker for merge fields (`{{nodeId.field}}`)

**Example:**
```
To: [user@example.com                    ] [🤖]
    ↑ Text input                            ↑ AI toggle

Subject: [{{trigger.subject}}             ] [📎]
         ↑ Merge field syntax               ↑ Variable picker
```

**Features:**
- Real-time validation
- Field dependencies (parent/child selects)
- Tooltips for field descriptions
- Copy merge field syntax to clipboard

#### 2. **Output Tab** (Shows Available Merge Fields)
**Content:**
- Display all fields from `outputSchema` **(This is where Phase 2B work shines!)**
- Each field shows:
  - Label & description
  - Data type
  - Merge field syntax with copy button
  - Example value

**Example:**
```
Available Merge Fields:

Order ID
├─ Type: string
├─ Merge field: {{create-order.order_id}} [Copy]
└─ Example: gid://shopify/Order/1234567890

Order Number
├─ Type: number
├─ Merge field: {{create-order.order_number}} [Copy]
└─ Example: 1001

Total Price
├─ Type: number
├─ Merge field: {{create-order.total_price}} [Copy]
└─ Example: 129.99
```

**Implementation:**
```typescript
import { generateNodePreview } from '@/src/lib/workflows/builder/preview-generator'

// In Output tab component:
const component = ALL_NODE_COMPONENTS.find(c => c.type === node.type)
if (component?.outputSchema) {
  return (
    <div className="output-fields">
      {component.outputSchema.map(field => (
        <OutputFieldCard
          key={field.name}
          label={field.label}
          description={field.description}
          type={field.type}
          mergeField={`{{${node.id}.${field.name}}}`}
          example={field.example}
        />
      ))}
    </div>
  )
}
```

#### 3. **Advanced Tab** (Power User Settings)
**Content:**
- Timeout settings (`policy.timeoutMs`)
- Retry configuration (`policy.retries`, `policy.retryDelayMs`)
- Error handling strategy
- Custom metadata/notes
- Debug mode toggle

**Example:**
```
Execution Settings:
Timeout: [60________] seconds
Retries: [3_________] attempts
Retry Delay: [1000_____] ms

Error Handling:
○ Stop workflow on error
● Continue workflow and log error
○ Trigger fallback action

Notes (Optional):
[This step creates the order in Shopify...]
```

#### 4. **Results Tab** (Test Execution Data)
**Content:**
- Shows actual execution results from testing
- Matches test data against `outputSchema` fields
- Color-coded success/error states
- Raw response viewer

**Example:**
```
Last Test: Jan 15, 2024 10:30 AM ✅ Success

Output Data:
✓ order_id: gid://shopify/Order/1234567890
✓ order_number: 1001
✓ total_price: 129.99
✓ admin_url: https://mystore.myshopify.com/admin/orders/...
✓ created_at: 2024-01-15T10:30:00Z

Execution Time: 1.2s

[View Raw Response]
```

---

## Implementation Plan

### Step 1: Modal Shell & Navigation
Create base modal component with tab navigation:
- File: `/components/workflows/configuration/ConfigurationModal.tsx`
- 4 tabs with active state management
- Close/Save/Cancel actions
- Keyboard shortcuts (Esc to close, Cmd+S to save)

### Step 2: Setup Tab (Core Configuration)
- Reuse existing field components from current config system
- Add grouping/sections for complex nodes (like Slack)
- Wire to node state management

### Step 3: Output Tab (Phase 2B Integration)
- Use `preview-generator.ts` utilities
- Display `outputSchema` fields
- Copy-to-clipboard for merge fields
- Field search/filter for nodes with many outputs

### Step 4: Advanced Tab
- Simple form with timeout, retries, error handling
- Default values from node definition

### Step 5: Results Tab
- Integration with test execution store
- Display test data matched to schema
- Error message display

### Step 6: Integration with Workflow Builder
- Replace current config modals with new modal
- State persistence
- Validation before save

---

## Technical Architecture

### Components Structure
```
/components/workflows/configuration/
├── ConfigurationModal.tsx          # Main modal shell
├── tabs/
│   ├── SetupTab.tsx               # Field configuration
│   ├── OutputTab.tsx              # Output schema display (uses Phase 2B)
│   ├── AdvancedTab.tsx            # Power settings
│   └── ResultsTab.tsx             # Test execution data
├── fields/
│   ├── OutputFieldCard.tsx        # Display output field with merge syntax
│   ├── VariablePicker.tsx         # Merge field selector
│   └── FieldGroup.tsx             # Grouped fields (like Slack)
└── hooks/
    ├── useConfigurationState.ts   # Modal state management
    └── useOutputSchema.ts         # Hook to get outputSchema for node
```

### State Management
```typescript
interface ConfigurationModalState {
  isOpen: boolean
  nodeId: string
  activeTab: 'setup' | 'output' | 'advanced' | 'results'
  config: Record<string, any>
  isDirty: boolean
  validationErrors: Record<string, string>
}
```

---

## Why NOT Phase 2A (Canvas Placement) First?

Phase 2A is about **animations and camera choreography**:
- Animated node placement on canvas
- Camera zoom/pan choreography
- Branch-aware layout

**Challenges:**
1. **Pure visual polish** - doesn't provide functional value yet
2. **Harder to test** - subjective "does it look smooth?"
3. **Doesn't leverage Phase 2B work** - uses `lane`/`branchIndex` metadata, but that's minor
4. **Blocks real testing** - can't fully test workflows until config modal is functional

**Phase 2A should come AFTER 2D** when we have:
- Functional modal ✅
- Nodes fully configurable ✅
- Test results visible ✅
- Then polish the visual experience with animations

---

## Success Metrics (Phase 2D Complete)

- [ ] Modal opens when double-clicking a node
- [ ] Setup tab shows all `configSchema` fields
- [ ] Output tab displays all `outputSchema` fields with merge field syntax
- [ ] Advanced tab allows timeout/retry configuration
- [ ] Results tab shows test execution data
- [ ] Modal saves configuration to node state
- [ ] Modal closes with Esc, saves with Cmd+S
- [ ] Validation prevents saving incomplete configuration

---

## Estimated Effort

- **Modal Shell & Navigation:** 2-3 hours
- **Setup Tab:** 4-6 hours (reuse existing field components)
- **Output Tab:** 2-3 hours (straightforward, uses preview-generator)
- **Advanced Tab:** 2-3 hours
- **Results Tab:** 3-4 hours (integration with test store)
- **Integration & Testing:** 3-4 hours

**Total:** 16-23 hours (~2-3 days)

---

## Recommendation: Start with Phase 2D ✅

Phase 2D provides immediate user value, enables full testing of Phase 2B work, and sets up the data plumbing needed for Phase 2E. Canvas animations (2A) can polish the experience once the functional foundation is solid.

**Next Action:** Begin implementation of ConfigurationModal.tsx shell with tab navigation.
