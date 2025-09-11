# Coming Soon Integrations Synchronization Issue

## Problem Statement
When marking integrations as "coming soon", they weren't appearing correctly in the workflow builder action/trigger selection modals. The integrations would show as available instead of greyed out with a "Coming soon" badge.

## Root Cause
The application has **duplicate definitions** of `comingSoonIntegrations`:

1. **In `useIntegrationSelection` hook** (`/hooks/workflows/useIntegrationSelection.ts` line 208-227)
   - This is used by the standalone ActionSelectionDialog component
   - Properly maintained with all coming soon integrations

2. **In `CollaborativeWorkflowBuilder` component** (`/components/workflows/CollaborativeWorkflowBuilder.tsx` line 5543-5562)
   - This is used by the inline action/trigger modals in the workflow builder
   - Was missing some integrations (like GitHub)
   - This is where users actually interact with the modals

## The Issue
The workflow builder renders its own modals inline instead of using the standalone `ActionSelectionDialog.tsx` component. This means:
- Changes to the hook's `comingSoonIntegrations` don't affect the workflow builder
- Each location needs to be updated separately
- Easy to miss one location when adding new "coming soon" integrations

## Current Solution (Quick Fix)
Add the integration ID to BOTH locations:

1. In `/hooks/workflows/useIntegrationSelection.ts`:
```typescript
const comingSoonIntegrations = useMemo(() => new Set([
  'beehiiv',
  'github',  // Add here
  'gitlab',
  // ... other integrations
]), [])
```

2. In `/components/workflows/CollaborativeWorkflowBuilder.tsx`:
```typescript
const comingSoonIntegrations = useMemo(() => new Set([
  'beehiiv',
  'github',  // Add here too!
  'gitlab',
  // ... other integrations
]), [])
```

## Better Solution (Implemented January 2025)
The modal rendering has been refactored to eliminate this duplication:

### ✅ Solution Implemented: Use the Hook Everywhere
We chose Option 1 and implemented it as follows:

1. **Added import** in `CollaborativeWorkflowBuilder.tsx`:
```typescript
import { useIntegrationSelection } from "@/hooks/workflows/useIntegrationSelection"
```

2. **Replaced the local definition** (around line 5543) from:
```typescript
// OLD - Local duplicate definition
const comingSoonIntegrations = useMemo(() => new Set([
  'beehiiv',
  'manychat',
  // ... list of integrations
]), []);
```

To:
```typescript
// NEW - Using the hook as single source of truth
const { comingSoonIntegrations: hookComingSoonIntegrations } = useIntegrationSelection();

// Use the hook's coming soon integrations list
const comingSoonIntegrations = hookComingSoonIntegrations;
```

3. **Single source of truth** is now in `/hooks/workflows/useIntegrationSelection.ts` (lines 208-227)

### Why This Solution?
- **Immediate fix** with minimal code changes
- **No breaking changes** to existing functionality
- **Single source of truth** for coming soon integrations
- **Easy to maintain** - only one place to update

### Other Options (Not Implemented)
**Option 2: Create a Shared Constant** - Would work but adds another file to maintain

**Option 3: Extract Modal Components** - Best long-term solution but requires significant refactoring

## How to Add New Coming Soon Integrations (After Refactor)

Now that we've implemented the single source of truth, adding a new "coming soon" integration is simple:

1. **Only update ONE location**: `/hooks/workflows/useIntegrationSelection.ts`
```typescript
const comingSoonIntegrations = useMemo(() => new Set([
  'beehiiv',
  'github',      // Example: GitHub was added here
  'gitlab', 
  'newservice',  // Add your new integration ID here
  // ... other integrations
]), [])
```

2. **That's it!** The integration will automatically appear as "coming soon" in:
   - Workflow Builder Action Selection Modal
   - Workflow Builder Trigger Selection Modal  
   - AI Agent Action Selection Modal
   - Any other component using the `useIntegrationSelection` hook

## Testing the Fix
1. Open the workflow builder
2. Click "Add Action" button
3. Check that the integration appears greyed out with "Coming soon" badge
4. Also verify in the trigger selection modal if applicable

## Related Files
- `/hooks/workflows/useIntegrationSelection.ts` - Hook with coming soon list
- `/components/workflows/CollaborativeWorkflowBuilder.tsx` - Main workflow builder with inline modals
- `/components/workflows/builder/ActionSelectionDialog.tsx` - Standalone dialog (currently unused)
- `/components/workflows/builder/TriggerSelectionDialog.tsx` - Standalone trigger dialog (currently unused)

## Lessons Learned
1. **Always search for duplicate definitions** when functionality isn't working as expected
2. **Check if components are actually being used** - the standalone dialogs exist but aren't imported
3. **Inline modal rendering in large components** leads to maintenance issues
4. **Use the browser's "disable cache" feature** to ensure changes are reflected during development
5. **Add temporary text changes** (like "v2") to verify that code changes are being loaded

## Future Improvements
- Refactor to use a single source of truth for coming soon integrations
- Consider extracting all modal components from CollaborativeWorkflowBuilder
- Add a lint rule or test to ensure synchronization between locations