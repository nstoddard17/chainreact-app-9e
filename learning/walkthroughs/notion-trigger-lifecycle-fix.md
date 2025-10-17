# Notion Trigger Lifecycle Fix - Type Error

## Issue

**Error**: `Cannot read properties of undefined (reading 'type')`

**When**: Activating a Notion trigger in a workflow

**Root Cause**: Mismatch between expected and actual `TriggerActivationContext` structure

## Investigation

### What We Expected

The initial `NotionTriggerLifecycle` implementation assumed the context would have a `trigger` object:

```typescript
async onActivate(context: TriggerActivationContext): Promise<void> {
  const { workflowId, userId, trigger } = context

  logger.info('📝 [Notion Trigger] Activating trigger', {
    workflowId,
    triggerType: trigger.type,  // ❌ trigger.type doesn't exist
    triggerConfig: trigger.config // ❌ trigger.config doesn't exist
  })

  // More code expecting trigger.type, trigger.id, trigger.config
}
```

### Actual Structure

Looking at `lib/triggers/types.ts`, the actual interface is:

```typescript
export interface TriggerActivationContext {
  workflowId: string
  userId: string
  nodeId: string        // ✅ Direct property, not nested
  triggerType: string   // ✅ Direct property, not trigger.type
  providerId: string
  config: TriggerConfig // ✅ Direct property, not trigger.config
  webhookUrl?: string
}
```

**Key Difference**: The context provides `triggerType`, `nodeId`, and `config` **directly** as top-level properties, not nested under a `trigger` object.

## Fix Applied

### Changed Lines

**Before**:
```typescript
const { workflowId, userId, trigger } = context

// Access properties via trigger object
const workspaceId = trigger.config?.workspace
const triggerTypeValue = trigger.type
const triggerId = trigger.id
```

**After**:
```typescript
const { workflowId, userId, nodeId, triggerType, config } = context

// Access properties directly
const workspaceId = config?.workspace
const triggerTypeValue = triggerType
const triggerId = nodeId
```

### All Changes

1. **Destructuring** (line 21)
   - Removed: `trigger`
   - Added: `nodeId`, `triggerType`, `config`

2. **Configuration access** (line 40)
   - Changed: `trigger.config?.workspace` → `config?.workspace`

3. **Database ID access** (line 57)
   - Changed: `trigger.config?.database` → `config?.database`
   - Changed: `trigger.config?.dataSource` → `config?.dataSource`

4. **Trigger resource insertion** (lines 98-106)
   - Changed: `resource_type: trigger.type` → `resource_type: triggerType`
   - Changed: `external_id: 'notion-${workflowId}-${trigger.id}'` → `external_id: 'notion-${workflowId}-${nodeId}'`
   - Changed: `triggerType: trigger.type` → `triggerType`
   - Changed: `triggerId: trigger.id` → `nodeId`

5. **Logging cleanup**
   - Removed all object logging to follow security best practices
   - Removed sensitive data (workflowId, trigger details) from logs

6. **Health check return type** (lines 160-207)
   - Fixed return structure to match `TriggerHealthStatus` interface
   - Changed: `message: string` → `details: string`
   - Added: `lastChecked: string` (required field)
   - Removed: `requiresReconnection` (not in interface)

## Lesson Learned

**Always check the actual interface definition before implementing**

This is a classic case of "assumption vs reality":
- ❌ Assumed: Nested `trigger` object like other parts of the codebase
- ✅ Reality: Flattened structure with direct properties

**Prevention**:
1. Read the interface definition in `types.ts` FIRST
2. Check how other providers implement the same interface
3. Look for existing implementations as reference

**Example of checking existing implementation**:

```bash
# Find other trigger lifecycle implementations
grep -r "implements TriggerLifecycle" lib/triggers/providers/

# Read an existing implementation for reference
cat lib/triggers/providers/MicrosoftGraphTriggerLifecycle.ts
```

## Testing Checklist

After this fix:

- [x] TypeScript compiles without errors
- [x] Trigger activation doesn't throw "Cannot read properties of undefined"
- [ ] Trigger resource is created in `trigger_resources` table
- [ ] Data source ID is auto-detected and stored
- [ ] Health check returns correct structure
- [ ] Deactivation removes trigger resources

## Related Files

- `lib/triggers/types.ts` - Interface definitions
- `lib/triggers/providers/NotionTriggerLifecycle.ts` - Fixed implementation
- `lib/triggers/TriggerLifecycleManager.ts` - Manager that calls these methods
- `app/api/workflows/[id]/route.ts` - Where activation is triggered

## Additional Context

This fix also addressed several logging security issues:
- Removed sensitive data (IDs, error objects) from logs
- Simplified log messages to be generic
- Followed `/learning/docs/logging-best-practices.md` guidelines

## Follow-up Tasks

1. Test complete workflow activation flow
2. Verify trigger resources are created correctly
3. Test webhook processing when events come in
4. Verify data source filtering works as expected
