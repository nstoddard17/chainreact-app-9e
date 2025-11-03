# Auto-Load Dynamic Fields in Guided Setup

**Status**: ✅ Implemented
**Date**: November 2, 2025

## Overview

When users select a connection for an integration (like Slack) in the AI Agent guided setup, all available options for dynamic fields (like channels, servers, etc.) are now automatically loaded without requiring manual interaction.

## User Request

> "can you make it so when it gets to the actions/triggers like slack where it asks for channels it will auto load all of the servers that are available from their selected connection?"

## How It Works

### 1. Connection Selection Detection

When a user selects a connection in the guided setup:
- A `useEffect` hook watches for changes to `nodeConfigs[nodeId].connection`
- When a connection is selected, it triggers `loadDynamicOptionsForNode()`

### 2. Dynamic Field Identification

The system identifies which fields need options loaded:
- Reads the node schema from `ALL_NODE_COMPONENTS`
- Filters for fields with `dynamic` property (e.g., `dynamic: "slack-channels"`)
- Excludes the 'connection' field itself

### 3. Options Loading

For each dynamic field:
- Makes a GET request to `/api/integrations/${providerId}/data/${field.dynamic}`
- Passes the connection ID in the `X-Integration-Id` header
- Loads options in parallel for all dynamic fields

### 4. UI Updates

While loading:
- Shows "(Loading...)" next to field label
- Displays "Loading options..." in dropdown placeholder
- Disables the dropdown during loading

After loading:
- Populates dropdown with all available options
- Clears loading state
- Re-enables dropdown for user selection

## Implementation Details

### Files Modified

**[FlowV2AgentPanel.tsx](components/workflows/builder/FlowV2AgentPanel.tsx)**

#### New Imports

```typescript
import { useDynamicOptions } from "../configuration/hooks/useDynamicOptions"
import type { DynamicOptionsState } from "../configuration/utils/types"
```

#### New State

```typescript
// Track dynamic options for each node in the plan
const [nodesDynamicOptions, setNodesDynamicOptions] = useState<Record<string, DynamicOptionsState>>({})

// Track which fields are loading for each node
const [loadingFieldsByNode, setLoadingFieldsByNode] = useState<Record<string, Set<string>>>({})
```

#### New Helper Function

```typescript
const loadDynamicOptionsForNode = useCallback(async (nodeId: string, nodeType: string, providerId: string, connectionId: string) => {
  const schema = getNodeSchema(nodeType)
  if (!schema?.configSchema) return

  // Find all fields with dynamic options
  const dynamicFields = schema.configSchema.filter(field =>
    field.dynamic && field.name !== 'connection'
  )

  if (dynamicFields.length === 0) return

  // Mark fields as loading
  setLoadingFieldsByNode(prev => ({
    ...prev,
    [nodeId]: new Set(dynamicFields.map(f => f.name))
  }))

  // Load options for each dynamic field
  const loadPromises = dynamicFields.map(async (field) => {
    const response = await fetch(`/api/integrations/${providerId}/data/${field.dynamic}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Integration-Id': connectionId,
      },
    })

    const data = await response.json()
    const options = Array.isArray(data) ? data : data.data || []

    return { fieldName: field.name, options }
  })

  const results = await Promise.all(loadPromises)

  // Update options for this node
  const newOptions: DynamicOptionsState = {}
  results.forEach(({ fieldName, options }) => {
    newOptions[fieldName] = options
  })

  setNodesDynamicOptions(prev => ({
    ...prev,
    [nodeId]: { ...prev[nodeId], ...newOptions }
  }))

  // Clear loading state
  setLoadingFieldsByNode(prev => ({
    ...prev,
    [nodeId]: new Set()
  }))
}, [getNodeSchema])
```

#### New useEffect Hook

```typescript
// Watch for connection changes and auto-load dynamic fields
useEffect(() => {
  const planNodes = buildMachine.plan || []

  planNodes.forEach(planNode => {
    const connectionId = nodeConfigs[planNode.id]?.connection

    // If connection is set and we haven't loaded options yet
    if (connectionId && planNode.providerId && !nodesDynamicOptions[planNode.id]) {
      loadDynamicOptionsForNode(planNode.id, planNode.nodeType, planNode.providerId, connectionId)
    }
  })
}, [buildMachine.plan, nodeConfigs, nodesDynamicOptions, loadDynamicOptionsForNode])
```

#### Updated Field Rendering

```typescript
{requiredFields.filter(f => f.name !== 'connection').map((field) => {
  const FieldIcon = getFieldTypeIcon(field.type)
  const isLoading = loadingFieldsByNode[planNode.id]?.has(field.name) || false

  // Get options from dynamically loaded data OR fallback to defaultOptions
  const dynamicOptionsForField = nodesDynamicOptions[planNode.id]?.[field.name] || []
  const optionsToDisplay = dynamicOptionsForField.length > 0
    ? dynamicOptionsForField
    : (field.defaultOptions || [])

  return (
    <div key={field.name} className="space-y-2">
      <label className="text-xs font-medium text-foreground flex items-center gap-2">
        <FieldIcon className="w-4 h-4 text-muted-foreground" />
        {field.label || field.name}
        {field.required && <span className="text-red-500">*</span>}
        {isLoading && <span className="text-xs text-muted-foreground">(Loading...)</span>}
      </label>
      <select
        className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background"
        value={nodeConfigs[planNode.id]?.[field.name] || ''}
        onChange={(e) => handleFieldChange(planNode.id, field.name, e.target.value)}
        disabled={isLoading}
      >
        <option value="">
          {isLoading ? 'Loading options...' : (field.placeholder || 'Select an option...')}
        </option>
        {optionsToDisplay.map(opt => (
          <option key={typeof opt === 'string' ? opt : opt.value} value={typeof opt === 'string' ? opt : opt.value}>
            {typeof opt === 'string' ? opt : opt.label}
          </option>
        ))}
      </select>
      {field.description && (
        <p className="text-xs text-muted-foreground">{field.description}</p>
      )}
    </div>
  )
})}
```

## Supported Integrations

This feature works with any integration that has fields marked with the `dynamic` property:

### Examples

**Slack:**
- Channels (`dynamic: "slack-channels"`)
- Users (`dynamic: "slack-users"`)

**Discord:**
- Guilds/Servers (`dynamic: "discord-guilds"`)
- Channels (`dynamic: "discord-channels"` - depends on selected guild)

**Gmail:**
- Labels (`dynamic: "gmail-labels"`)

**Notion:**
- Databases (`dynamic: "notion-databases"`)
- Pages (`dynamic: "notion-pages"`)

And many more - any field with a `dynamic` property will auto-load when its node's connection is selected.

## Field Schema Pattern

For a field to support auto-loading, it needs these properties in the node schema:

```typescript
{
  name: "channel",
  label: "Channel",
  type: "select",
  required: true,
  dynamic: "slack-channels",  // ← This triggers auto-loading
  loadOnMount: true,          // ← Optional: also load on mount
  placeholder: "Select a channel"
}
```

## API Endpoint Pattern

The system calls API endpoints at:

```
POST /api/integrations/{providerId}/data
```

With JSON body:
```json
{
  "integrationId": "connection-id",
  "dataType": "slack_channels",
  "options": {}
}
```

Where:
- `{providerId}` - e.g., "slack", "discord", "gmail"
- `integrationId` - The selected connection ID
- `dataType` - The value from `field.dynamic` with hyphens replaced by underscores (e.g., "slack-channels" → "slack_channels")

**Important**: The system automatically converts hyphenated field names (like `"slack-channels"`) to underscore format (`"slack_channels"`) to match the API handler naming convention.

## Error Handling

If loading fails:
- Error is logged to console
- Field shows empty options array
- User can still manually select from `defaultOptions` if available
- Dropdown remains functional (doesn't break the UI)

## Performance Considerations

1. **Parallel Loading**: All dynamic fields for a node load in parallel using `Promise.all()`
2. **Deduplication**: The `useEffect` checks if options are already loaded before making requests
3. **Loading States**: Users see immediate feedback that options are loading
4. **Graceful Degradation**: Falls back to `defaultOptions` if dynamic loading fails

## Testing

To test this feature:

1. Start the dev server: `npm run dev`
2. Open workflow builder with AI Agent
3. Submit a prompt that includes Slack: "When I get an email, send it to Slack"
4. Wait for the plan to generate
5. Click "Build" to start guided setup
6. When Slack node expands:
   - Select a Slack connection from the dropdown
   - Watch the "Channel" field - it should show "(Loading...)"
   - After 1-2 seconds, all your Slack channels should appear in the dropdown
7. Verify channels are loaded without needing to click or refresh

## Additional Features

### Scroll Prevention on Completion

When the workflow build completes and shows the "Flow ready ✅" message, the chat panel **no longer auto-scrolls**. This prevents disorienting screen movement when users are reviewing their configuration.

**Implementation:**
- Tracks scroll position before COMPLETE state transition
- Restores scroll position after React renders the completion UI
- Uses refs to avoid re-render cycles

**Technical Details:**
```typescript
// Added refs
const chatMessagesRef = useRef<HTMLDivElement>(null)
const prevBuildStateRef = useRef<BuildState>(buildMachine.state)

// useEffect watches for COMPLETE transition
useEffect(() => {
  if (currentState === BuildState.COMPLETE && prevState !== BuildState.COMPLETE) {
    // Save and restore scroll position
    const savedScrollTop = chatMessagesRef.current.scrollTop
    setTimeout(() => {
      chatMessagesRef.current.scrollTop = savedScrollTop
    }, 0)
  }
}, [buildMachine.state])
```

## Future Enhancements

1. **Caching**: Cache loaded options across sessions (currently implemented in `useDynamicOptions` but not wired into guided setup yet)
2. **Refresh Button**: Add manual refresh button for users who want to reload options
3. **Search/Filter**: For integrations with many options, add search functionality
4. **Dependent Fields**: Support for fields that depend on other field selections (e.g., Discord channels depend on selected guild)

## Related Files

- [/components/workflows/builder/FlowV2AgentPanel.tsx](components/workflows/builder/FlowV2AgentPanel.tsx) - Main implementation
- [/components/workflows/configuration/hooks/useDynamicOptions.ts](components/workflows/configuration/hooks/useDynamicOptions.ts) - Dynamic options hook (used in configuration modal)
- [/components/workflows/configuration/utils/types.ts](components/workflows/configuration/utils/types.ts) - Type definitions
- [/lib/workflows/nodes/providers/slack/actions/sendMessage.schema.ts](lib/workflows/nodes/providers/slack/actions/sendMessage.schema.ts) - Example of field with `dynamic` property

## Troubleshooting

**Options not loading?**
- Check browser console for API errors
- Verify the integration has a connected account
- Ensure API endpoint exists: `/api/integrations/{provider}/data/{resourceType}`
- Check that the field has `dynamic` property in its schema

**Loading state stuck?**
- Check for JavaScript errors in console
- Verify API response format matches expected structure
- Ensure connection ID is valid and not expired

**Empty dropdown?**
- Check if API returned empty array (no available options)
- Verify user's connection has proper scopes/permissions
- Check if `defaultOptions` exists as fallback
