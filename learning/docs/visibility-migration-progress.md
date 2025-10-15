# Field Visibility Pattern Migration Progress

**Date**: October 14, 2025
**Status**: Phase 2 - ✅ COMPLETE (100%)

## Overview

Migration from legacy visibility patterns to modern `visibilityCondition` format.

## Progress Summary

|  Status | Patterns | Percentage |
|---------|----------|------------|
| ✅ Migrated | 96 | 100% |
| ⏳ Remaining | 0 | 0% |
| **Total** | **96** | **100%** |

🎉 **ALL LEGACY PATTERNS SUCCESSFULLY MIGRATED!**

## Completed Migrations

### Auto-Migrated (63 patterns)
- ✅ Airtable (9 patterns)
- ✅ AI Actions (5 patterns)
- ✅ Dropbox (4 patterns)
- ✅ Google Calendar (6 patterns)
- ✅ Google Docs (2 patterns)
- ✅ Google Drive (3 patterns)
- ✅ Google Sheets (4 patterns)
- ✅ HubSpot (14 patterns)
- ✅ Logic (4 patterns)
- ✅ Microsoft Excel (3 patterns)
- ✅ OneDrive (5 patterns)
- ✅ OneNote (4 patterns)

### Manually Migrated (33 patterns)
- ✅ Outlook (8 patterns) - Calendar event conditional fields + online meeting boolean
- ✅ Teams (2 patterns) - Channel visibility with `$exists` → `isNotEmpty`
- ✅ Logic (1 pattern) - Complex operator array → `in` operator
- ✅ Facebook (6 patterns) - Mixed visibility patterns with date ranges and monetization
- ✅ HubSpot (4 patterns) - `conditionalVisibility` and `visibleWhen` with boolean values (createContactEnhanced + createContactDynamic)
- ✅ Microsoft Excel (3 patterns) - Complex multi-condition AND logic for filter values
- ✅ Slack (2 patterns) - `showWhen` with MongoDB-style operators (`$eq`)
- ✅ Google Calendar (4 patterns) - Attendee-related `conditionalVisibility` patterns
- ✅ Google Docs (3 patterns) - Share document visibility with complex conditions

## Final Migrations Completed

### Google Sheets (2 patterns)
- Line 407-412: Complex filter value visibility with AND logic
  ```typescript
  // Before: showWhen: { filterColumn: "!empty", filterOperator: [...] }
  // After: visibilityCondition with AND combining isNotEmpty + in operator
  ```
- Line 478: Date column visibility with IN operator
  ```typescript
  // Before: showWhen: { dateFilter: ["today", "yesterday", ...] }
  // After: visibilityCondition with in operator
  ```

### HubSpot createContactDynamic (1 pattern)
- Line 213: Company association visibility
  ```typescript
  // Before: visibleWhen: { field: "associateWithCompany", equals: true }
  // After: visibilityCondition: { field: "associateWithCompany", operator: "equals", value: true }
  ```

## Migration Guide for Remaining Patterns

### Pattern 1: `$exists` Operator

**Legacy:**
```typescript
showWhen: { teamId: { $exists: true } }
```

**Modern:**
```typescript
visibilityCondition: { field: "teamId", operator: "isNotEmpty" }
```

### Pattern 2: Boolean Conditions

**Legacy:**
```typescript
showWhen: { isOnlineMeeting: true }
```

**Modern:**
```typescript
visibilityCondition: { field: "isOnlineMeeting", operator: "equals", value: true }
```

### Pattern 3: Complex Nested Conditions

**Legacy:**
```typescript
showWhen: {
  conditionType: "multiple",
  operator: { $in: ["and", "or"] }
}
```

**Modern:**
```typescript
visibilityCondition: {
  and: [
    { field: "conditionType", operator: "equals", value: "multiple" },
    { field: "operator", operator: "in", value: ["and", "or"] }
  ]
}
```

### Pattern 4: `conditionalVisibility` with Boolean

**Legacy:**
```typescript
conditionalVisibility: { field: "hasOption", value: true }
```

**Modern:**
```typescript
visibilityCondition: { field: "hasOption", operator: "equals", value: true }
```

## Next Steps (Optional Phase 3)

With all 96 patterns now migrated to modern `visibilityCondition` format, these steps are optional optimizations:

1. ✅ **Manual Migration** - COMPLETE (All 96 patterns migrated)
2. ⏳ **Testing** - Test all migrated nodes thoroughly in production
3. ⏳ **Provider-Specific Rules** - Migrate any remaining hardcoded visibility rules to declarative
4. ⏳ **Cleanup** - Remove legacy pattern support from engine (optional - keeping for backwards compatibility)

## Files Modified

### Automatically Migrated
- `/lib/workflows/nodes/providers/ai/actions/message.schema.ts`
- `/lib/workflows/nodes/providers/ai/aiRouterNode.ts`
- `/lib/workflows/nodes/providers/airtable/index.ts`
- `/lib/workflows/nodes/providers/dropbox/index.ts`
- `/lib/workflows/nodes/providers/google-calendar/index.ts`
- `/lib/workflows/nodes/providers/google-docs/index.ts`
- `/lib/workflows/nodes/providers/google-drive/index.ts`
- `/lib/workflows/nodes/providers/google-sheets/index.ts`
- `/lib/workflows/nodes/providers/hubspot/createContactDynamic.ts`
- `/lib/workflows/nodes/providers/hubspot/index.ts`
- `/lib/workflows/nodes/providers/logic/index.ts`
- `/lib/workflows/nodes/providers/microsoft-excel/index.ts`
- `/lib/workflows/nodes/providers/onedrive/index.ts`
- `/lib/workflows/nodes/providers/onenote/index.ts`

### Manually Migrated
- `/lib/workflows/nodes/providers/outlook/index.ts` (8 patterns)
- `/lib/workflows/nodes/providers/teams/index.ts` (2 patterns)
- `/lib/workflows/nodes/providers/logic/index.ts` (1 pattern)
- `/lib/workflows/nodes/providers/facebook/index.ts` (6 patterns)
- `/lib/workflows/nodes/providers/hubspot/createContactEnhanced.ts` (3 patterns)
- `/lib/workflows/nodes/providers/hubspot/createContactDynamic.ts` (1 pattern)
- `/lib/workflows/nodes/providers/microsoft-excel/index.ts` (3 patterns)
- `/lib/workflows/nodes/providers/slack/actions/sendMessage.schema.ts` (2 patterns)
- `/lib/workflows/nodes/providers/google-calendar/index.ts` (4 patterns)
- `/lib/workflows/nodes/providers/google-docs/index.ts` (3 patterns)
- `/lib/workflows/nodes/providers/google-sheets/index.ts` (2 patterns)

## Build Status

✅ Build successful after complete migration
✅ No TypeScript errors
✅ All legacy patterns migrated (96/96)

## Commands

```bash
# Re-audit remaining patterns
npx ts-node scripts/migrate-visibility-patterns.ts --audit

# Run auto-migration again (safe to re-run)
node scripts/auto-migrate-visibility.cjs
```

## See Also

- [Field Visibility Architecture](./field-visibility-architecture.md)
- [Migration Script](../../scripts/auto-migrate-visibility.cjs)
- [Audit Script](../../scripts/migrate-visibility-patterns.ts)
