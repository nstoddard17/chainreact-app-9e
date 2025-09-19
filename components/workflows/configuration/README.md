# Configuration Modal Components Guide

## 🚨 CRITICAL: Left Column Containment Rules

**ALL CONTENT MUST STAY IN THE LEFT COLUMN** - Never allow content to overflow under the variable picker panel (right column).

## Quick Start for New Configurations

```jsx
import { ConfigurationContainer } from '../components/ConfigurationContainer';

export function YourNewConfiguration({ ...props }) {
  return (
    <ConfigurationContainer
      onSubmit={handleSubmit}
      onCancel={onCancel}
      onBack={onBack}
      isEditMode={isEditMode}
    >
      {/* Your content here - it will automatically stay in the left column */}
    </ConfigurationContainer>
  );
}
```

## The Two-Column Layout

```
┌─────────────────────────────────────────────────────┐
│                  Modal Container                     │
├─────────────────────────────┬───────────────────────┤
│                             │                       │
│   Left Column               │   Right Column        │
│   (Config Content)          │   (Variable Picker)   │
│   - flex-1                  │   - w-80/w-96         │
│   - All fields here         │   - Fixed width       │
│   - Tables with h-scroll    │   - Always visible    │
│                             │                       │
└─────────────────────────────┴───────────────────────┘
```

## ❌ NEVER DO THIS

1. **Never use ScrollArea component**
   ```jsx
   // ❌ BAD - ScrollArea doesn't constrain width properly
   import { ScrollArea } from "@/components/ui/scroll-area";
   ```

2. **Never use min-w-full on containers**
   ```jsx
   // ❌ BAD - Forces minimum width
   <div className="min-w-full">
   ```

3. **Never allow unbounded width**
   ```jsx
   // ❌ BAD - No width constraints
   <div className="w-auto">
     <WideTable />
   </div>
   ```

## ✅ ALWAYS DO THIS

1. **Always use ConfigurationContainer for providers**
2. **Always use overflow-hidden on parent containers**
3. **Always use max-w-full on wide content**
4. **Always test with wide tables (many columns)**

## Testing Checklist

- [ ] Open configuration with Airtable Update Record (has wide tables)
- [ ] Verify table doesn't extend under variable picker
- [ ] Check horizontal scroll appears on table only
- [ ] Resize browser window - content should stay contained
- [ ] Test with 20+ table columns

## File Structure

```
/components/workflows/configuration/
├── components/
│   └── ConfigurationContainer.tsx    # ✅ USE THIS
├── providers/
│   ├── AirtableConfiguration.tsx    # Example with tables
│   └── GenericConfiguration.tsx     # Example with standard fields
└── README.md                         # This file
```

## Common Patterns

### Wide Tables
```jsx
<div className="w-full overflow-hidden">
  <div style={{ maxWidth: '100%', overflow: 'hidden' }}>
    <div style={{ overflowX: 'auto', overflowY: 'auto' }}>
      <table style={{ minWidth: '100%' }}>
        {/* Table content */}
      </table>
    </div>
  </div>
</div>
```

### Standard Fields
```jsx
<ConfigurationContainer {...props}>
  <div className="space-y-3">
    {fields.map(field => <FieldRenderer {...field} />)}
  </div>
</ConfigurationContainer>
```

## Debugging Tips

If content is overflowing:
1. Open DevTools
2. Look for elements without `overflow-hidden` or `max-w-full`
3. Check if ScrollArea is being used
4. Verify ConfigurationContainer is the parent

## Related Documentation

- `/learning/docs/modal-column-overflow-solution.md` - Full technical details
- `/components/workflows/configuration/ConfigurationModal.tsx` - Modal structure docs
- `CLAUDE.md` - Project-wide guidelines