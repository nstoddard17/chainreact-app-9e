# Logging Migration Plan - File by File

**Status**: Phase 2 Complete - Ready for Phase 3
**Estimated Total Time**: 60 minutes
**Expected Log Reduction**: 80-95%

## Migration Order (By Impact)

Files ordered by log volume and impact. Migrate in this order for maximum benefit early.

---

## 1. `/app/api/workflows/execute/route.ts` (20 min)

**Priority**: CRITICAL (Main entry point, affects all executions)
**Current Log Volume**: ~30 lines per execution
**Target**: 3-5 INFO, 10 DEBUG lines

### Changes Required

#### Import Logger
```typescript
import { logger } from '@/lib/utils/logger'
```

#### Remove/Update Logs

| Current Log | Action | New Level |
|------------|--------|-----------|
| `console.log('=== Workflow Execution Started ===')` | Replace | INFO |
| `console.log('📊 [Execute Route] Request content-length:')` | Remove | TRACE |
| `console.log('📊 [Execute Route] Workflow data received:')` | Replace | DEBUG |
| `console.log('Execution parameters:')` | Replace | DEBUG |
| `console.log('Workflow found:')` | Replace | DEBUG |
| `console.log('Using user ID from x-user-id header:')` | Replace | DEBUG |
| `console.log('User authenticated:')` | Consolidate | DEBUG |
| `console.log('Workflow structure:')` | Replace | DEBUG |

#### Example Refactor

**Before**:
```typescript
console.log('=== Workflow Execution Started (Refactored) ===')
console.log('📊 [Execute Route] Request content-length:', contentLength)
console.log('📊 [Execute Route] Request body text length:', bodyLength)
console.log('📊 [Execute Route] Workflow data received:', {
  workflowId,
  hasWorkflowData,
  nodesCount,
  nodeTypes
})
```

**After**:
```typescript
logger.info('Workflow execution started', { workflowId, executionMode })
logger.debug('Workflow structure', { nodesCount, nodeTypes })
```

---

## 2. `/lib/workflows/AdvancedExecutionEngine.ts` (15 min)

**Priority**: HIGH (Core execution logic)
**Current Log Volume**: ~40 lines per execution (with duplicates)
**Target**: 2 INFO, 5 DEBUG, 10 TRACE

### Changes Required

#### Import Logger
```typescript
import { logger } from '@/lib/utils/logger'
```

#### Remove Duplicate Logs

**Pattern to find**:
```typescript
console.log('[Backend INFO]', message)
console.log(message)
```

**Replace with**:
```typescript
logger.debug(message)
```

#### Key Areas

1. **executeWorkflowAdvanced** - Move to TRACE
   - Current: 3 duplicate logs
   - New: 1 TRACE log

2. **executeMainWorkflowPath** - Move to DEBUG
   - Current: Duplicate logs
   - New: 1 DEBUG log

3. **Node execution** - Simplify
   - Current: 3 logs per node
   - New: 1 DEBUG log per node

#### Example Refactor

**Before**:
```typescript
console.log('🛠️ AdvancedExecutionEngine.executeWorkflowAdvanced called', { sessionId, workflowId })
console.log('[Backend INFO] AdvancedExecutionEngine.executeWorkflowAdvanced called', { ... })
console.log('[Backend INFO] Workflow execution started', { ... })
```

**After**:
```typescript
logger.trace('Advanced execution engine started', { sessionId, workflowId, inputKeys: Object.keys(input) })
```

---

## 3. Integration Lookup & Authentication (10 min)

**Files**:
- `/lib/services/integrationHelpers.ts` or similar
- Any file with integration lookup logic

**Priority**: HIGH (Privacy concern + verbosity)
**Current Log Volume**: ~20 lines per lookup
**Target**: 2 DEBUG lines

### Changes Required

#### Remove Full Integration List

**Before**:
```typescript
console.log('📋 All integrations for user:', integrations) // REMOVE - Privacy concern
```

**After**:
```typescript
// Remove entirely - not needed
```

#### Simplify Lookup Logs

**Before**:
```typescript
console.log('🔍 Looking for integration:', { userId, provider })
console.log('🔍 Searching for integration with providers:', [provider, fallback])
console.log('✅ Found integration for gmail with actual provider:', actualProvider)
```

**After**:
```typescript
logger.debug('Looking up integration', { provider })
logger.debug('Integration found', { provider, status: 'connected' })
```

#### Token Operations

**Before**:
```typescript
console.log('Attempting to decrypt access token for', provider)
console.log('Token format check:', { hasColon, isEncrypted })
console.log('Token for gmail is stored as plain text')
```

**After**:
```typescript
logger.trace('Token retrieval', { provider, encrypted: isEncrypted })
```

---

## 4. Node Execution Handlers (10 min)

**Files**:
- `/lib/services/executionHandlers/*`
- Any file with node execution logic

**Priority**: MEDIUM
**Current Log Volume**: ~10 lines per node
**Target**: 1 INFO, 2 DEBUG

### Changes Required

#### Execution Banners

**Before**:
```typescript
console.log('[Execution Started] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('🔄 Email sent (microsoft-outlook_trigger_email_sent)')
console.log('⏱️ 5:48:49 PM')
console.log('📌 Status: 🔄 Started')
console.log('────────────────────────────────────────────────────────────')
console.log('📥 Configuration:')
console.log('  To: "marcusleonard120@gmail.com"')
console.log('  Subject: "Testing"')
```

**After**:
```typescript
logger.info('Email sent trigger started')
logger.ifDebug(() => {
  logger.debug('Trigger configuration', {
    to: maskEmail(config.to),
    subject: config.subject ? '[REDACTED]' : undefined
  })
})
```

#### Circular Reference Warnings

**Before**:
```typescript
console.log('🔗 Using outputs from previous nodes:')
console.log('  From trigger-1760223088333:')
console.log('    "[Circular Reference]"')
```

**After**:
```typescript
// Remove entirely - handle circular refs silently
logger.trace('Using previous outputs', { fromNodes: Object.keys(previousOutputs) })
```

#### Completion Messages

**Before**:
```typescript
console.log('✅ Node completed:', nodeId)
console.log('[Backend SUCCESS] Node completed:', nodeId)
console.log('[Backend SUCCESS] Node completed:', nodeTitle, { nodeId, success })
```

**After**:
```typescript
logger.info('Send Email completed', { duration, messageId })
logger.debug('Node output', { outputKeys: Object.keys(output) })
```

---

## 5. Execution Progress Tracking (5 min)

**Files**:
- `/lib/workflows/ExecutionProgressTracker.ts` or similar

**Priority**: LOW (Already minimal)
**Current Log Volume**: ~15 lines
**Target**: TRACE only

### Changes Required

**Before**:
```typescript
console.log('🔄 ExecutionProgressTracker.initialize called', { executionId, workflowId })
console.log('✅ Execution progress tracker initialized:', trackerId)
console.log('Updating execution progress:', { currentNodeId, status })
```

**After**:
```typescript
logger.trace('Progress tracker initialized', { executionId })
logger.trace('Progress update', { currentNodeId, status })
```

---

## 6. Workflow Completion Summary (5 min)

**Files**:
- Workflow execution completion logic

**Priority**: CRITICAL (Final user-facing message)
**Current Log Volume**: ~7 lines (duplicates)
**Target**: 1 INFO line

### Changes Required

**Before**:
```typescript
console.log('✅ Main workflow path finished', { sessionId, workflowId })
console.log('[Backend SUCCESS] Main workflow path finished', { ... })
console.log('Updating execution progress:', { status: 'completed', progressPercentage: 100 })
console.log('✅ Execution completed')
console.log('✅ AdvancedExecutionEngine execution completed', { sessionId, workflowId })
console.log('[Backend SUCCESS] AdvancedExecutionEngine execution completed', { ... })
console.log('Advanced workflow execution completed')
```

**After**:
```typescript
logger.info('Workflow completed successfully', {
  workflowId,
  duration: executionTime,
  nodesExecuted: completedNodes.length,
  status: 'success'
})
```

---

## Helper Functions to Create

### Email Masking
```typescript
// lib/utils/logger-helpers.ts
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '[INVALID]'
  const [local, domain] = email.split('@')
  return `${local[0]}***@${domain[0]}***.${domain.split('.').pop()}`
}
```

### PII Redaction
```typescript
export function redactPII(value: string, showLength: boolean = true): string {
  if (!value) return '[EMPTY]'
  return showLength ? `[REDACTED: ${value.length} chars]` : '[REDACTED]'
}
```

---

## Testing Strategy

### After Each File Migration

1. **Build Test**
   ```bash
   npm run build
   ```

2. **Runtime Test**
   ```bash
   # Test with INFO (production)
   LOG_LEVEL=INFO npm run dev
   # Execute a workflow, verify clean logs

   # Test with DEBUG (development)
   LOG_LEVEL=DEBUG npm run dev
   # Execute a workflow, verify adequate detail

   # Test with TRACE (troubleshooting)
   LOG_LEVEL=TRACE npm run dev
   # Execute a workflow, verify full context
   ```

3. **Verify**
   - [ ] No TypeScript errors
   - [ ] Logs at INFO level are clean (5-10 lines)
   - [ ] Logs at DEBUG level have adequate detail
   - [ ] No sensitive data in any level
   - [ ] No duplicate messages

---

## Migration Checklist

### Phase 3: Refactor Files

- [ ] Migrate `/app/api/workflows/execute/route.ts` (20 min)
  - [ ] Import logger
  - [ ] Replace console.log with logger methods
  - [ ] Remove verbose technical logs
  - [ ] Test at INFO, DEBUG, TRACE levels
  - [ ] Verify build successful

- [ ] Migrate `/lib/workflows/AdvancedExecutionEngine.ts` (15 min)
  - [ ] Import logger
  - [ ] Remove duplicate "[Backend]" logs
  - [ ] Replace console.log with logger methods
  - [ ] Test execution flow
  - [ ] Verify build successful

- [ ] Migrate Integration Lookup files (10 min)
  - [ ] Remove full integration list log
  - [ ] Simplify lookup messages
  - [ ] Move token ops to TRACE
  - [ ] Test integration lookup
  - [ ] Verify build successful

- [ ] Migrate Node Execution Handlers (10 min)
  - [ ] Simplify execution banners
  - [ ] Remove circular ref warnings
  - [ ] Consolidate completion messages
  - [ ] Test node execution
  - [ ] Verify build successful

- [ ] Migrate Progress Tracking (5 min)
  - [ ] Move all to TRACE level
  - [ ] Test progress updates
  - [ ] Verify build successful

---

## Success Criteria

After migration:
- [ ] Production logs (INFO) reduced by 80%+
- [ ] Single workflow execution: 5-10 INFO lines (vs 150+)
- [ ] No duplicate messages
- [ ] No circular reference warnings
- [ ] No full integration lists
- [ ] No sensitive data in logs
- [ ] DEBUG level provides adequate troubleshooting detail
- [ ] TRACE level provides full context when needed
- [ ] Build successful with no errors
- [ ] All workflows execute correctly

---

## Rollback Plan

If issues occur during migration:

1. **Immediate Rollback**
   ```bash
   git checkout HEAD -- <file>
   npm run build
   ```

2. **Enable TRACE Logging**
   ```bash
   LOG_LEVEL=TRACE npm run dev
   ```

3. **Identify Missing Info**
   - Review logs for missing critical information
   - Identify what needs to be at INFO level

4. **Fix and Redeploy**
   - Adjust log levels
   - Rebuild and test
   - Deploy fix

---

## Next Steps

1. Review this migration plan
2. Begin Phase 3: Start with `/app/api/workflows/execute/route.ts`
3. Test each migration thoroughly
4. Proceed to next file only after success
5. Update logging-configuration-guide.md with progress
