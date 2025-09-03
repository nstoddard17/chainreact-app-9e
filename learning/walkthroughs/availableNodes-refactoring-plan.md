# availableNodes.ts Refactoring Plan

## Current State
- **File Size**: 8,838 lines (328KB)
- **Location**: `/lib/workflows/availableNodes.ts`
- **Content**: All workflow node definitions for 20+ providers in a single file

## Problems
1. **Unmaintainable**: Finding specific nodes requires searching through 8,838 lines
2. **Poor Developer Experience**: Multiple developers can't work on different providers without conflicts
3. **Performance**: Entire file must be parsed even if only one provider is needed
4. **Testing Difficulty**: Can't test individual providers in isolation
5. **Code Organization**: No clear separation between providers

## Proposed Solution

### Directory Structure
```
/lib/workflows/nodes/
├── index.ts                 # Main export file with ALL_NODE_COMPONENTS
├── types.ts                 # Shared types (NodeComponent, NodeField, etc.)
├── registry.ts              # Node registration system
├── providers/
│   ├── gmail/
│   │   ├── index.ts        # Gmail exports
│   │   ├── triggers.ts     # Gmail triggers (~200 lines)
│   │   ├── actions.ts      # Gmail actions (~300 lines)
│   │   └── constants.ts    # Gmail-specific constants
│   ├── slack/
│   │   ├── index.ts
│   │   ├── triggers.ts     # Slack triggers (~400 lines)
│   │   └── actions.ts      # Slack actions (~350 lines)
│   ├── discord/
│   │   ├── index.ts
│   │   ├── triggers.ts     # Discord triggers (~250 lines)
│   │   └── actions.ts      # Discord actions (~400 lines)
│   ├── notion/
│   │   ├── index.ts
│   │   ├── triggers.ts     # Notion triggers (~300 lines)
│   │   └── actions.ts      # Notion actions (~350 lines)
│   ├── airtable/
│   │   ├── index.ts
│   │   ├── triggers.ts     # Airtable triggers (~150 lines)
│   │   └── actions.ts      # Airtable actions (~600 lines)
│   ├── google-sheets/
│   │   ├── index.ts
│   │   ├── triggers.ts     # Google Sheets triggers (~200 lines)
│   │   └── actions.ts      # Google Sheets actions (~400 lines)
│   ├── google-calendar/
│   │   ├── index.ts
│   │   ├── triggers.ts     # Calendar triggers (~150 lines)
│   │   └── actions.ts      # Calendar actions (~200 lines)
│   ├── google-drive/
│   │   ├── index.ts
│   │   ├── triggers.ts     # Drive triggers (~100 lines)
│   │   └── actions.ts      # Drive actions (~150 lines)
│   ├── google-docs/
│   │   ├── index.ts
│   │   ├── triggers.ts     # Docs triggers (~150 lines)
│   │   └── actions.ts      # Docs actions (~250 lines)
│   ├── social/
│   │   ├── twitter/
│   │   │   ├── index.ts
│   │   │   ├── triggers.ts # Twitter triggers (~150 lines)
│   │   │   └── actions.ts  # Twitter actions (~400 lines)
│   │   ├── facebook/
│   │   │   ├── index.ts
│   │   │   └── actions.ts  # Facebook actions (~200 lines)
│   │   ├── instagram/
│   │   │   ├── index.ts
│   │   │   └── actions.ts  # Instagram actions (~100 lines)
│   │   └── linkedin/
│   │       ├── index.ts
│   │       └── actions.ts  # LinkedIn actions (~150 lines)
│   ├── microsoft/
│   │   ├── outlook/
│   │   │   ├── index.ts
│   │   │   ├── triggers.ts # Outlook triggers (~200 lines)
│   │   │   └── actions.ts  # Outlook actions (~300 lines)
│   │   ├── teams/
│   │   │   ├── index.ts
│   │   │   └── actions.ts  # Teams actions (~150 lines)
│   │   └── onedrive/
│   │       ├── index.ts
│   │       └── actions.ts  # OneDrive actions (~100 lines)
│   ├── automation/
│   │   ├── webhook/
│   │   │   ├── index.ts
│   │   │   └── triggers.ts # Webhook triggers (~100 lines)
│   │   ├── scheduler/
│   │   │   ├── index.ts
│   │   │   └── triggers.ts # Scheduler triggers (~50 lines)
│   │   └── ai-agent/
│   │       ├── index.ts
│   │       └── actions.ts  # AI Agent actions (~200 lines)
│   ├── business/
│   │   ├── hubspot/
│   │   │   ├── index.ts
│   │   │   └── actions.ts  # HubSpot actions (~150 lines)
│   │   ├── stripe/
│   │   │   ├── index.ts
│   │   │   ├── triggers.ts # Stripe triggers (~100 lines)
│   │   │   └── actions.ts  # Stripe actions (~150 lines)
│   │   └── shopify/
│   │       ├── index.ts
│   │       └── actions.ts  # Shopify actions (~100 lines)
│   └── developer/
│       ├── github/
│       │   ├── index.ts
│       │   └── actions.ts  # GitHub actions (~100 lines)
│       └── gitlab/
│           ├── index.ts
│           └── actions.ts  # GitLab actions (~50 lines)
```

## Implementation Steps

### Phase 1: Setup (Current)
1. ✅ Create directory structure
2. ✅ Move shared types to types.ts
3. Create registry system
4. Create index file with imports

### Phase 2: Provider Migration
1. Start with smallest providers (webhook, scheduler)
2. Move to medium providers (twitter, facebook, etc.)
3. Handle large providers (gmail, slack, discord, notion, airtable)
4. Test each provider after migration

### Phase 3: Update Dependencies
1. Update all imports of ALL_NODE_COMPONENTS
2. Update executeNode.ts references
3. Update workflow builder references
4. Update any dynamic imports

### Phase 4: Testing & Validation
1. Run full build
2. Test workflow creation with each provider
3. Test workflow execution
4. Performance comparison

## Benefits

1. **Maintainability**: Each provider in its own module
2. **Scalability**: Easy to add new providers
3. **Performance**: Potential for lazy loading
4. **Testing**: Test providers independently
5. **Collaboration**: Multiple developers can work on different providers
6. **Code Navigation**: Easy to find specific provider code
7. **Reduced Complexity**: ~400 lines per file instead of 8,838

## Risks & Mitigation

### Risk 1: Breaking Imports
- **Mitigation**: Keep backward compatibility with index.ts exporting ALL_NODE_COMPONENTS

### Risk 2: Circular Dependencies
- **Mitigation**: Use registry pattern for cross-provider dependencies

### Risk 3: Build Performance
- **Mitigation**: May actually improve due to better code splitting

## Success Metrics

- [ ] All providers successfully split into modules
- [ ] Build passes without errors
- [ ] All tests pass
- [ ] Workflow creation works for all providers
- [ ] File sizes all under 500 lines
- [ ] No performance regression

## Timeline Estimate

- Phase 1: 30 minutes ✅
- Phase 2: 2-3 hours
- Phase 3: 1 hour
- Phase 4: 1 hour

**Total: 4-5 hours**