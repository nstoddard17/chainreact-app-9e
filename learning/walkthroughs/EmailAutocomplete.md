# Email Autocomplete Component Walkthrough

## Overview

The Email Autocomplete component provides an enhanced email input experience that integrates with Gmail's contact system and recent email history. This walkthrough explains the internal implementation and data flow.

## Architecture

### Component Structure

The component is built as a controlled input with the following key elements:

1. **Input Field**: Main text input for typing
2. **Selected Emails Display**: Badge-style display for multiple selections
3. **Suggestions Dropdown**: Categorized list of email suggestions
4. **Loading States**: Visual feedback during data fetching

### State Management

```typescript
const [inputValue, setInputValue] = useState("")
const [isOpen, setIsOpen] = useState(false)
const [selectedIndex, setSelectedIndex] = useState(-1)
const [selectedEmails, setSelectedEmails] = useState<string[]>([])
```

- `inputValue`: Current text in the input field
- `isOpen`: Controls dropdown visibility
- `selectedIndex`: Keyboard navigation position
- `selectedEmails`: Array of selected email addresses (multiple mode)

## Data Flow

### 1. Initial Load

When the component mounts, it receives suggestions from the `gmail-enhanced-recipients` API:

```typescript
// API fetches data from multiple sources:
// 1. Gmail contacts via People API
// 2. Recent emails from inbox/sent folders
// 3. Combines and prioritizes the data
```

### 2. User Interaction Flow

```
User clicks input → handleInputFocus() → setIsOpen(true) → Show suggestions
User types → handleInputChange() → Filter suggestions → Update dropdown
User selects → handleSuggestionSelect() → Add to selectedEmails → Update value
```

### 3. Filtering Logic

The filtering uses a multi-stage approach:

```typescript
const filteredSuggestions = useMemo(() => {
  // 1. Remove already selected emails
  const availableSuggestions = suggestions.filter(suggestion => 
    !multiple || !selectedEmails.includes(suggestion.email)
  )
  
  if (!query) {
    // 2. When empty, show all with smart ordering
    return availableSuggestions.sort((a, b) => {
      // Contacts first, then recent, then alphabetical
    })
  }
  
  // 3. When typing, filter and rank by relevance
  return availableSuggestions.filter(suggestion => {
    return suggestion.email.toLowerCase().includes(query) ||
           (suggestion.name && suggestion.name.toLowerCase().includes(query))
  }).sort((a, b) => {
    // Exact matches first, then partial matches
  })
}, [inputValue, suggestions, selectedEmails, multiple])
```

## API Integration

### Gmail Enhanced Recipients

The component relies on the `gmail-enhanced-recipients` endpoint which:

1. **Fetches Contacts**: Uses People API to get Gmail contacts
2. **Extracts Recent Emails**: Parses inbox and sent folders for email addresses
3. **Combines Data**: Merges contacts and recent emails with priority
4. **Returns Structured Data**: Provides consistent format for the component

### Data Structure

```typescript
interface EmailSuggestion {
  value: string        // Email address
  label: string        // Display name
  email: string        // Email address (duplicate for compatibility)
  name?: string        // Contact name
  type?: 'contact' | 'recent'  // Data source
  isGroup?: boolean    // Contact group flag
  members?: { email: string; name?: string }[]  // Group members
}
```

## User Experience Features

### Immediate Display

The dropdown shows immediately when the user clicks into the field, even when empty:

```typescript
const handleInputFocus = () => {
  setIsOpen(true)
  setSelectedIndex(-1)
  
  // Focus the input to ensure it's ready for typing
  if (inputRef.current) {
    inputRef.current.focus()
  }
}
```

### Multiple Selection

Supports adding multiple email addresses with visual feedback:

```typescript
const handleSuggestionSelect = (suggestion: EmailSuggestion) => {
  if (multiple) {
    const newEmails = [...selectedEmails, suggestion.email]
    setSelectedEmails(newEmails)
    onChange(newEmails.join(', '))
    setInputValue("")
    // Keep dropdown open for multiple selection
    setIsOpen(true)
  }
}
```

### Manual Entry

Users can type custom email addresses that aren't in suggestions:

```typescript
// In handleKeyDown
case 'Enter':
  if (inputValue.trim() && isValidEmail(inputValue.trim())) {
    // Add manually typed email
    if (multiple) {
      const newEmails = [...selectedEmails, inputValue.trim()]
      setSelectedEmails(newEmails)
      onChange(newEmails.join(', '))
      setInputValue("")
    }
  }
```

## Keyboard Navigation

The component provides full keyboard navigation:

- **Arrow Down/Up**: Navigate through suggestions
- **Enter**: Select current suggestion or add manual email
- **Escape**: Close dropdown
- **Backspace**: Remove last selected email (multiple mode)
- **Comma/Tab**: Add current input as email

## Performance Optimizations

### Memoized Filtering

Uses `useMemo` to prevent unnecessary re-filtering:

```typescript
const filteredSuggestions = useMemo(() => {
  // Complex filtering logic
}, [inputValue, suggestions, selectedEmails, multiple])
```

### Debounced API Calls

The API calls are handled at the parent level with proper caching and loading states.

### Efficient Rendering

The dropdown only renders when `isOpen` is true, and sections are conditionally rendered based on available data.

## Accessibility

The component includes proper ARIA attributes:

```typescript
<Input
  role="combobox"
  aria-autocomplete="list"
  // ... other props
/>
```

## Integration Points

### Configuration Modal

The component is used in the Gmail send email configuration modal:

```typescript
case "email-autocomplete":
  return (
    <EmailAutocomplete
      value={value}
      onChange={handleChange}
      suggestions={dynamicOptions[field.dynamic] || []}
      multiple={true}
      isLoading={loadingDynamic}
    />
  )
```

### Dynamic Data Loading

The component integrates with the dynamic data loading system:

```typescript
// In ConfigurationModal
if (field.dynamic === "gmail-enhanced-recipients") {
  processedData = data.map((recipient: any) => ({
    value: recipient.email || recipient.value,
    label: recipient.label || (recipient.name ? recipient.name + " <" + recipient.email + ">" : recipient.email),
    email: recipient.email || recipient.value,
    name: recipient.name,
    type: recipient.type,
    isGroup: recipient.isGroup,
    groupId: recipient.groupId,
    members: recipient.members
  }))
}
```

## Future Enhancements

Potential improvements could include:

1. **Contact Groups**: Better support for Gmail contact groups
2. **Recent Searches**: Cache and display recent email searches
3. **Email Validation**: Real-time email validation
4. **Bulk Import**: Support for importing email lists
5. **Smart Suggestions**: AI-powered email suggestions based on context
