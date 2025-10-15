# Field Visibility Architecture

**Date**: October 14, 2025
**Status**: Implemented
**Files**: `/lib/workflows/fields/visibility.ts`, `useFieldValidation.ts`, `GenericConfiguration.tsx`

## Problem

Before this refactoring, field visibility logic was scattered across multiple files with inconsistent patterns:

1. **Multiple condition systems**: `visibilityCondition`, `conditional`, `visibleWhen`, `showWhen`, `dependsOn`, `hidden`
2. **Duplicated logic**: Same visibility evaluation in both validation and rendering
3. **Provider-specific hardcoding**: Special cases hardcoded in `isFieldVisible()` function
4. **INCOMPLETE validation bug**: Hidden fields were showing in validation messages because `getAllRequiredFields()` returned ALL required fields regardless of visibility

### Example of the Bug

The Notion "Manage Page" action has these required fields:
- `workspace` - always visible
- `operation` - visible when workspace is selected
- `parentType` - **only visible when operation="create"**
- `title` - **only visible when operation="create"**
- `archiveAction` - **only visible when operation="archive"**

When operation="Update Page", the user would see:
```
INCOMPLETE
Required fields: Workspace, Operation, Page, Parent Type, Title, Archive Action
```

Even though `Parent Type`, `Title`, and `Archive Action` were **hidden**.

## Solution: Centralized Field Visibility Engine

### Architecture

```
┌──────────────────────────────────────────────────────────────┐
│           FieldVisibilityEngine (Single Source of Truth)     │
│  /lib/workflows/fields/visibility.ts                          │
│                                                               │
│  • Evaluates all visibility conditions                       │
│  • Supports modern + legacy patterns                         │
│  • Provider-specific rules (temporary)                       │
│  • Validation helpers                                         │
└────────────────────┬─────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
┌───────────────────┐    ┌────────────────────────┐
│ useFieldValidation│    │ GenericConfiguration   │
│ (Validation Hook) │    │ (Field Rendering)      │
│                   │    │                        │
│ • Delegates to    │    │ • Delegates to         │
│   Engine          │    │   Engine               │
│ • Returns only    │    │ • Renders only         │
│   visible fields  │    │   visible fields       │
└───────────────────┘    └────────────────────────┘
```

### Key Features

1. **Single Source of Truth** - All visibility logic in `FieldVisibilityEngine`
2. **Declarative Conditions** - Conditions are data, not code
3. **Type-Safe** - Full TypeScript support
4. **Testable** - Easy to unit test
5. **Backward Compatible** - Supports legacy patterns during migration
6. **Extensible** - Easy to add new operators

## Modern Visibility Condition Format

### Simple Condition

```typescript
{
  visibilityCondition: {
    field: 'operation',
    operator: 'equals',
    value: 'create'
  }
}
```

### Compound Conditions (AND)

```typescript
{
  visibilityCondition: {
    and: [
      { field: 'operation', operator: 'equals', value: 'create' },
      { field: 'parentType', operator: 'equals', value: 'database' }
    ]
  }
}
```

### Compound Conditions (OR)

```typescript
{
  visibilityCondition: {
    or: [
      { field: 'operation', operator: 'equals', value: 'create' },
      { field: 'operation', operator: 'equals', value: 'update' }
    ]
  }
}
```

### Always Visible

```typescript
{
  visibilityCondition: 'always'
}
```

### Supported Operators

- `equals` - Field value equals expected value
- `notEquals` - Field value does not equal expected value
- `in` - Field value is in array of expected values
- `notIn` - Field value is not in array of expected values
- `isEmpty` - Field is empty/null/undefined
- `isNotEmpty` - Field has a value
- `greaterThan` - Numeric comparison
- `lessThan` - Numeric comparison
- `greaterThanOrEqual` - Numeric comparison
- `lessThanOrEqual` - Numeric comparison
- `contains` - String contains substring (case-insensitive)
- `startsWith` - String starts with substring (case-insensitive)
- `endsWith` - String ends with substring (case-insensitive)

## Legacy Patterns (Supported for Migration)

The engine supports these legacy patterns for backward compatibility:

### `conditional`
```typescript
{ conditional: { field: 'action', value: 'create' } }
```

### `conditionalVisibility`
```typescript
{ conditionalVisibility: { field: 'hasOption', value: true } }
```

### `visibleWhen`
```typescript
{ visibleWhen: { field: 'type', equals: 'webhook' } }
```

### `showWhen` (with MongoDB-style operators)
```typescript
{
  showWhen: {
    action: { $in: ['create', 'update'] },
    status: { $ne: 'archived' }
  }
}
```

### `dependsOn`
```typescript
{ dependsOn: 'workspace' }  // Only visible if workspace has a value
```

### `hidden`
```typescript
{ hidden: true }  // Always hidden
{ hidden: { $condition: { field: { $exists: true } } } }  // Conditional hiding
```

## Usage Examples

### In Node Schemas (Recommended)

```typescript
// /lib/workflows/nodes/providers/notion/unified-actions.ts
{
  name: "title",
  label: "Page Title",
  type: "text",
  required: true,
  visibilityCondition: {
    field: "operation",
    operator: "equals",
    value: "create"
  }
}
```

### In Validation Hook

```typescript
import { useFieldValidation } from './hooks/useFieldValidation';

const {
  getMissingRequiredFields,   // Only visible missing fields
  getAllRequiredFields,        // Only visible required fields
  canSubmit,                   // True if all visible required fields filled
  isFieldVisible               // Check if specific field is visible
} = useFieldValidation({ nodeInfo, values });
```

### Direct Engine Usage

```typescript
import { FieldVisibilityEngine } from '@/lib/workflows/fields/visibility';

// Check if field is visible
const visible = FieldVisibilityEngine.isFieldVisible(
  field,
  formValues,
  nodeInfo
);

// Get all visible fields
const visibleFields = FieldVisibilityEngine.getVisibleFields(
  schema,
  formValues,
  nodeInfo
);

// Get missing required visible fields
const missing = FieldVisibilityEngine.getMissingRequiredFields(
  schema,
  formValues,
  nodeInfo
);

// Validate all visible required fields
const { isValid, errors } = FieldVisibilityEngine.validate(
  schema,
  formValues,
  nodeInfo
);
```

## Migration Path

### Phase 1: ✅ Complete
- Created `FieldVisibilityEngine`
- Updated `useFieldValidation` to delegate to engine
- Updated `GenericConfiguration` to delegate to engine
- Maintained backward compatibility with all legacy patterns

### Phase 2: In Progress
- Migrate node schemas to use `visibilityCondition` format
- Document visibility patterns in node implementation guides

### Phase 3: Future
- Remove legacy pattern support from engine
- Remove provider-specific hardcoded rules
- Migrate all to declarative `visibilityCondition`

## Provider-Specific Rules (Temporary)

Currently, some provider-specific rules are hardcoded in `FieldVisibilityEngine.evaluateProviderSpecificRules()`:

- **Airtable**: Dynamic fields visibility based on table selection
- **Google Sheets**: Update/read action-specific fields
- **Discord**: Message ID for edit/delete actions

**TODO**: Migrate these to declarative `visibilityCondition` in node schemas.

## Benefits

### Before
- ❌ Visibility logic duplicated in 3+ places
- ❌ 6 different condition patterns
- ❌ Hidden fields showing in validation
- ❌ Hard to test
- ❌ Provider rules scattered

### After
- ✅ Single source of truth
- ✅ One modern pattern + backward compatibility
- ✅ Only visible fields in validation
- ✅ Easy to unit test
- ✅ Centralized provider rules (can be migrated)

## Related Issues

- **INCOMPLETE validation bug**: Fixed by only returning visible required fields
- **Field visibility inconsistency**: Fixed by centralizing evaluation
- **Hard to add new integrations**: Easier with declarative approach

## See Also

- `/lib/workflows/fields/visibility.ts` - The engine implementation
- `/components/workflows/configuration/hooks/useFieldValidation.ts` - Validation hook
- `/lib/workflows/nodes/providers/notion/unified-actions.ts` - Example usage
- `/learning/docs/field-implementation-guide.md` - Field implementation checklist
