# Refactoring Guide for ChainReact Codebase

## Overview
This guide provides comprehensive instructions for refactoring large files and modules in the ChainReact codebase. It ensures consistent practices, proper cleanup of legacy code, and maintains functionality while improving code organization.

## Pre-Refactoring Checklist

### 1. Dependency Analysis
Before refactoring any file, complete this analysis:

- [ ] Map all imports FROM the file being refactored
- [ ] Map all files that import the file being refactored
- [ ] Identify all exported types, interfaces, and functions
- [ ] Document all external API dependencies
- [ ] List all database queries and mutations
- [ ] Identify all event handlers and subscriptions
- [ ] Check for circular dependencies

### 2. Type Safety Verification
- [ ] Ensure all TypeScript types are explicitly defined
- [ ] Verify no `any` types are being used without justification
- [ ] Check that all function parameters have proper types
- [ ] Confirm return types are explicitly declared
- [ ] Validate generic type constraints

### 3. Legacy Code Identification
- [ ] Search for deprecated patterns (e.g., old API calls, outdated libraries)
- [ ] Identify commented-out code blocks for removal
- [ ] Find TODO/FIXME comments that need addressing
- [ ] Check for console.log statements that should be removed
- [ ] Look for hardcoded values that should be constants or configuration

## Refactoring Strategy for Large Files (>1000 lines)

### Step 1: Categorize Content
Group related functionality into these categories:

1. **Type Definitions**: Interfaces, types, enums
2. **Constants**: Configuration objects, static data
3. **Utility Functions**: Pure functions, helpers
4. **Core Logic**: Main business logic functions
5. **Integration Handlers**: API handlers, webhook processors
6. **UI Components**: React components, UI-specific logic

### Step 2: Create Module Structure
```
/lib/[module]/
  ├── types.ts           # All TypeScript types and interfaces
  ├── constants.ts       # Static configuration and constants
  ├── utils.ts           # Utility functions
  ├── handlers/          # Integration-specific handlers
  │   ├── [provider].ts
  │   └── index.ts       # Re-exports
  ├── schemas/           # Zod schemas and validation
  │   ├── [entity].ts
  │   └── index.ts
  └── index.ts           # Main exports and orchestration
```

### Step 3: Migration Process
1. **Create new module structure** without deleting original file
2. **Move types first** - they have no runtime dependencies
3. **Move constants second** - they may depend on types
4. **Move utility functions** - they depend on types/constants
5. **Move core logic** - depends on all above
6. **Update imports gradually** - one importing file at a time
7. **Run tests after each major move**
8. **Delete original file only after all imports updated**

## Critical Checks During Refactoring

### Import Path Updates
**CRITICAL**: When moving code to new files, ALL import paths must be updated:

1. **Internal Imports Within Module**
   ```typescript
   // BEFORE (in single file)
   const helper = helperFunction();
   
   // AFTER (in separate files)
   import { helperFunction } from './utils';
   const helper = helperFunction();
   ```

2. **External Imports To Module**
   ```typescript
   // BEFORE
   import { someFunction } from '@/lib/oldFile';
   
   // AFTER
   import { someFunction } from '@/lib/newModule/handlers';
   ```

3. **Dynamic Imports**
   ```typescript
   // Check for dynamic imports that might break
   const module = await import(`@/lib/${dynamicPath}`);
   ```

### Registration Points
**CRITICAL**: Many functions need to be registered in central locations:

1. **Action/Trigger Handlers** must be registered in `executeNode.ts`
   ```typescript
   // In executeNode.ts
   import { newHandler } from '@/lib/newModule/handlers';
   
   const actionHandlers = {
     'provider.action': newHandler,
     // ...
   };
   ```

2. **API Route Handlers** must maintain their export names
   ```typescript
   // Must keep same export name for Next.js routing
   export async function POST(req: Request) { /* ... */ }
   ```

3. **Hook Registrations** in components
   ```typescript
   // Ensure hooks are imported from new location
   import { useNewHook } from '@/lib/newModule/hooks';
   ```

## Common Pitfalls and Solutions

### Pitfall 1: Broken Circular Dependencies
**Problem**: File A imports from File B, and File B imports from File A.

**Solution**: 
- Extract shared types to a separate types file
- Use dependency injection for functions
- Consider if the circular dependency indicates poor architecture

### Pitfall 2: Lost Type Exports
**Problem**: Moving types breaks other files that import them.

**Solution**:
- Always use explicit exports: `export type { MyType }`
- Create index.ts files that re-export all public types
- Use TypeScript's "Find All References" before moving types

### Pitfall 3: Broken Dynamic Field Mappings
**Problem**: Dynamic fields in workflows stop working after refactoring.

**Solution**:
- Check `useDynamicOptions.ts` for field mappings
- Verify handler registration in route files
- Ensure field names match exactly between definition and handler

### Pitfall 4: Missing Handler Registrations
**Problem**: Actions/triggers defined but not executing.

**Solution**:
- Always check `executeNode.ts` for handler registration
- Verify the handler function is properly imported
- Ensure the action key matches exactly

### Pitfall 5: Incorrect Import Paths in Tests
**Problem**: Tests fail due to changed import paths.

**Solution**:
- Update all test file imports
- Check mock implementations for correct paths
- Verify test utilities import from new locations

## Post-Refactoring Validation

### 1. TypeScript Compilation
```bash
npm run build
# Should complete with no errors
```

### 2. Linting
```bash
npm run lint
# Fix any linting issues
```

### 3. Runtime Testing
- [ ] Test all affected workflows
- [ ] Verify all integrations still connect
- [ ] Check that all API endpoints respond correctly
- [ ] Ensure UI components render without errors
- [ ] Test data fetching and mutations

### 4. Import Verification
```bash
# Use grep/ripgrep to find any remaining old imports
rg "from.*oldFileName" --type ts --type tsx
```

### 5. Handler Registration Verification
- [ ] Check executeNode.ts has all action handlers
- [ ] Verify API routes are properly exported
- [ ] Confirm webhook handlers are registered
- [ ] Validate event listeners are attached

## Specific Refactoring Patterns

### Pattern 1: Splitting Node Definitions
When refactoring `availableNodes.ts`:

```typescript
// Before: Single massive object
export const availableNodes = {
  'gmail.send': { /* ... */ },
  'slack.post': { /* ... */ },
  // ... 500+ more nodes
};

// After: Modular structure
// /lib/workflows/nodes/gmail/index.ts
export const gmailNodes = {
  send: { /* ... */ },
  // other gmail nodes
};

// /lib/workflows/nodes/index.ts
import { gmailNodes } from './gmail';
import { slackNodes } from './slack';

export const availableNodes = {
  ...prefixKeys(gmailNodes, 'gmail'),
  ...prefixKeys(slackNodes, 'slack'),
};
```

### Pattern 2: Extracting Action Handlers
```typescript
// Before: Inline in route file
export async function POST(req: Request) {
  const action = req.body.action;
  if (action === 'gmail.send') {
    // 200 lines of gmail logic
  }
}

// After: Separate handler files
// /lib/integrations/gmail/handlers/send.ts
export async function handleGmailSend(data: any) {
  // Gmail send logic
}

// /app/api/route.ts
import { handleGmailSend } from '@/lib/integrations/gmail/handlers/send';

export async function POST(req: Request) {
  const handlers = {
    'gmail.send': handleGmailSend,
  };
  return handlers[req.body.action](req.body.data);
}
```

### Pattern 3: Consolidating Types
```typescript
// Before: Types scattered across files
// file1.ts
interface User { /* ... */ }

// file2.ts  
interface User { /* different definition */ }

// After: Single source of truth
// /types/user.ts
export interface User { /* ... */ }

// All files import from same location
import { User } from '@/types/user';
```

## Documentation Requirements

After completing any refactoring:

1. **Update Import Documentation**
   - Document new import paths in affected files
   - Update any import aliases or barrel exports

2. **Update Architecture Docs**
   - Reflect new module structure in `/learning/docs/`
   - Update component hierarchy if changed

3. **Update CHANGELOG**
   - Record what was refactored and why
   - Note any breaking changes
   - List files affected

4. **Update Social Media Log**
   - Add entry to `/learning/logs/socialMedia.md`
   - Summarize the refactoring improvement

5. **Update This Guide**
   - Add any new pitfalls discovered
   - Document successful patterns used
   - Note any tools or techniques that helped

## Refactoring Tools and Commands

### Useful Commands
```bash
# Find all imports of a file
rg "from.*fileName" --type ts --type tsx

# Find all exports from a file
rg "export" fileName.ts

# Check for circular dependencies
npx madge --circular --extensions ts,tsx .

# Find unused exports
npx ts-prune

# Analyze bundle size impact
npm run build:analyze
```

### VSCode Shortcuts
- `F12` - Go to Definition
- `Shift+F12` - Find All References  
- `F2` - Rename Symbol (updates all references)
- `Ctrl+Shift+O` - Go to Symbol in File
- `Ctrl+T` - Go to Symbol in Workspace

## Emergency Rollback Plan

If refactoring causes critical issues:

1. **Git Stash Current Changes**
   ```bash
   git stash save "Failed refactoring attempt"
   ```

2. **Revert to Last Working Commit**
   ```bash
   git reset --hard HEAD~1
   ```

3. **Document What Went Wrong**
   - Add to pitfalls section
   - Note in CHANGELOG as failed attempt
   - Create issue for future retry

4. **Gradual Retry**
   - Break refactoring into smaller chunks
   - Test each chunk thoroughly
   - Commit working increments frequently

## Success Metrics

A successful refactoring should achieve:

- [ ] **Reduced File Sizes**: No file over 500 lines (ideal), 1000 max
- [ ] **Clear Module Boundaries**: Each module has single responsibility  
- [ ] **No Circular Dependencies**: Clean dependency graph
- [ ] **Improved Type Safety**: No new `any` types introduced
- [ ] **Better Performance**: Bundle size reduced or unchanged
- [ ] **Maintained Functionality**: All features work as before
- [ ] **Enhanced Maintainability**: Easier to find and modify code
- [ ] **Updated Documentation**: All changes reflected in docs

## Notes for Specific File Refactoring

### availableNodes.ts Refactoring Strategy
Due to its massive size (8,916 lines, 247 nodes, 38 providers), this file requires special handling:

#### Discovered Complexity
- **247 total nodes** across 38 different providers
- **23 files** depend on availableNodes.ts
- Providers range from 2 nodes (AI, mailchimp) to 19 nodes (Discord)
- Multiple naming conventions and structural inconsistencies

#### Recommended Phased Approach
1. **Use Hybrid Migration**: Keep original file while gradually extracting
2. **Extract by Priority**: Start with smaller providers for testing
3. **Test Each Phase**: Run build, lint, and runtime tests after each extraction
4. **Document Issues**: Track all pitfalls discovered during migration

See `lib/workflows/nodes/MIGRATION_STRATEGY.md` for detailed plan.

## Lessons Learned from availableNodes.ts Refactoring

### Scale Matters
- **Initial Assumption**: File had ~100 nodes
- **Reality**: 247 nodes across 38 providers
- **Lesson**: Always analyze scale before committing to approach
- **Solution**: Created extraction script to analyze structure first

### Naming Inconsistencies
- **Problem**: Mixed conventions (underscores vs colons)
- **Examples**: `gmail_trigger_new_email` vs `google-drive:new_file_in_folder`
- **Solution**: Standardize during extraction, maintain compatibility layer

### Missing Properties
- **Problem**: Some nodes missing required properties (icons)
- **Examples**: Loop and Delay nodes had no icons
- **Solution**: Add appropriate defaults during extraction

### Type Inconsistencies
- **Problem**: Some nodes have wrong type field
- **Example**: Gmail has node with type "string" instead of action type
- **Solution**: Investigate and fix during extraction

### Duplicate Definitions
- **Problem**: Some providers have duplicate node types
- **Example**: onedrive has duplicate `file_modified` triggers
- **Solution**: Deduplicate during extraction, verify which is correct

### Import Complexity
- **Problem**: Complex import dependencies (metadata, schemas)
- **Example**: Gmail imports ACTION_METADATA from separate files
- **Solution**: Maintain import structure, consolidate where sensible

### Testing Strategy
- **Problem**: Can't test all 247 nodes manually
- **Solution**: 
  1. Type checking with TypeScript
  2. Automated extraction validation
  3. Selective runtime testing of critical paths
  4. Gradual rollout with hybrid approach

### File Organization
- **Problem**: Single file for all providers vs too many small files
- **Solution**: Group by provider, ~10-20 nodes per file maximum
- **Result**: 38 provider files, much more manageable

Remember to update this section with lessons learned after refactoring!