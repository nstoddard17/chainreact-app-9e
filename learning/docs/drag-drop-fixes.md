# Drag & Drop Fixes - October 30, 2025

## Issues Reported

1. ❌ **Replacing nodes instead of adding** - Drag-and-drop was placing nodes at same position
2. ❌ **Poor design for logic nodes** - Missing subtitles, improper formatting, no descriptions

## Fixes Applied

### 1. ✅ Fixed Position Handling

**File:** [WorkflowBuilderV2.tsx:401](components/workflows/builder/WorkflowBuilderV2.tsx#L401)

**Before:**
```typescript
await actions.addNode(nodeData.type, { x: 400, y: 300 })  // Always same position
```

**After:**
```typescript
const position = nodeData.position || { x: 400, y: 300 }  // Use drop position
await actions.addNode(nodeData.type, position)
```

**Result:** Nodes now drop exactly where you release them on the canvas!

---

### 2. ✅ Enhanced Node Display

**File:** [IntegrationsSidePanel.tsx:167-178](components/workflows/builder/IntegrationsSidePanel.tsx#L167-L178)

**Added:**
- Provider/category subtitle (e.g., "Google Sheets • Action")
- Proper capitalization (google-sheets → Google Sheets)
- Trigger/Action badge
- Fallback description ("No description available")

**Before:**
```
┌─────────────────┐
│ [Icon] If Then  │
│ ...description  │
└─────────────────┘
```

**After:**
```
┌──────────────────────┐
│ [Icon] If Then       │
│        Logic • Action│
│        Execute...    │
└──────────────────────┘
```

---

## How It Works Now

### Drag & Drop Flow

1. **Drag from catalog** - Node panel sets drag data:
   ```javascript
   {
     type: 'node',
     nodeData: {
       type: 'gmail_action_send_email',
       title: 'Send Email',
       ...
     }
   }
   ```

2. **Drop on canvas** - FlowV2BuilderContent captures drop:
   ```typescript
   const position = reactFlowInstance.current.screenToFlowPosition({
     x: event.clientX,
     y: event.clientY,
   })
   ```

3. **Add node** - WorkflowBuilderV2 uses exact position:
   ```typescript
   await actions.addNode(nodeData.type, position)
   ```

---

## Node Display Examples

### Integration Nodes (with logo)
```
┌───────────────────────────────────┐
│ [Gmail] Send Email                │
│         Gmail • Action             │
│         Send an email via Gmail   │
└───────────────────────────────────┘
```

### Logic Nodes (with icon)
```
┌───────────────────────────────────┐
│ [📋] If Then                      │
│       Logic • Action              │
│       Conditional branching...    │
└───────────────────────────────────┘
```

### Nodes without Description
```
┌───────────────────────────────────┐
│ [⚙️] Custom Node                  │
│       Utility • Action            │
│       No description available    │
└───────────────────────────────────┘
```

---

## Testing Checklist

- [ ] Drag Gmail node → Drops at cursor position
- [ ] Drag Slack node → Drops at cursor position
- [ ] Drag If Then logic node → Has "Logic • Action" subtitle
- [ ] Drag AI Generate node → Has "AI • Action" subtitle
- [ ] Multiple nodes can be dropped without replacing
- [ ] Node panel shows provider names capitalized
- [ ] All nodes show Trigger/Action badge

---

## Technical Details

### Provider Name Formatting
```typescript
node.providerId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
```

**Examples:**
- `google-sheets` → `Google Sheets`
- `microsoft-excel` → `Microsoft Excel`
- `monday` → `Monday`

### Position Calculation
Uses ReactFlow's `screenToFlowPosition` to convert screen coordinates (pixels from top-left) to flow coordinates (accounting for pan/zoom).

### Fallback Chain
1. Try `nodeData.position` (from drag-and-drop)
2. Fall back to `{ x: 400, y: 300 }` (click from panel)

---

## Files Modified

1. `/components/workflows/builder/WorkflowBuilderV2.tsx` - Fixed position handling
2. `/components/workflows/builder/IntegrationsSidePanel.tsx` - Enhanced node display
3. `/components/workflows/builder/FlowV2BuilderContent.tsx` - Drop handlers (from earlier)

---

## What to Test Now

1. **Open workflow builder**
2. **Open node catalog** (right panel or "Add Node" button)
3. **Drag any node** onto the canvas
4. **Drop at different positions** - should create new nodes, not replace
5. **Check logic nodes** - should have formatted subtitles
6. **Check integration nodes** - should show provider names properly

Expected: Clean, professional node catalog with proper drag-and-drop behavior!
