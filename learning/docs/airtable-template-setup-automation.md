# Airtable Template Setup Automation

## Overview

This document describes the automated Airtable setup system for workflow templates. The system allows templates to include Airtable table schema definitions that users can download as CSV files or setup guides, making it easy to configure required Airtable bases for templates.

## Problem Solved

**Before:** Users would encounter errors like "Unknown field name" when using templates that required Airtable tables, because:
- Field names didn't match exactly what the template expected
- Users had to manually figure out which fields were needed
- No documentation existed for required table structure
- Trial and error was required to get templates working

**After:**
- Templates include complete Airtable schema definitions
- Users can download CSV files to import directly into Airtable
- Detailed setup guides are automatically generated
- Field types, options, and descriptions are documented
- Visual UI shows exactly what's required before using the template

## Architecture

### 1. Schema Definition (Type System)

**File:** `/lib/templates/predefinedTemplates.ts`

Three new TypeScript interfaces define Airtable schemas:

```typescript
interface AirtableFieldSchema {
  name: string
  type: 'singleLineText' | 'longText' | 'singleSelect' | 'multipleSelects' | 'number' | 'email' | 'url' | 'checkbox' | 'date' | 'phoneNumber' | 'multipleAttachments'
  options?: string[] // For select fields
  description?: string // Helpful description
}

interface AirtableTableSchema {
  tableName: string
  description?: string
  fields: AirtableFieldSchema[]
}

interface PredefinedTemplate {
  // ... existing fields
  airtableSetup?: {
    baseName: string // Suggested base name
    tables: AirtableTableSchema[]
  }
}
```

**Why this design:**
- Optional `airtableSetup` property maintains backward compatibility
- Strongly typed to prevent errors
- Self-documenting - field types map directly to Airtable field types
- Extensible - easy to add new field types or properties

### 2. CSV Generation Utility

**File:** `/lib/templates/airtableSetupGenerator.ts`

Provides three main functions:

#### `generateAirtableCSV(table: AirtableTableSchema): string`
Creates a CSV file with:
- Header row: Field names
- Sample row: Type hints (e.g., "Single select: Low/Medium/High")

**CSV Format Example:**
```csv
Ticket Summary,Priority,Status,Channel
(Long text),(Single select: Low/Medium/High),(Single select: Open/In Progress/Resolved/Closed),(Single line text)
```

**Why CSV:**
- Airtable supports CSV import natively
- Simple format, no external dependencies
- Users can easily review and modify if needed

#### `generateSetupGuide(baseName, tables): string`
Creates a markdown guide with:
- Quick setup instructions for CSV import
- Manual setup instructions with detailed tables
- Field specifications in markdown tables
- Post-setup configuration steps
- Troubleshooting tips

**Why markdown:**
- Readable in any text editor
- Renders nicely on GitHub and in docs
- Can be converted to PDF or other formats
- Easy to copy/paste instructions

#### `generateSetupPackage(baseName, tables): object`
Returns both CSV files and markdown guide in a single package.

### 3. API Endpoint

**File:** `/app/api/templates/[id]/airtable-setup/route.ts`

RESTful API with multiple response formats:

#### GET `/api/templates/{id}/airtable-setup`
Returns JSON with setup information:
```json
{
  "baseName": "Customer Service Automation",
  "tables": [...],
  "csvFiles": [
    {
      "tableName": "Support Tickets",
      "filename": "customer-service-automation-support-tickets.csv",
      "downloadUrl": "/api/templates/{id}/airtable-setup?table=Support+Tickets"
    }
  ],
  "guideDownloadUrl": "/api/templates/{id}/airtable-setup?file=guide"
}
```

#### GET `/api/templates/{id}/airtable-setup?table={tableName}`
Returns CSV file for specific table with proper headers:
```
Content-Type: text/csv
Content-Disposition: attachment; filename="customer-service-automation-support-tickets.csv"
```

#### GET `/api/templates/{id}/airtable-setup?file=guide`
Returns markdown guide with proper headers:
```
Content-Type: text/markdown
Content-Disposition: attachment; filename="customer-service-automation-setup-guide.md"
```

**Error handling:**
- 404 if template doesn't exist
- 404 if template has no Airtable setup
- 404 if requested table not found
- 500 for generation errors

### 4. UI Component

**File:** `/components/templates/AirtableSetupPanel.tsx`

React component that displays in template preview modal.

**Features:**
- Fetches setup info from API on mount
- Shows nothing if template doesn't require Airtable
- Color-coded alert panel (blue) indicates Airtable required
- Quick setup instructions with step-by-step guide
- Download button for complete setup guide
- List of all required tables with:
  - Table name and description
  - Field count badge
  - Download CSV button for each table
  - Expandable field details
- Important notes section (amber alert)
- Loading and error states

**User Experience:**
1. User opens template preview modal
2. If template needs Airtable, blue panel appears
3. User can:
   - Read quick setup instructions
   - Download all CSV files individually
   - Download complete markdown guide
   - Expand each table to see field details
4. User follows instructions to set up Airtable
5. User returns to configure workflow nodes

### 5. Integration Point

**File:** `/components/templates/TemplatePreviewModal.tsx`

The `AirtableSetupPanel` is integrated into the template preview modal between the workflow visualization and the tags section. This placement ensures users see setup requirements before trying to use the template.

## Example: AI Agent Test Workflow - Customer Service

This template now includes complete Airtable setup for three tables:

### Table 1: Support Tickets
- **Ticket Summary** (Long text) - AI-generated summary
- **Priority** (Single select: Low/Medium/High) - AI-assigned priority
- **Status** (Single select: Open/In Progress/Resolved/Closed) - Current status
- **Channel** (Single line text) - Source channel name

### Table 2: Feedback Log
- **Feedback Insight** (Long text) - AI-extracted insight
- **Sentiment** (Single line text) - Sentiment analysis
- **Source** (Single line text) - Origin of feedback

### Table 3: Newsletter Subscribers
- **Name** (Single line text) - Subscriber's name
- **Email** (Email) - Email address
- **Source** (Single line text) - Signup source
- **Status** (Single select: Subscribed/Unsubscribed/Pending) - Status

## Adding Airtable Setup to New Templates

To add Airtable setup to a new template:

1. **Define the schema in predefinedTemplates.ts:**

```typescript
{
  id: "my-template",
  name: "My Template",
  // ... other template properties
  airtableSetup: {
    baseName: "My Automation Base",
    tables: [
      {
        tableName: "Contacts",
        description: "Stores contact information",
        fields: [
          {
            name: "Name",
            type: "singleLineText",
            description: "Full name of the contact"
          },
          {
            name: "Status",
            type: "singleSelect",
            options: ["Active", "Inactive"],
            description: "Current status"
          }
        ]
      }
    ]
  }
}
```

2. **That's it!** The system automatically:
   - Generates CSV files for download
   - Creates setup guide
   - Shows UI panel in template preview
   - Provides API endpoints for file downloads

## Benefits

### For Users
- **Faster setup** - Download CSVs and import instead of manual creation
- **Fewer errors** - Exact field names and types documented
- **Better onboarding** - Clear instructions and visual UI
- **Self-service** - Complete guide available for download

### For Developers
- **Easy to add** - Just define the schema in TypeScript
- **Type-safe** - TypeScript catches errors at compile time
- **Maintainable** - Schema lives with template definition
- **Scalable** - Works for any number of tables and fields

### For Platform
- **Professional** - Polished user experience
- **Reduces support** - Clear documentation prevents issues
- **Reusable** - Pattern works for any template
- **Extensible** - Easy to add more features (e.g., API-based setup)

## Future Enhancements

Potential improvements:

1. **Direct API Integration**
   - Auto-create Airtable base via API
   - One-click setup instead of manual import

2. **Template Validation**
   - Verify user's Airtable base matches schema
   - Show warnings if fields are missing

3. **Schema Export/Import**
   - Export schema from existing workflow
   - Import schema from Airtable base

4. **Multi-Provider Support**
   - Extend pattern to Google Sheets
   - Support Notion database setup
   - Any provider with table structures

5. **Visual Schema Builder**
   - UI to create schemas without code
   - Drag-and-drop field configuration

## Implementation Timeline

**January 2025** - Initial implementation
- Added type definitions
- Created CSV generation utility
- Built API endpoint
- Developed UI component
- Integrated into template preview
- Added schema to AI Agent Test Workflow template

## Testing

To test the implementation:

1. Open workflow builder
2. Click "Templates" button
3. Select "AI Agent Test Workflow - Customer Service"
4. Scroll down to see blue Airtable Setup panel
5. Click "Download Complete Setup Guide" to get markdown guide
6. Click "CSV" button on any table to download that table's CSV
7. Expand table to see field details
8. Follow instructions to set up in Airtable

## Troubleshooting

### Panel doesn't show
- Check if template has `airtableSetup` property defined
- Check browser console for API errors
- Verify template ID is correct

### CSV doesn't download
- Check browser console for errors
- Verify API endpoint is accessible
- Check Content-Disposition headers in network tab

### Field types don't match
- Update schema in predefinedTemplates.ts
- Rebuild and restart dev server
- Clear browser cache

### Import fails in Airtable
- Verify CSV format (comma-separated, no extra commas)
- Check that field names don't have special characters
- Ensure select options are properly formatted

## Related Files

- `/lib/templates/predefinedTemplates.ts` - Schema definitions
- `/lib/templates/airtableSetupGenerator.ts` - CSV/guide generation
- `/app/api/templates/[id]/airtable-setup/route.ts` - API endpoint
- `/components/templates/AirtableSetupPanel.tsx` - UI component
- `/components/templates/TemplatePreviewModal.tsx` - Integration point
- `/learning/docs/airtable-template-setup-automation.md` - This document

## References

- Airtable CSV Import: https://support.airtable.com/docs/csv-import-extension
- Next.js API Routes: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
- React Hooks: https://react.dev/reference/react
