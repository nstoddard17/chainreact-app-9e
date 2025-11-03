# Connection Auto-Selection Implementation

## Overview
Implemented smart default connection selection in the AI agent guided setup flow. When a node requires a connection, the system automatically selects the appropriate connection based on priority rules.

## Selection Priority

The system follows this priority order when selecting a connection:

### 1. **User Manual Selection** (Highest Priority)
If the user has already manually selected a connection, that selection is always preserved.

### 2. **Default Connection** (Future Support)
When you add an `isDefault` flag to integration connections, the system will automatically use the default-marked connection.

**To enable this feature in the future:**
Add an `isDefault: boolean` field to the integration/connection model in your database.

Example integration object:
```typescript
{
  id: "abc123",
  provider: "gmail",
  isConnected: true,
  isDefault: true,  // ← Add this field
  name: "Work Gmail",
  ...
}
```

### 3. **Single Connection Auto-Select** (Current Implementation)
If there's exactly **one** connection available for a provider, it's automatically selected.

### 4. **No Default**
If none of the above conditions are met (multiple connections, no default), the dropdown shows "Select an option..." and the user must manually choose.

---

## Implementation Details

### File: `/components/workflows/builder/FlowV2AgentPanel.tsx`

#### Helper Function (Lines 99-124)
```typescript
const getDefaultConnection = (providerId: string, nodeId: string, providerConnections: any[]) => {
  // Priority 1: User has already selected a connection
  const userSelection = nodeConfigs[nodeId]?.connection
  if (userSelection) {
    return userSelection
  }

  // Priority 2: Check if there's a marked default connection (future support)
  const defaultConnection = providerConnections.find(conn => conn.isDefault)
  if (defaultConnection) {
    console.log('[FlowV2AgentPanel] Using default connection:', defaultConnection.id)
    return defaultConnection.id
  }

  // Priority 3: Auto-select if there's only one connection
  if (providerConnections.length === 1) {
    console.log('[FlowV2AgentPanel] Auto-selecting single connection:', providerConnections[0].id)
    return providerConnections[0].id
  }

  // No default - user must select
  return ''
}
```

#### Dropdown Integration (Lines 365-391)
```typescript
const defaultConnectionValue = getDefaultConnection(
  planNode.providerId || '',
  planNode.id,
  providerConnections
)

<select
  value={defaultConnectionValue}
  onChange={(e) => handleFieldChange(planNode.id, 'connection', e.target.value)}
>
  <option value="">Select an option...</option>
  {providerConnections.map(conn => (
    <option key={conn.id} value={conn.id}>
      {conn.name || `${getProviderDisplayName(planNode.providerId || '')} Account`}
    </option>
  ))}
</select>
```

---

## User Experience

### Scenario 1: User has ONE Gmail connection
1. User submits prompt: "When I get email from X, send to Slack"
2. AI builds workflow → enters guided setup
3. **Gmail connection is auto-selected** ✨
4. Helper text: "Using your Gmail connection"
5. Dropdown shows the connection pre-selected
6. User clicks **"Continue"** (no manual selection needed!)

### Scenario 2: User has MULTIPLE Gmail connections
1. Same workflow setup
2. Helper text: "Let's connect the service first — pick a saved connection or make a new one"
3. Dropdown shows: "Select an option..."
4. User manually selects the desired connection
5. User clicks "Continue"

### Scenario 3: User has DEFAULT Gmail connection (Future)
1. User marks one Gmail connection as "default" in integrations settings
2. Workflow setup shows that default connection pre-selected
3. Helper text: "Using your Gmail connection"
4. User can change selection if needed
5. User clicks "Continue"

---

## Benefits

✅ **Faster workflow creation** - No manual selection for single connections
✅ **Better UX** - Removes unnecessary click when there's only one option
✅ **Still visible** - User sees what connection is selected
✅ **Future-proof** - Ready for default connection feature
✅ **Non-intrusive** - User can still change the selection

---

## Future: Adding Default Connection Feature

### Step 1: Database Schema
Add `is_default` boolean column to integrations table:
```sql
ALTER TABLE integrations
ADD COLUMN is_default BOOLEAN DEFAULT FALSE;

-- Ensure only one default per provider per user
CREATE UNIQUE INDEX idx_integrations_default_per_provider_user
ON integrations (user_id, provider)
WHERE is_default = TRUE;
```

### Step 2: Integrations UI
Add a "Set as Default" button/toggle in the integrations management page:
- Only one connection per provider can be marked as default
- Setting a new default automatically unmarks the previous one

### Step 3: Integration Type
Update the TypeScript type to include the field:
```typescript
interface Integration {
  id: string
  provider: string
  isConnected: boolean
  isDefault?: boolean  // ← Add this
  name: string
  // ... other fields
}
```

### Step 4: API Updates
Update integration fetch/update APIs to include the `isDefault` field.

### Step 5: Testing
The connection auto-selection will automatically start using default connections once the data is available - **no code changes needed in FlowV2AgentPanel.tsx**!

---

## Debugging

If auto-selection isn't working:

1. **Check console logs:**
   - Look for `[FlowV2AgentPanel] Auto-selecting single connection: <id>`
   - Look for `[FlowV2AgentPanel] Using default connection: <id>`

2. **Verify integrations are loaded:**
   - Check `integrations` array in React DevTools
   - Ensure `isConnected: true` for the integration

3. **Check provider ID matching:**
   - Ensure node's `providerId` matches integration's `id` (case-insensitive)
   - Gmail trigger should have `providerId: "gmail"` matching integration `id: "gmail"`

4. **Verify connection field in schema:**
   - Ensure node's configSchema has a field with `name: 'connection'`

---

## Related Files

- `/components/workflows/builder/FlowV2AgentPanel.tsx` - Main implementation
- `/components/workflows/CustomNode.tsx` - Node display (hides CONNECTION field)
- `/hooks/use-integrations.ts` - Integrations data fetching

---

## Testing Checklist

- [ ] Single connection auto-selects
- [ ] Multiple connections show dropdown with no selection
- [ ] User can change auto-selected connection
- [ ] Helper text updates correctly
- [ ] Console logs show selection logic
- [ ] Works with all integration types (Gmail, Slack, Notion, etc.)
- [ ] Future: Default connection takes priority over single auto-select
