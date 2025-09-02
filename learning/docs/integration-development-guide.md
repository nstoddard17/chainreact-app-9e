# Integration Development Guide

## Overview

This guide provides a complete walkthrough for adding new integrations to ChainReact following the refactored architecture. After the major refactoring of `useDynamicOptions`, we now have a clean, modular pattern that makes adding new providers straightforward.

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Step-by-Step Integration Guide](#step-by-step-integration-guide)
3. [Common Patterns](#common-patterns)
4. [Testing Your Integration](#testing-your-integration)
5. [Troubleshooting](#troubleshooting)

## Architecture Overview

### Current Structure After Refactoring

```
components/workflows/configuration/
├── hooks/
│   ├── useDynamicOptions.ts (legacy - 1,234 lines)
│   └── useDynamicOptionsRefactored.ts (new - 343 lines)
├── providers/
│   ├── discord/
│   │   └── discordOptionsLoader.ts
│   ├── airtable/
│   │   └── airtableOptionsLoader.ts
│   ├── [your-provider]/
│   │   └── [provider]OptionsLoader.ts
│   ├── types.ts (interfaces)
│   └── registry.ts (provider registration)
├── config/
│   └── fieldMappings.ts (field-to-resource mappings)
└── utils/
    ├── fieldFormatters.ts (data formatting)
    ├── requestManager.ts (request handling)
    └── cacheManager.ts (caching layer)
```

## Step-by-Step Integration Guide

### Step 1: Define Your Integration in availableNodes.ts

First, add your integration's actions and triggers to `lib/workflows/availableNodes.ts`:

```typescript
// Example: Adding a Notion integration
{
  id: 'notion_action_create_page',
  type: 'action',
  category: 'Notion',
  name: 'Create Page',
  description: 'Create a new page in Notion',
  icon: NotionIcon,
  color: 'bg-black',
  textColor: 'text-white',
  providerId: 'notion',
  fields: [
    {
      name: 'databaseId',
      label: 'Database',
      type: 'select',
      required: true,
      dynamic: true, // This triggers dynamic loading
      placeholder: 'Select a database'
    },
    {
      name: 'title',
      label: 'Page Title',
      type: 'text',
      required: true
    },
    // Add more fields as needed
  ],
  schema: z.object({
    databaseId: z.string().min(1, 'Database is required'),
    title: z.string().min(1, 'Title is required')
  })
}
```

### Step 2: Add Field Mappings

Update `components/workflows/configuration/config/fieldMappings.ts`:

```typescript
// Add your provider's field mappings
const notionMappings: Record<string, FieldMapping> = {
  notion_action_create_page: {
    databaseId: "notion_databases",
    parentPage: "notion_pages",
  },
  notion_action_update_page: {
    pageId: "notion_pages",
    databaseId: "notion_databases",
  },
  // Add more as needed
};

// Don't forget to add to the main export
export const fieldToResourceMap: NodeFieldMappings = {
  ...existingMappings,
  ...notionMappings,
  default: defaultMappings,
};
```

### Step 3: Create Provider Options Loader

Create `components/workflows/configuration/providers/notion/notionOptionsLoader.ts`:

```typescript
import { ProviderOptionsLoader, LoadOptionsParams, FormattedOption } from '../types';

export class NotionOptionsLoader implements ProviderOptionsLoader {
  private supportedFields = [
    'databaseId',
    'pageId',
    'parentPage',
    // Add all fields that need dynamic loading
  ];

  canHandle(fieldName: string, providerId: string): boolean {
    return providerId === 'notion' && this.supportedFields.includes(fieldName);
  }

  async loadOptions(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { fieldName, integrationId, signal, dependsOnValue } = params;

    switch (fieldName) {
      case 'databaseId':
        return this.loadDatabases(params);
      
      case 'pageId':
        return this.loadPages(params);
      
      case 'parentPage':
        return this.loadParentPages(params);
      
      default:
        return [];
    }
  }

  private async loadDatabases(params: LoadOptionsParams): Promise<FormattedOption[]> {
    const { integrationId, signal } = params;
    
    if (!integrationId) {
      console.log('🔍 [Notion] Cannot load databases without integrationId');
      return [];
    }

    try {
      const response = await fetch('/api/integrations/notion/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          integrationId,
          dataType: 'notion_databases',
          options: {}
        }),
        signal
      });

      if (!response.ok) {
        throw new Error(`Failed to load databases: ${response.status}`);
      }

      const result = await response.json();
      const databases = result.data || [];

      return databases.map((db: any) => ({
        value: db.id,
        label: db.title || db.name || db.id,
        icon: db.icon,
        properties: db.properties // Store for later use
      }));
    } catch (error) {
      console.error('❌ [Notion] Error loading databases:', error);
      return [];
    }
  }

  private async loadPages(params: LoadOptionsParams): Promise<FormattedOption[]> {
    // Implementation for loading pages
    // Similar pattern to loadDatabases
    return [];
  }

  private async loadParentPages(params: LoadOptionsParams): Promise<FormattedOption[]> {
    // Implementation for loading parent pages
    return [];
  }

  // Define field dependencies
  getFieldDependencies(fieldName: string): string[] {
    switch (fieldName) {
      case 'pageId':
        return ['databaseId']; // Pages depend on selected database
      
      default:
        return [];
    }
  }
}
```

### Step 4: Register Your Provider

Update `components/workflows/configuration/providers/registry.ts`:

```typescript
import { NotionOptionsLoader } from './notion/notionOptionsLoader';

class ProviderRegistryImpl implements IProviderRegistry {
  private registerDefaultLoaders(): void {
    // Existing registrations...
    
    // Add your new provider
    this.register('notion', new NotionOptionsLoader());
  }
}
```

### Step 5: Create API Data Handler

Create the backend handler at `app/api/integrations/notion/data/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const { integrationId, dataType, options } = await request.json();
    
    // Verify user has access to this integration
    const supabase = createRouteHandlerClient({ cookies });
    const { data: integration } = await supabase
      .from('integrations')
      .select('*')
      .eq('id', integrationId)
      .single();

    if (!integration) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
    }

    // Handle different data types
    switch (dataType) {
      case 'notion_databases':
        return handleGetDatabases(integration);
      
      case 'notion_pages':
        return handleGetPages(integration, options);
      
      default:
        return NextResponse.json({ error: 'Unknown data type' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error in Notion data handler:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function handleGetDatabases(integration: any) {
  // Make API call to Notion
  const response = await fetch('https://api.notion.com/v1/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${integration.access_token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      filter: { property: 'object', value: 'database' }
    })
  });

  const data = await response.json();
  
  // Format the response
  const databases = data.results.map((db: any) => ({
    id: db.id,
    title: db.title?.[0]?.plain_text || 'Untitled',
    icon: db.icon,
    properties: db.properties
  }));

  return NextResponse.json({ data: databases });
}
```

### Step 6: Add Custom Field Formatters (if needed)

If your provider has unique field types, add formatters to `components/workflows/configuration/utils/fieldFormatters.ts`:

```typescript
function formatNotionDatabase(data: any[]): FormattedOption[] {
  return data.map((item: any) => ({
    value: item.id,
    label: item.title || 'Untitled',
    icon: item.icon?.emoji || item.icon?.url,
    properties: item.properties,
    createdTime: item.created_time,
    lastEditedTime: item.last_edited_time
  }));
}

// Add to the fieldFormatters mapping
const fieldFormatters: Record<string, (data: any[]) => FormattedOption[]> = {
  // ... existing formatters
  databaseId: formatNotionDatabase,
  pageId: formatNotionPage,
};
```

### Step 7: Implement Action Handler

Create the action handler at `lib/workflows/actions/notion/createPage.ts`:

```typescript
export async function createNotionPage(
  nodeData: any,
  executionData: any,
  integration: any
) {
  const { databaseId, title, properties } = nodeData;

  try {
    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${integration.access_token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        parent: { database_id: databaseId },
        properties: {
          title: {
            title: [{
              text: { content: title }
            }]
          },
          ...properties
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Notion API error: ${response.status}`);
    }

    const page = await response.json();
    
    return {
      success: true,
      data: {
        pageId: page.id,
        url: page.url,
        createdTime: page.created_time
      }
    };
  } catch (error) {
    console.error('Error creating Notion page:', error);
    throw error;
  }
}
```

### Step 8: Register Action Handler

Update `lib/workflows/executeNode.ts`:

```typescript
import { createNotionPage } from './actions/notion/createPage';

// In the executeNode function, add your handler
case 'notion_action_create_page':
  result = await createNotionPage(nodeData, executionData, integration);
  break;
```

## Common Patterns

### Pattern 1: Dependent Fields

When field B depends on field A:

```typescript
getFieldDependencies(fieldName: string): string[] {
  switch (fieldName) {
    case 'childField':
      return ['parentField'];
    default:
      return [];
  }
}
```

### Pattern 2: Linked/Related Records

For fields that reference records in another table (like Airtable linked records):

```typescript
if (fieldName.startsWith('dynamic_field_')) {
  // Handle dynamic field loading
  const fieldId = fieldName.replace('dynamic_field_', '');
  return this.loadDynamicFieldOptions(fieldId, params);
}
```

### Pattern 3: Caching Expensive Operations

The cache manager automatically handles caching, but you can control TTL:

```typescript
// In useDynamicOptionsRefactored.ts, when setting cache
cacheManager.set(
  cacheKey, 
  options, 
  30 * 60 * 1000, // 30 minutes TTL for expensive operations
  dependencies
);
```

## Testing Your Integration

### 1. Unit Test the Options Loader

```typescript
// providers/notion/__tests__/notionOptionsLoader.test.ts
import { NotionOptionsLoader } from '../notionOptionsLoader';

describe('NotionOptionsLoader', () => {
  const loader = new NotionOptionsLoader();

  test('should handle notion fields', () => {
    expect(loader.canHandle('databaseId', 'notion')).toBe(true);
    expect(loader.canHandle('randomField', 'notion')).toBe(false);
    expect(loader.canHandle('databaseId', 'other')).toBe(false);
  });

  test('should return field dependencies', () => {
    expect(loader.getFieldDependencies('pageId')).toEqual(['databaseId']);
  });
});
```

### 2. Test the API Handler

```typescript
// Use Thunder Client or Postman to test:
POST /api/integrations/notion/data
{
  "integrationId": "your-integration-id",
  "dataType": "notion_databases",
  "options": {}
}
```

### 3. Test in the UI

1. Add a workflow node with your new integration
2. Open the configuration modal
3. Verify dynamic fields load correctly
4. Check that dependent fields update properly
5. Save and execute the workflow

## Troubleshooting

### Issue: Fields Not Loading

**Check:**
1. Field mapping exists in `fieldMappings.ts`
2. Provider loader is registered in `registry.ts`
3. API handler returns data in correct format
4. Integration has valid access token

### Issue: Dependent Fields Not Updating

**Check:**
1. `getFieldDependencies` returns correct dependencies
2. Parent field value is being passed correctly
3. Cache isn't preventing updates (try with `forceRefresh: true`)

### Issue: API Errors

**Check:**
1. Integration credentials are valid
2. API endpoint is correct
3. Request format matches provider's API requirements
4. Error handling is in place

### Issue: TypeScript Errors

**Check:**
1. All imports are correct
2. Types are properly defined
3. Provider implements all required interface methods

## Best Practices

1. **Always Handle Errors Gracefully**
   - Return empty array instead of throwing in options loaders
   - Log errors with context for debugging
   - Provide user-friendly error messages

2. **Optimize API Calls**
   - Use pagination for large datasets
   - Implement proper caching strategies
   - Batch requests when possible

3. **Follow Naming Conventions**
   - Provider IDs: lowercase with hyphens (e.g., 'microsoft-teams')
   - Field names: camelCase (e.g., 'databaseId')
   - Resource types: provider_resource (e.g., 'notion_databases')

4. **Document Your Integration**
   - Add JSDoc comments to functions
   - Document any quirks or limitations
   - Update this guide with provider-specific notes

5. **Test Thoroughly**
   - Test with expired tokens
   - Test with no data
   - Test with large datasets
   - Test cancellation/abort scenarios

## Checklist for New Integration

- [ ] Define nodes in `availableNodes.ts`
- [ ] Add field mappings in `fieldMappings.ts`
- [ ] Create provider options loader
- [ ] Register provider in `registry.ts`
- [ ] Add custom formatters if needed
- [ ] Create API data handler
- [ ] Implement action/trigger handlers
- [ ] Register handlers in `executeNode.ts`
- [ ] Add provider to OAuth config if needed
- [ ] Write unit tests
- [ ] Test in development environment
- [ ] Document any special requirements
- [ ] Update this guide with provider-specific notes

## Time Estimates

Based on the refactored architecture:
- **Simple provider** (1-3 fields): 30-45 minutes
- **Medium provider** (4-8 fields): 1-2 hours  
- **Complex provider** (linked records, dependencies): 2-4 hours
- **With OAuth setup**: Add 1-2 hours

## Next Steps

After implementing your integration:
1. Test all workflows thoroughly
2. Add monitoring for API usage
3. Implement rate limiting if needed
4. Add to provider documentation
5. Create example workflows
6. Add to marketing materials

## Related Documentation

- [Refactoring Guide](./refactoring-guide.md)
- [Field Implementation Guide](./field-implementation-guide.md)
- [Action/Trigger Implementation Guide](./action-trigger-implementation-guide.md)
- [useDynamicOptions Migration Guide](./useDynamicOptions-migration-guide.md)