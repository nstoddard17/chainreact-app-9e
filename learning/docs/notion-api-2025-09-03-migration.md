# Notion API 2025-09-03 Migration

## Overview

The Notion API version 2025-09-03 introduces multi-source database support, which is a significant architectural change. This document outlines the changes made to support the new API version while maintaining backwards compatibility.

## Key Changes in Notion API 2025-09-03

### Multi-Source Databases

The biggest change is that databases can now have multiple data sources:
- **Old API (2022-06-28)**: One database = one data source
- **New API (2025-09-03)**: One database can have multiple data sources
- **Impact**: Query and update operations now target data sources, not databases

### API Endpoint Changes

1. **Query Database → Query Data Source**
   - Old: `POST /v1/databases/{database_id}/query`
   - New: `PATCH /v1/data_sources/{data_source_id}/query`

2. **Update Database → Update Data Source**
   - Schema changes now target data sources
   - Metadata updates (title/description) still use database endpoint

3. **Create Page**
   - Now supports `data_source_id` as parent type
   - Maintains backwards compatibility with `database_id`

### Webhook Event Changes

- **Old**: `database.schema_updated` event
- **New**: `data_source.schema_updated` event
- **Note**: Both events are sent during transition period

## Implementation Changes

### Files Updated

#### 1. Trigger Lifecycle (`lib/triggers/providers/NotionTriggerLifecycle.ts`)

**Created new file** implementing trigger activation/deactivation with data source support:

- Auto-detects data source IDs from database IDs
- Stores both `databaseId` and `dataSourceId` in trigger resources
- Falls back to database ID if data source fetch fails
- Uses API version 2025-09-03

**Key method:**
```typescript
// Auto-detect data source ID from database
const dbResponse = await fetch(`https://api.notion.com/v1/databases/${databaseId}`, {
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Notion-Version': '2025-09-03'
  }
})

if (dbResponse.ok) {
  const dbData = await dbResponse.json()
  if (dbData.data_sources && dbData.data_sources.length > 0) {
    dataSourceId = dbData.data_sources[0].id
  }
}
```

#### 2. Webhook Processor (`lib/webhooks/processor.ts`)

**Updated** to filter webhooks by data source ID:

```typescript
// Filter by data source ID (new in 2025-09-03)
if (config.dataSourceId && event.eventData.data?.parent?.data_source_id) {
  if (event.eventData.data.parent.data_source_id !== config.dataSourceId) {
    return false
  }
}

// Fallback: Filter by database if specified (backwards compatibility)
if (config.database) {
  const eventDatabaseId = event.eventData.databaseId ||
                         event.eventData.data?.parent?.id ||
                         event.eventData.entity?.id
  if (eventDatabaseId && eventDatabaseId !== config.database) {
    return false
  }
}
```

#### 3. Get Pages Action (`lib/workflows/actions/notion/getPages.ts`)

**Major update** to support both database and data source queries:

- Auto-detects data source ID if only database ID provided
- Uses correct endpoint based on ID type:
  - Data source: `PATCH /v1/data_sources/{id}/query`
  - Database: `POST /v1/databases/{id}/query` (fallback)
- Returns `dataSourceId` in output for chaining

```typescript
// Determine which endpoint to use
const endpoint = useDataSourceEndpoint
  ? `https://api.notion.com/v1/data_sources/${targetId}/query`
  : `https://api.notion.com/v1/databases/${targetId}/query`

const response = await fetch(endpoint, {
  method: useDataSourceEndpoint ? 'PATCH' : 'POST',
  headers: {
    'Notion-Version': '2025-09-03'
  }
})
```

#### 4. API Version Updates

**Updated API version** from `2022-06-28` to `2025-09-03` in:

- `lib/workflows/actions/notion/handlers.ts` - All handler functions
- `lib/workflows/actions/notion/manageDatabase.ts` - Database operations
- `lib/workflows/actions/notion/manageUsers.ts` - User operations
- `lib/workflows/actions/notion.ts` - Legacy action functions
- `lib/workflows/actions/notion/getPageDetails.ts` - Page detail retrieval

#### 5. Trigger Registry (`lib/triggers/index.ts`)

**Added** Notion provider registration:

```typescript
triggerLifecycleManager.registerProvider({
  providerId: 'notion',
  lifecycle: new NotionTriggerLifecycle(),
  requiresExternalResources: true,
  description: 'Notion webhooks for page and database triggers (manual setup required)'
})
```

## Backwards Compatibility

### Automatic Fallbacks

1. **Data Source Detection**: If only database ID is provided, system attempts to fetch and use data source ID
2. **Endpoint Selection**: Falls back to database endpoint if data source ID unavailable
3. **Event Filtering**: Filters by database ID if data source ID not in config
4. **API Graceful Degradation**: Logs warnings but continues operation if data source fetch fails

### Migration Path

**Existing Workflows**:
- Continue to work with database IDs
- System auto-detects data sources when possible
- No immediate action required

**New Workflows**:
- Can explicitly specify data source IDs
- Recommended for multi-source databases
- Better performance and accuracy

## Webhook Setup

### Manual Configuration Required

Notion webhooks require manual setup in the Notion integration settings:

1. Visit https://www.notion.so/my-integrations
2. Select your integration
3. Navigate to Webhooks tab
4. Add webhook URL: `https://your-domain.com/api/webhooks/notion`
5. **Important**: Set API version to **2025-09-03**
6. Subscribe to `data_source` events (not `database` events)
7. Verify the webhook

### Supported Events

With API version 2025-09-03:

- `page.created` - New page created
- `page.content_updated` - Page content changed
- `page.locked` - Page locked
- `page.deleted` - Page deleted
- `data_source.schema_updated` - Database schema changed (replaces `database.schema_updated`)
- `comment.created` - New comment added

## Testing Checklist

### Trigger Testing

- [ ] Create workflow with Notion trigger
- [ ] Activate workflow (should create trigger resources)
- [ ] Verify `trigger_resources` table has both `databaseId` and `dataSourceId`
- [ ] Make change in Notion (create page, update schema, etc.)
- [ ] Verify webhook received and workflow executes
- [ ] Deactivate workflow (should cleanup trigger resources)

### Action Testing

- [ ] Query pages from database (should auto-detect data source)
- [ ] Create page in database
- [ ] Update existing page
- [ ] Verify all actions use API version 2025-09-03

### Multi-Source Database Testing

For databases with multiple data sources:
- [ ] Verify correct data source is targeted
- [ ] Test filtering works correctly
- [ ] Confirm events only trigger for correct data source

## Known Limitations

1. **Multi-Source Selection**: Currently auto-selects first data source. Future enhancement: allow users to select specific data source.

2. **Manual Webhook Setup**: Notion doesn't provide API for webhook creation. Users must manually configure in Notion dashboard.

3. **Event Aggregation**: Some events (like `page.content_updated`) are aggregated and may not fire immediately.

## Future Enhancements

1. **Data Source Picker**: UI field to select specific data source for multi-source databases
2. **Webhook Health Monitoring**: Active monitoring of webhook delivery and error rates
3. **Event Type Customization**: Allow users to select specific event types per trigger
4. **Automatic Data Source Sync**: Periodically refresh data source mappings

## Troubleshooting

### Trigger Not Firing

**Check**:
1. Workflow status is "active"
2. `trigger_resources` table has entry with correct IDs
3. Webhook is verified in Notion integration settings
4. API version is set to 2025-09-03 in Notion webhook config
5. Event type matches trigger configuration

**Debug Steps**:
```bash
# Check trigger resources
SELECT * FROM trigger_resources WHERE provider = 'notion'

# Check webhook events
SELECT * FROM webhook_events
WHERE provider = 'notion'
ORDER BY timestamp DESC LIMIT 10

# Check logs for webhook processing
# Look for: "📝 [Notion Trigger]" log entries
```

### Data Source ID Not Detected

**Possible Causes**:
- Database has no data sources yet (new API migration)
- Access token doesn't have permission to read database
- Network timeout during data source fetch

**Fallback Behavior**:
- System continues with database ID
- Warning logged: "⚠️ Failed to fetch data source, using database ID fallback"
- Webhooks filtered by database ID instead

### Webhook Events Not Matching Workflow

**Check Filter Configuration**:
```typescript
// In processor.ts, add debug logging:
logger.debug('Webhook filter check:', {
  configDataSourceId: config.dataSourceId,
  eventDataSourceId: event.eventData.data?.parent?.data_source_id,
  configDatabaseId: config.database,
  eventDatabaseId: event.eventData.databaseId
})
```

## Migration Timeline

- **January 2025**: Notion API 2025-09-03 released
- **Current**: ChainReact updated to support new API
- **Next 6 months**: Transition period (both API versions supported)
- **After 6 months**: Notion may deprecate old API version

## References

- [Notion API 2025-09-03 Documentation](https://developers.notion.com/reference/intro)
- [Multi-Source Database Guide](https://developers.notion.com/docs/working-with-databases)
- [Webhook Setup Guide](https://developers.notion.com/docs/create-a-notion-integration#give-your-integration-the-right-capabilities)

## Contact

For issues or questions:
- Check webhook event logs in Supabase
- Review trigger lifecycle logs
- Consult `/learning/docs/action-trigger-implementation-guide.md`
