# availableNodes.ts Refactoring Plan

## Current State Analysis
- **File Size**: 8,916 lines (way over acceptable limits)
- **Providers**: 37 unique providers
- **Dependencies**: 23 files import from availableNodes.ts
- **Structure**: Single monolithic array export with all node definitions

## Refactoring Strategy

### Phase 1: Create Module Structure
Create the following directory structure:
```
/lib/workflows/nodes/
├── types.ts              # Shared types (ConfigField, NodeField, etc.)
├── constants.ts          # Shared constants
├── providers/            # Provider-specific nodes
│   ├── logic/
│   │   ├── index.ts      # Logic provider nodes
│   │   └── types.ts      # Logic-specific types
│   ├── ai/
│   │   ├── index.ts      # AI provider nodes
│   │   └── types.ts      # AI-specific types
│   ├── gmail/
│   │   ├── index.ts      # Gmail nodes
│   │   └── types.ts      # Gmail-specific types
│   ├── google-calendar/
│   │   ├── index.ts
│   │   └── types.ts
│   ├── google-drive/
│   │   ├── index.ts
│   │   └── types.ts
│   ├── google-sheets/
│   │   ├── index.ts
│   │   └── types.ts
│   ├── slack/
│   │   ├── index.ts
│   │   └── types.ts
│   ├── discord/
│   │   ├── index.ts
│   │   └── types.ts
│   ├── notion/
│   │   ├── index.ts
│   │   └── types.ts
│   ├── airtable/
│   │   ├── index.ts
│   │   └── types.ts
│   ├── hubspot/
│   │   ├── index.ts
│   │   └── types.ts
│   ├── github/
│   │   ├── index.ts
│   │   └── types.ts
│   └── [other providers...]
├── utils.ts              # Helper functions for node operations
└── index.ts              # Main export that combines all providers

```

### Phase 2: Extract Provider Nodes
For each provider:
1. Create provider directory
2. Move all nodes with that providerId to provider/index.ts
3. Extract provider-specific types if any
4. Ensure proper imports are maintained

### Phase 3: Create Aggregator Index
The main index.ts will:
1. Import all provider nodes
2. Combine them into ALL_NODE_COMPONENTS array
3. Export the same interface as current availableNodes.ts

### Phase 4: Update Imports
Update all 23 files that import from availableNodes.ts to import from new structure.

## Provider Node Counts (estimated)
Based on the providers found:
- logic: Multiple nodes (conditions, branches, delays)
- ai: AI agent nodes
- gmail: Send, add label, search, etc.
- google-calendar: Create, update, delete events
- google-drive: File operations
- google-sheets: Row operations
- slack: Message, channel operations
- discord: Message, server operations
- notion: Page, database operations
- airtable: Record operations
- hubspot: Contact, deal operations
- github: Issue, PR operations
- And 25+ more providers

## Migration Order
1. **High Priority** (most complex/used):
   - logic (core functionality)
   - ai (complex configurations)
   - gmail (heavily integrated)
   - slack (popular integration)
   
2. **Medium Priority**:
   - google-* services
   - notion
   - discord
   - airtable
   
3. **Lower Priority**:
   - Other integrations

## Risk Mitigation
1. Keep original file intact until migration complete
2. Test each provider after extraction
3. Run type checking after each phase
4. Verify no circular dependencies introduced
5. Check that all dynamic field mappings still work

## Success Criteria
- [ ] No single file over 500 lines
- [ ] Clear provider boundaries
- [ ] All existing functionality preserved
- [ ] Type safety maintained
- [ ] No performance degradation
- [ ] All tests pass
- [ ] Build succeeds without errors