# Combobox and Select Field Styling Guide

## Overview
This guide documents how to style Combobox, MultiCombobox, and Select fields in the workflow configuration system, including how different field types are rendered and where to make styling changes.

## Component Hierarchy and Field Type Routing

### 1. Field Type Determination
Fields are first processed through `FieldRenderer.tsx` which routes them based on their `type`:

```
Field Type → Component Used
├── "select" → GenericSelectField
├── "multi_select" → GenericSelectField (with multiple: true)
├── "combobox" → Combobox (direct)
└── "multi-select" → MultiCombobox (direct)
```

### 2. GenericSelectField Component Routing
`/components/workflows/configuration/fields/shared/GenericSelectField.tsx` further routes fields:

```javascript
// Line 154: Check if field.multiple is true
if (field.multiple) {
  // Lines 164-182: Returns MultiCombobox
  return <MultiCombobox ... />
}

// Line 186-189: Check if it's an Airtable field
const isAirtableRecordField = nodeInfo?.providerId === 'airtable' &&
  (nodeInfo?.type === 'airtable_action_create_record' ||
   nodeInfo?.type === 'airtable_action_update_record') &&
  field.name?.startsWith('airtable_field_');

// Line 192: Use Combobox for Airtable fields
if (isAirtableRecordField || field.clearable !== false) {
  // Lines 194-206: Returns Combobox
  return <Combobox ... />
}

// Lines 221-279: Otherwise use Select
return <Select ... />
```

## Airtable Field Special Cases

### Fields That Use MultiCombobox
In `/components/workflows/configuration/providers/AirtableConfiguration.tsx`:

```javascript
// Lines 454-456: These fields are set to multiple: true
multiple: fieldNameLower.includes('tasks') ||
         fieldNameLower.includes('associated project') ||
         fieldNameLower.includes('feedback') ||
         field.type === 'multipleRecordLinks'
```

**Result**: Associated Project, Feedback, and Tasks fields use **MultiCombobox** component.

## Component File Locations

### 1. Combobox Component
**File**: `/components/ui/combobox.tsx`

**Key styling areas**:
- **Line 673**: Button className for the trigger
- **Line 674**: Inline styles (currently `style={{ color: 'white' }}`)
- **Line 684**: Placeholder text span

### 2. MultiCombobox Component
**File**: `/components/ui/combobox.tsx` (same file, different export)

**Key styling areas**:
- **Line 411**: Button className
- **Lines 422-424**: Placeholder when badges hidden
- **Line 468**: Placeholder when no selection
- **Lines 434, 451**: Badge text color

### 3. Select Component
**File**: `/components/ui/select.tsx`

**Key styling areas**:
- **Line 22**: SelectTrigger className (removed `placeholder:text-muted-foreground`)
- In GenericSelectField:
  - **Lines 237-239**: Custom placeholder rendering with white text

## How to Change Text Color

### For All Comboboxes (Single Select)
```javascript
// In /components/ui/combobox.tsx, line 674
<Button
  style={{ color: 'white' }}  // Forces all text to be white
  ...
>
```

### For All MultiComboboxes
```javascript
// In /components/ui/combobox.tsx
// Lines 422-424 for hidden badges placeholder
<span className="text-white">
  {placeholder || "Select option(s)..."}
</span>

// Line 468 for normal placeholder
<span className="text-white">{placeholder || "Select option(s)..."}</span>
```

### For Select Components
```javascript
// In /components/workflows/configuration/fields/shared/GenericSelectField.tsx
// Lines 237-239
<SelectValue placeholder={field.placeholder || "Select an option..."}>
  {displayValue ? displayValue : (
    <span className="text-white">{field.placeholder || "Select an option..."}</span>
  )}
</SelectValue>
```

## Button Variant Styling
The Button component uses `variant="outline"` which has these styles:
```javascript
// In /components/ui/button.tsx, lines 15-16
outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground"
```

**Note**: The outline variant doesn't specify a default text color, inheriting from theme.

## Common Issues and Solutions

### Issue: Text remains grey despite adding text-white class
**Cause**: Button variant or other CSS classes override the text color.
**Solution**: Use inline styles `style={{ color: 'white' }}` which have highest specificity.

### Issue: Changes to Combobox don't affect certain fields
**Cause**: Fields might be using MultiCombobox instead (check if field.multiple is true).
**Solution**: Make changes in both Combobox and MultiCombobox components.

### Issue: Airtable fields behave differently
**Cause**: Airtable fields have special routing logic based on:
- Provider ID being 'airtable'
- Node type being create/update record
- Field name starting with 'airtable_field_'
**Solution**: Check GenericSelectField routing logic (lines 186-206).

## Field Identification Checklist

To identify which component a field uses:

1. **Check field type**: Look at the field definition in availableNodes.ts or node configuration
2. **Check if multiple**: Look for `multiple: true` in field config
3. **Check field name**: For Airtable, check if it includes 'tasks', 'feedback', 'associated project'
4. **Check provider**: See if nodeInfo.providerId === 'airtable'
5. **Check node type**: See if it's create_record or update_record

## Testing Changes

When making styling changes:
1. Test single select fields (Combobox)
2. Test multi-select fields (MultiCombobox)
3. Test Airtable specific fields (Associated Project, Feedback, Tasks)
4. Test regular Select fields (non-Airtable, non-clearable)
5. Check both placeholder state and selected value state
6. Test in both light and dark themes if applicable

## Quick Reference

| Field Type | Component | File | Placeholder Line |
|-----------|-----------|------|------------------|
| Airtable single fields | Combobox | combobox.tsx | 684 |
| Airtable multiple fields | MultiCombobox | combobox.tsx | 422-424, 468 |
| Regular select | Select | GenericSelectField.tsx | 237-239 |
| Combobox type | Combobox | combobox.tsx | 684 |
| Multi-select type | MultiCombobox | combobox.tsx | 422-424, 468 |

## Important Notes

1. **Badge colors**: MultiCombobox badges use `text-white` class added at lines 434 and 451
2. **Button styling**: Both Combobox and MultiCombobox use Button with `variant="outline"`
3. **Inline styles**: Using `style={{ color: 'white' }}` overrides all CSS classes
4. **Field routing**: Always check GenericSelectField.tsx to understand how fields are routed
5. **Progressive display**: Fields can be hidden/shown using `hidden: true` and `showWhen` conditions