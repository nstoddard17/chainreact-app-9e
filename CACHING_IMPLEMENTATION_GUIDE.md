# Provider Options Loader Caching - Implementation Guide

## Completion Status

### ✅ Fully Implemented (3 loaders)
1. **GitHubOptionsLoader.ts** - Complete with caching
2. **MondayOptionsLoader.ts** - Complete with caching
3. **AirtableOptionsLoader.ts** - Complete with caching (5 private methods updated)

### ⚠️ Partially Implemented (1 loader)
1. **DiscordOptionsLoader.ts** - loadCommands, loadGuilds, and clearCache done
   - **Still needs**: loadChannels, loadMessages, loadMembers, loadRoles, loadCategories

### ❌ Not Yet Implemented (13 loaders)
1. Google Sheets
2. Google Drive
3. Notion
4. Facebook
5. Dropbox
6. Outlook
7. Teams
8. Google Calendar
9. Microsoft Excel
10. Mailchimp
11. Twitter
12. HubSpot (2 files: hubspotOptionsLoader.ts, hubspotDynamicOptionsLoader.ts)
13. OneNote
14. AI

---

## Implementation Pattern

Follow this exact pattern for EACH private load method (e.g., loadChannels, loadTables, loadBoards, etc.):

### Step 1: Add Imports (at top of file)

```typescript
import { useConfigCacheStore } from '@/stores/configCacheStore';
import { buildCacheKey, getFieldTTL } from '@/lib/workflows/configuration/cache-utils';
```

### Step 2: Add Cache Logic to Each Load Method

#### BEFORE the API call:

```typescript
// Build cache key
const cacheKey = buildCacheKey(
  'provider-id',           // e.g., 'discord', 'notion', 'airtable'
  integrationId,           // from params
  'fieldName',             // e.g., 'channelId', 'tableName'
  { dependency: value }    // OPTIONAL: include dependency values
);
const cacheStore = useConfigCacheStore.getState();

// Force refresh handling
if (forceRefresh) {
  logger.debug(`🔄 [Provider] Force refresh - invalidating cache:`, cacheKey);
  cacheStore.invalidate(cacheKey);
}

// Try cache first
if (!forceRefresh) {
  const cached = cacheStore.get(cacheKey);
  if (cached) {
    logger.debug(`💾 [Provider] Cache HIT for ${fieldName}:`, { cacheKey, count: cached.length });
    return cached;
  }
  logger.debug(`❌ [Provider] Cache MISS for ${fieldName}:`, { cacheKey });
}
```

#### AFTER successful API response (before return):

```typescript
const result = await response.json();
const data = result.data || [];

const formattedData = data.map((item: any) => ({
  value: item.id,
  label: item.name
}));

// Store in cache
const ttl = getFieldTTL(fieldName);
cacheStore.set(cacheKey, formattedData, ttl);
logger.debug(`💾 [Provider] Cached ${formattedData.length} options for ${fieldName} (TTL: ${ttl / 1000}s)`);

return formattedData;
```

### Step 3: Add clearCache Method

```typescript
/**
 * Clear cache
 */
clearCache(): void {
  // If using debounce/pending promises, clear them first
  pendingPromises.clear();
  debounceTimers.forEach(timer => clearTimeout(timer));
  debounceTimers.clear();

  const cacheStore = useConfigCacheStore.getState();
  cacheStore.invalidateProvider('provider-id'); // e.g., 'discord'

  logger.debug('🧹 [Provider] Cache cleared');
}
```

---

## Example: Complete Implementation for Discord loadChannels

**BEFORE:**
```typescript
private async loadChannels(params: LoadOptionsParams): Promise<FormattedOption[]> {
  const { dependsOnValue: guildId, integrationId, signal } = params;

  if (!guildId || !integrationId) {
    return [];
  }

  try {
    const response = await fetch('/api/integrations/discord/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        integrationId,
        dataType: 'discord_channels',
        options: { guildId }
      }),
      signal
    });

    if (!response.ok) {
      throw new Error(`Failed to load channels`);
    }

    const result = await response.json();
    const channels = result.data || [];

    return channels.map(channel => ({
      value: channel.id,
      label: channel.name,
    }));
  } catch (error) {
    logger.error('Error loading channels:', error);
    return [];
  }
}
```

**AFTER:**
```typescript
private async loadChannels(params: LoadOptionsParams): Promise<FormattedOption[]> {
  const { dependsOnValue: guildId, integrationId, forceRefresh, signal } = params;

  if (!guildId || !integrationId) {
    return [];
  }

  // Build cache key
  const cacheKey = buildCacheKey('discord', integrationId, 'channelId', { guildId });
  const cacheStore = useConfigCacheStore.getState();

  // Force refresh handling
  if (forceRefresh) {
    logger.debug(`🔄 [Discord] Force refresh - invalidating cache:`, cacheKey);
    cacheStore.invalidate(cacheKey);
  }

  // Try cache first
  if (!forceRefresh) {
    const cached = cacheStore.get(cacheKey);
    if (cached) {
      logger.debug(`💾 [Discord] Cache HIT for channelId:`, { cacheKey, count: cached.length });
      return cached;
    }
    logger.debug(`❌ [Discord] Cache MISS for channelId:`, { cacheKey });
  }

  try {
    const response = await fetch('/api/integrations/discord/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        integrationId,
        dataType: 'discord_channels',
        options: { guildId }
      }),
      signal
    });

    if (!response.ok) {
      throw new Error(`Failed to load channels`);
    }

    const result = await response.json();
    const channels = result.data || [];

    const formattedChannels = channels.map(channel => ({
      value: channel.id,
      label: channel.name,
    }));

    // Store in cache
    const ttl = getFieldTTL('channelId');
    cacheStore.set(cacheKey, formattedChannels, ttl);
    logger.debug(`💾 [Discord] Cached ${formattedChannels.length} options for channelId (TTL: ${ttl / 1000}s)`);

    return formattedChannels;
  } catch (error) {
    logger.error('Error loading channels:', error);
    return [];
  }
}
```

---

## Provider-Specific Notes

### Discord (`discordOptionsLoader.ts`)
- **Provider ID**: `'discord'`
- **Methods to update**: loadChannels, loadMessages, loadMembers, loadRoles, loadCategories
- **Special case**: loadGuilds uses `'global'` as integrationId since it's not integration-specific
- **Cache key dependencies**:
  - Channels, Members, Roles, Categories: `{ guildId }`
  - Messages: `{ channelId }`

### Google Sheets (`GoogleSheetsOptionsLoader.ts`)
- **Provider ID**: `'google-sheets'`
- **Methods to update**: Check file for all private load methods
- **Cache key dependencies**: Include spreadsheet ID, sheet name as applicable

### Notion (look for file in providers/notion/)
- **Provider ID**: `'notion'`
- **Cache key dependencies**: Database ID, parent page ID as applicable

### Facebook (`facebookOptionsLoader.ts`)
- **Provider ID**: `'facebook'`
- **Cache key dependencies**: Page ID, account ID as applicable

### Dropbox (`dropboxOptionsLoader.ts`)
- **Provider ID**: `'dropbox'`
- **Cache key dependencies**: Folder path as applicable

### Outlook (`OutlookOptionsLoader.ts`)
- **Provider ID**: `'outlook'`
- **Cache key dependencies**: Folder ID, mailbox as applicable

### Teams (`TeamsOptionsLoader.ts`)
- **Provider ID**: `'teams'`
- **Cache key dependencies**: Team ID, channel ID as applicable

### Google Calendar (`GoogleCalendarOptionsLoader.ts`)
- **Provider ID**: `'google-calendar'`
- **Cache key dependencies**: Calendar ID as applicable

### Microsoft Excel (`MicrosoftExcelOptionsLoader.ts`)
- **Provider ID**: `'microsoft-excel'`
- **Cache key dependencies**: Workbook ID, worksheet name as applicable

### Mailchimp (`MailchimpOptionsLoader.ts`)
- **Provider ID**: `'mailchimp'`
- **Cache key dependencies**: List ID, campaign ID as applicable

### Twitter (`TwitterOptionsLoader.ts`)
- **Provider ID**: `'twitter'`
- **Cache key dependencies**: User ID, list ID as applicable

### HubSpot (`hubspotOptionsLoader.ts` and `hubspotDynamicOptionsLoader.ts`)
- **Provider ID**: `'hubspot'`
- **Two files** to update
- **Cache key dependencies**: Object type, property name as applicable

### OneNote (`optionsLoader.ts`)
- **Provider ID**: `'onenote'`
- **Cache key dependencies**: Notebook ID, section ID as applicable

### AI (`AIOptionsLoader.ts`)
- **Provider ID**: `'ai'`
- **Cache key dependencies**: Model type, context as applicable

---

## Checklist for Each Provider

When updating a provider, ensure:

- [ ] Imports added at top of file
- [ ] Each private load method has caching logic BEFORE and AFTER API call
- [ ] `forceRefresh` parameter extracted from params
- [ ] Correct provider ID used in `buildCacheKey()`
- [ ] Dependency values included in cache key options (e.g., `{ guildId }`)
- [ ] `clearCache()` method added
- [ ] Logger messages use correct provider name (e.g., `[Discord]`, `[Notion]`)

---

## Testing After Implementation

1. Open configuration modal for a provider
2. Select options from dropdowns (should see "Cache MISS" logs)
3. Close and reopen modal (should see "Cache HIT" logs)
4. Click refresh icon (should see "Force refresh - invalidating cache" logs)
5. Verify dropdowns still populate correctly

---

## Reference Files

- **Complete implementations**:
  - `/components/workflows/configuration/providers/github/GitHubOptionsLoader.ts`
  - `/components/workflows/configuration/providers/airtable/airtableOptionsLoader.ts`
- **Cache utilities**: `/lib/workflows/configuration/cache-utils.ts`
- **Cache store**: `/stores/configCacheStore.ts`
