# Conditional Required Fields Solution

## Problem Statement

In workflow configuration forms, we have fields that are marked as `required: true` in the schema, but they're not always actually required because:

1. **Different user paths**: Users can choose different actions (e.g., "create" vs "update" vs "list") and each path has its own set of required fields
2. **Dependent fields**: Some fields only appear when parent fields have values (e.g., `filterValue` only shows when `filterField` is selected)
3. **Provider-specific logic**: Different providers hide/show fields based on the action type

### Example Scenarios

#### Airtable
- `recordId` is required for "update" action but not needed for "create" action
- `filterField` and `filterValue` are only used for "list records" action
- Dynamic fields (`airtable_field_*`) only appear after selecting a table

#### Google Sheets
- `updateMapping.*` fields only appear when action is "update"
- `range` field only needed for "read" action
- Different fields required for "append" vs "update" vs "clear"

#### Discord
- `messageId` only required for edit/delete message actions
- `emoji` only required for reaction actions
- `filterAuthor` only available for certain trigger types

## The Solution: useFieldValidation Hook

Created a new validation hook that:
1. Determines which fields are currently visible
2. Only validates required fields that are visible
3. Provides proper error messages
4. Prevents form submission if visible required fields are missing

### Implementation

```typescript
// hooks/useFieldValidation.ts
export function useFieldValidation({ nodeInfo, values }) {
  // Determines if a field is visible based on:
  // - dependsOn conditions
  // - showWhen conditions
  // - provider-specific rules
  const isFieldVisible = (field) => {
    // Check dependencies
    if (field.dependsOn && !values[field.dependsOn]) {
      return false;
    }
    
    // Provider-specific visibility
    // ... specific rules for each provider
    
    return true;
  };
  
  // Only validate visible required fields
  const validateRequiredFields = () => {
    const visibleFields = getVisibleFields();
    // Validate only these fields
  };
}
```

## Integration Steps

### 1. Import the Hook
```typescript
import { useFieldValidation } from '../hooks/useFieldValidation';
```

### 2. Initialize in Component
```typescript
const { 
  isFieldVisible, 
  validateRequiredFields, 
  canSubmit 
} = useFieldValidation({ nodeInfo, values });
```

### 3. Filter Fields During Rendering
```typescript
const renderFields = (fields) => {
  const visibleFields = fields.filter(field => isFieldVisible(field));
  return visibleFields.map(field => <FieldRenderer ... />);
};
```

### 4. Validate on Submit
```typescript
const handleSubmit = async (e) => {
  e.preventDefault();
  
  const { isValid, errors } = validateRequiredFields();
  
  if (!isValid) {
    setValidationErrors(errors);
    return; // Prevent submission
  }
  
  // Continue with submission
  await onSubmit(values);
};
```

## Provider-Specific Rules

### Airtable Rules
```typescript
// recordId hidden for create action
if (field.name === 'recordId' && nodeType === 'create_record') {
  return false;
}

// Filter fields only for list action
if (field.name.startsWith('filter') && nodeType !== 'list_records') {
  return false;
}
```

### Google Sheets Rules
```typescript
// Update fields only when action is update
if (field.name.startsWith('updateMapping.') && values.action !== 'update') {
  return false;
}
```

### Discord Rules
```typescript
// messageId only for specific actions
const needsMessage = ['edit_message', 'delete_message'].includes(nodeType);
if (field.name === 'messageId' && !needsMessage) {
  return false;
}
```

## Benefits

1. **No false validation errors**: Users won't see "required" errors for fields they can't see
2. **Flexible workflows**: Different paths through the form work correctly
3. **Better UX**: Users only fill out fields relevant to their chosen action
4. **Maintainable**: Validation logic centralized in one hook
5. **Extensible**: Easy to add new provider-specific rules

## Testing Checklist

- [ ] Create Airtable record - no recordId required
- [ ] Update Airtable record - recordId IS required
- [ ] List Airtable records - filter fields available but not required
- [ ] Google Sheets append - no update fields shown
- [ ] Google Sheets update - update fields shown and validated
- [ ] Discord send message - no messageId required
- [ ] Discord edit message - messageId IS required
- [ ] Fields with dependsOn - only validate when parent has value
- [ ] Save button disabled when visible required fields empty
- [ ] Save button enabled when all visible required fields filled

## Migration Guide

To add this validation to existing provider components:

1. Import `useFieldValidation` hook
2. Initialize hook with nodeInfo and values
3. Update `renderFields` to filter by visibility
4. Update `handleSubmit` to validate before submission
5. Pass validation errors to FieldRenderer components
6. Test all action types for the provider

## Future Improvements

1. **Dynamic validation rules**: Allow fields to specify custom validation functions
2. **Async validation**: Support validation that requires API calls
3. **Field groups**: Validate related fields together
4. **Warning vs Error**: Some fields could show warnings instead of blocking submission
5. **Progressive disclosure**: Show/hide entire sections based on choices
6. **Validation hints**: Show users why a field is required in their context