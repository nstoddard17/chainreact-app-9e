# Notion Trigger Schema Alignment Fix

## Issue

**Error**: `Could not find the 'metadata' column of 'trigger_resources' in the schema cache`

**Secondary Error**: Column name mismatches causing insert failures

## Root Cause

The `NotionTriggerLifecycle` implementation had **two separate issues**:

### Issue 1: Column Names Didn't Match Schema

The code was using incorrect column names that don't exist in the database schema.

**Wrong Column Names Used**:
- `provider` ❌ (actual: `provider_id`)
- Missing required columns: `user_id`, `node_id`

**Correct Schema** (from `supabase/migrations/20251003_create_trigger_resources.sql`):
```sql
CREATE TABLE trigger_resources (
  id UUID PRIMARY KEY,
  workflow_id UUID NOT NULL,
  user_id UUID NOT NULL,           -- ✅ Required
  node_id TEXT NOT NULL,             -- ✅ Required
  provider_id TEXT NOT NULL,         -- ✅ Not "provider"
  trigger_type TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  external_id TEXT NOT NULL,
  config JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',       -- ✅ This exists!
  status TEXT NOT NULL DEFAULT 'active',
  ...
)
```

### Issue 2: Config Structure Mismatch

The config structure didn't match what the webhook processor expected.

**Stored** (wrong):
```typescript
config: {
  workspace: workspaceId,
  database: databaseId,
  dataSource: dataSourceId  // ❌ Wrong key name
}
```

**Processor Expected**:
```typescript
config: {
  workspace: workspaceId,
  database: databaseId,
  dataSourceId: dataSourceId  // ✅ Correct key name
}
```

## Fix Applied

### 1. Fixed Column Names in Insert

**Before**:
```typescript
.insert({
  workflow_id: workflowId,
  provider: 'notion',              // ❌ Wrong column name
  resource_type: triggerType,      // ❌ Wrong value (should be 'webhook')
  external_id: `notion-${workflowId}-${nodeId}`,
  status: 'active',
  config: { ... },
  metadata: { ... }
})
```

**After**:
```typescript
.insert({
  workflow_id: workflowId,
  user_id: userId,                 // ✅ Added required field
  node_id: nodeId,                 // ✅ Added required field
  provider_id: 'notion',           // ✅ Correct column name
  trigger_type: triggerType,       // ✅ Store actual trigger type
  resource_type: 'webhook',        // ✅ Correct resource type
  external_id: `notion-${workflowId}-${nodeId}`,
  status: 'active',
  config: { ... },
  metadata: { ... }
})
```

### 2. Fixed Config Structure

**Before**:
```typescript
config: {
  workspace: workspaceId,
  database: databaseId,
  dataSource: dataSourceId  // ❌ Processor looks for 'dataSourceId'
}
```

**After**:
```typescript
config: {
  workspace: workspaceId,
  database: databaseId,
  dataSourceId: dataSourceId  // ✅ Matches processor expectations
}
```

### 3. Fixed Query Column Names

Updated all queries to use correct column names:

**Deactivate**:
```typescript
// Before
.eq('provider', 'notion')  // ❌

// After
.eq('provider_id', 'notion')  // ✅
```

**Health Check**:
```typescript
// Before
.eq('provider', 'notion')  // ❌

// After
.eq('provider_id', 'notion')  // ✅
```

## Files Modified

**`lib/triggers/providers/NotionTriggerLifecycle.ts`**:
- Lines 96-108: Fixed insert statement with correct column names
- Line 107: Fixed config structure (`dataSourceId` not `dataSource`)
- Line 146: Fixed deactivate query
- Line 169: Fixed health check query

## How to Verify Schema Columns

To avoid this issue in the future, always check the actual schema first:

### Method 1: Check Migration Files
```bash
grep -A 30 "CREATE TABLE.*trigger_resources" supabase/migrations/*.sql
```

### Method 2: Check Supabase Dashboard
1. Go to https://supabase.com/dashboard
2. Select your project
3. Navigate to "Table Editor"
4. Find `trigger_resources` table
5. Review all columns

### Method 3: Query Information Schema
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'trigger_resources'
ORDER BY ordinal_position;
```

## Common Mistakes to Avoid

### ❌ Don't Guess Column Names

```typescript
// ❌ Bad - guessing
provider: 'notion'
triggerId: trigger.id
```

```typescript
// ✅ Good - checked schema first
provider_id: 'notion'
node_id: nodeId
```

### ❌ Don't Assume Config Structure

```typescript
// ❌ Bad - assuming
config: {
  dataSource: id  // Guessed key name
}
```

```typescript
// ✅ Good - check what processor expects
config: {
  dataSourceId: id  // Matches processor code
}
```

### ❌ Don't Skip Required Fields

```typescript
// ❌ Bad - missing required fields
.insert({
  workflow_id: workflowId,
  provider_id: 'notion'
})
```

```typescript
// ✅ Good - all required fields
.insert({
  workflow_id: workflowId,
  user_id: userId,        // Required
  node_id: nodeId,        // Required
  provider_id: 'notion',  // Required
  trigger_type: type,     // Required
  resource_type: 'webhook', // Required
  external_id: id         // Required
})
```

## Schema Validation Checklist

When implementing any trigger lifecycle:

- [ ] Read the table schema from migration files
- [ ] Note all **required** columns (NOT NULL)
- [ ] Note exact column names (snake_case vs camelCase)
- [ ] Check what values `resource_type` should be ('webhook', 'subscription', etc.)
- [ ] Verify config structure matches what processor expects
- [ ] Check if there are unique constraints (workflow_id + node_id)
- [ ] Verify foreign key constraints (user_id → auth.users, workflow_id → workflows)

## Testing After Fix

1. **Activate Trigger**: Create/activate workflow with Notion trigger
2. **Check Database**: Verify row in `trigger_resources` table
3. **Verify Config**: Check config JSONB has correct structure
4. **Test Deactivation**: Deactivate workflow, verify row deleted
5. **Test Health Check**: Call health check, verify it works

## Related Issues

This fix also resolved:
- First error: "Cannot read properties of undefined (reading 'type')" - Fixed in previous commit
- This error: "Could not find the 'metadata' column" - Fixed by using correct column names
- Future error: Webhook filtering not working - Fixed by using correct config structure

## Lesson Learned

**Always verify schema before implementing database operations**

1. **Don't trust your memory** - Column names might not be what you expect
2. **Check the source** - Migration files are the source of truth
3. **Test inserts early** - Don't wait until full implementation to test database operations
4. **Match naming conventions** - If processor uses `dataSourceId`, use that everywhere
5. **Use TypeScript types** - Consider generating types from database schema

## Prevention for Future

**Option 1**: Generate TypeScript types from Supabase
```bash
npx supabase gen types typescript --project-id xzwsdwllmrnrgbltibxt > types/supabase.ts
```

**Option 2**: Create a shared type definition
```typescript
// lib/triggers/database-types.ts
export interface TriggerResource {
  id: string
  workflow_id: string
  user_id: string
  node_id: string
  provider_id: string
  trigger_type: string
  resource_type: 'webhook' | 'subscription' | 'watch' | 'polling'
  external_id: string
  config: Record<string, any>
  metadata: Record<string, any>
  status: 'active' | 'expired' | 'deleted' | 'error'
  created_at: string
  updated_at: string
  expires_at?: string
  deleted_at?: string
  last_error?: string
  error_count: number
}
```

Then use it:
```typescript
const insert: Omit<TriggerResource, 'id' | 'created_at' | 'updated_at'> = {
  workflow_id: workflowId,
  user_id: userId,
  // TypeScript will error if we use wrong column names!
}
```
