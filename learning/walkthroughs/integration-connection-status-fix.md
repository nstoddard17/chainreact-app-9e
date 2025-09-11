# Integration Connection Status Fix

## Problem
Integrations were showing as disconnected in the action selection modal even when they were connected in the database. This is a recurring issue that has happened multiple times.

## Date Fixed
January 2025

## Root Cause
The integration configuration IDs (from `INTEGRATION_CONFIGS` in `/lib/integrations/availableIntegrations.ts`) don't always match the provider values stored in the database.

### Examples of Mismatches:
- **Config ID**: `microsoft-onenote` → **Database provider**: `onenote`
- **Config ID**: `google-calendar` → **Database provider**: `google_calendar` (underscore vs hyphen)

## The Fix

### Location
`/components/workflows/CollaborativeWorkflowBuilder.tsx` - `isIntegrationConnected` function (around line 338)

### Key Changes Made

1. **Added Provider Mappings**
   - Created a comprehensive mapping between integration config IDs and their possible database provider values
   - This handles all known variations of provider names

2. **Enhanced Matching Logic**
   - Check exact provider matches
   - Check against a list of possible provider variations
   - Normalize provider names (lowercase, replace hyphens with underscores)
   - Fall back to `getConnectedProviders()` method

3. **Fixed Missing Return Statement**
   - Added missing `return false` after Microsoft services check

### The Complete Fixed Function

```typescript
const isIntegrationConnected = useCallback((integrationId: string): boolean => {
  // System integrations that are always "connected" since they don't require external authentication
  const systemIntegrations = ['core', 'logic', 'ai', 'webhook', 'scheduler', 'manual'];
  if (systemIntegrations.includes(integrationId)) return true;
  
  // Create a mapping of integration config IDs to possible database provider values
  const providerMappings: Record<string, string[]> = {
    'gmail': ['gmail'],
    'google-calendar': ['google-calendar', 'google_calendar'],
    'google-drive': ['google-drive', 'google_drive'],
    'google-sheets': ['google-sheets', 'google_sheets'],
    'google-docs': ['google-docs', 'google_docs'],
    'discord': ['discord'],
    'slack': ['slack'],
    'notion': ['notion'],
    'airtable': ['airtable'],
    'hubspot': ['hubspot'],
    'stripe': ['stripe'],
    'shopify': ['shopify'],
    'trello': ['trello'],
    'microsoft-onenote': ['microsoft-onenote', 'onenote'],
    'microsoft-outlook': ['microsoft-outlook', 'outlook'],
    'microsoft-teams': ['microsoft-teams', 'teams'],
    'onedrive': ['onedrive'],
    'facebook': ['facebook'],
    'instagram': ['instagram'],
    'twitter': ['twitter'],
    'linkedin': ['linkedin'],
  };
  
  // For Google services, check if ANY Google service is connected
  if (integrationId.startsWith('google-') || integrationId === 'gmail') {
    const googleServices = ['google-drive', 'google-sheets', 'google-docs', 'google-calendar', 'gmail',
                            'google_drive', 'google_sheets', 'google_docs', 'google_calendar'];
    const connectedGoogleService = storeIntegrations.find(i => 
      googleServices.includes(i.provider) && 
      i.status === 'connected'
    );
    
    if (connectedGoogleService) {
      return true;
    }
    
    const connectedProviders = getConnectedProviders();
    const hasAnyGoogleConnected = googleServices.some(service => connectedProviders.includes(service));
    if (hasAnyGoogleConnected) {
      return true;
    }
    
    return false;
  }
  
  // For Microsoft services, check if ANY Microsoft service is connected
  if (integrationId.startsWith('microsoft-') || integrationId === 'onedrive') {
    const microsoftServices = ['microsoft-onenote', 'microsoft-outlook', 'microsoft-teams', 'onedrive',
                               'onenote', 'outlook', 'teams'];
    const connectedMicrosoftService = storeIntegrations.find(i => 
      microsoftServices.includes(i.provider) && 
      i.status === 'connected'
    );
    
    if (connectedMicrosoftService) {
      return true;
    }
    
    return false; // IMPORTANT: This was missing before!
  }
  
  // Check if this specific integration exists in the store
  const possibleProviders = providerMappings[integrationId] || [integrationId];
  
  // Check with flexible matching
  const integration = storeIntegrations.find(i => {
    if (i.status !== 'connected') return false;
    
    // Check exact match
    if (i.provider === integrationId) return true;
    
    // Check if provider is in the possible providers list
    if (possibleProviders.includes(i.provider)) return true;
    
    // Check normalized names (handle different casing and separators)
    const normalizedProvider = i.provider.toLowerCase().replace(/-/g, '_');
    const normalizedId = integrationId.toLowerCase().replace(/-/g, '_');
    if (normalizedProvider === normalizedId) return true;
    
    return false;
  });
  
  if (integration) {
    return true;
  }
  
  // Use the getConnectedProviders as fallback
  const connectedProviders = getConnectedProviders();
  const isConnected = possibleProviders.some(provider => connectedProviders.includes(provider));
  
  return isConnected;
}, [storeIntegrations, getConnectedProviders])
```

## Quick Fix Steps

If this issue happens again:

1. **Check the provider value in the database**
   - Look at what's actually stored in the `integrations` table `provider` column
   - Compare with the integration config ID in `/lib/integrations/availableIntegrations.ts`

2. **Add to provider mappings if needed**
   - If there's a new integration with a mismatch, add it to the `providerMappings` object
   - Include all possible variations (with/without prefixes, hyphens vs underscores)

3. **Ensure proper return statements**
   - Make sure all conditional blocks return a boolean value
   - Check for missing `return false` statements

4. **Test the fix**
   - Open the action selection modal
   - Check if connected integrations no longer show "Connect" button
   - Verify in browser console that integrations are being found

## Common Pitfalls to Avoid

1. **Don't assume provider names match config IDs** - They often don't!
2. **Don't forget return statements** - Missing returns cause fall-through to wrong logic
3. **Consider all variations** - Hyphens vs underscores, prefixes, different casing
4. **Check both directions** - The store's `getConnectedProviders()` and direct integration lookup

## Related Files

- `/components/workflows/CollaborativeWorkflowBuilder.tsx` - Contains the `isIntegrationConnected` function
- `/lib/integrations/availableIntegrations.ts` - Defines integration config IDs
- `/stores/integrationStore.ts` - Manages integration state and fetching
- `/app/api/integrations/route.ts` - API endpoint that returns integrations from database

## Prevention

To prevent this issue in the future:

1. **When adding new integrations**, ensure the provider name in the database matches the config ID
2. **If they must differ**, immediately add the mapping to `providerMappings`
3. **Test the integration status** in the action selection modal before committing
4. **Document any new provider name variations** in this file

## Debug Tips

Add temporary logging to see what's happening:
```typescript
console.log('🔍 Checking connection for:', integrationId);
console.log('🔍 Store integrations:', storeIntegrations.map(i => ({ 
  provider: i.provider, 
  status: i.status 
})));
```

This will show you exactly what provider names are in the store vs what's being checked.