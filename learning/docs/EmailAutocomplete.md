---
title: Email Autocomplete Component
date: 2024-12-19
component: EmailAutocomplete
---

# Email Autocomplete Component

The Email Autocomplete component provides an enhanced email input experience for the Gmail send email configuration modal. It displays a list of recent emails and contacts when users click into the field, with real-time filtering as they type.

## Features

### Immediate Suggestions Display
- Shows suggestions immediately when the user clicks into the field
- Displays even when the input is empty
- Prioritizes contacts over recent emails

### Smart Filtering
- Filters suggestions as the user types
- Searches both email addresses and contact names
- Maintains dropdown open during multiple selection

### Multiple Email Support
- Supports adding multiple email addresses
- Shows selected emails as removable badges
- Allows manual email entry alongside suggestions

### Contact Integration
- Fetches Gmail contacts via People API
- Extracts recent email addresses from inbox and sent folders
- Categorizes suggestions into sections (Contacts, Recent Contacts, Other Emails)

## Usage

```tsx
<EmailAutocomplete
  value={value}
  onChange={handleChange}
  suggestions={dynamicOptions[field.dynamic] || []}
  placeholder="Enter recipient email addresses..."
  multiple={true}
  isLoading={loadingDynamic}
/>
```

## Data Structure

The component expects suggestions in this format:

```typescript
interface EmailSuggestion {
  value: string
  label: string
  email: string
  name?: string
  type?: 'contact' | 'recent'
  isGroup?: boolean
  members?: { email: string; name?: string }[]
}
```

## API Integration

The component works with the `gmail-enhanced-recipients` dynamic data source which:

1. Fetches Gmail contacts via People API
2. Extracts recent email addresses from inbox/sent folders
3. Combines and prioritizes the data
4. Returns structured suggestions for the autocomplete

## Keyboard Navigation

- **Arrow Down/Up**: Navigate through suggestions
- **Enter**: Select highlighted suggestion or add manual email
- **Escape**: Close dropdown
- **Backspace**: Remove last selected email (in multiple mode)
- **Comma/Tab**: Add current input as email

## Styling

The component uses Tailwind CSS classes and integrates with the existing design system. It includes:

- Responsive dropdown with sections
- Loading states
- Error handling
- Accessibility features (ARIA attributes)
