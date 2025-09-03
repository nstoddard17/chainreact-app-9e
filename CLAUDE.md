# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

ChainReact is a workflow automation platform built with Next.js 15, TypeScript, and Supabase. The application allows users to create, manage, and execute automated workflows that integrate with various third-party services like Gmail, Discord, Notion, Slack, and more.

## Development Commands

### Building and Running
```bash
npm run build           # Build for production
npm run build:analyze   # Build with bundle analysis
npm run dev            # Start development server
npm run dev:turbo      # Start development server with Turbo
npm start              # Start production server
npm run lint           # Run ESLint
```

### Token Management
```bash
npm run refresh-tokens              # Refresh expired integration tokens
npm run refresh-tokens:dry-run      # Test token refresh without changes
npm run refresh-tokens:verbose      # Refresh with detailed logging
npm run refresh-tokens:batch       # Batch refresh (50 tokens, 10 per batch)
npm run fix-integrations           # Fix problematic integrations
```

### Git Workflow
**IMPORTANT**: Do NOT make any git commits or push to GitHub unless explicitly asked to do so. This includes:
- No automatic `git commit` commands
- No `git push` commands  
- No local commits unless specifically requested
The user will handle all git operations when they are ready.

## Architecture Overview

### Core Structure
- **Next.js App Router**: Full-stack application using React Server Components
- **Supabase Backend**: PostgreSQL database with real-time subscriptions
- **Authentication**: Supabase Auth with OAuth integrations
- **State Management**: Zustand stores for client-side state
- **UI Framework**: Tailwind CSS with Shadcn/UI components
- **Workflow Engine**: Custom execution engine with node-based workflows

### Key Directories

#### `/app` - Next.js App Router
- API routes for all backend functionality
- Page components and layouts
- Route handlers for integrations, webhooks, workflows

#### `/components` - React Components
- **UI Components**: Reusable components in `/ui` (Shadcn/UI based)
- **Feature Components**: Domain-specific components (workflows, integrations, auth)
- **Layout Components**: AppLayout, Sidebar, TopBar

#### `/lib` - Core Logic
- **Database**: Schema definitions and database utilities
- **Integrations**: OAuth providers, token management, API clients
- **Workflows**: Execution engine, node definitions, configuration
- **Auth**: Authentication utilities and middleware
- **Security**: Encryption, token management, compliance

#### `/stores` - State Management
- Zustand stores for different domains (auth, workflows, integrations)
- Client-side caching and data synchronization

#### `/hooks` - Custom React Hooks
- Integration-specific hooks
- Authentication and permissions
- Workflow and execution management

### Database Schema
Key entities managed through Supabase:
- **Users**: User accounts and profiles
- **Integrations**: OAuth connections to third-party services
- **Workflows**: Node-based automation configurations
- **Executions**: Workflow run history and results
- **Organizations**: Team and collaboration features

### Integration System
The platform supports 20+ integrations including:
- **Communication**: Gmail, Slack, Discord, Microsoft Teams
- **Productivity**: Notion, Google Drive, OneDrive, Trello
- **Business**: HubSpot, Stripe, Airtable, Shopify
- **Social**: Facebook, Twitter, LinkedIn, Instagram

Each integration follows a standard pattern:
1. OAuth authentication flow
2. Token management and refresh
3. API client implementation
4. Webhook handling (where supported)

### Workflow Engine
- **Node-based**: Visual workflow builder using @xyflow/react
- **Execution**: Asynchronous execution with retry logic
- **Scheduling**: Cron jobs and delayed execution support
- **Real-time**: Live collaboration and execution monitoring

## Configuration Notes

### Environment Variables
Required for development:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- Integration-specific OAuth credentials (Google, Microsoft, etc.)

### Development Server
Required for creating the development enviroment:
- If you need to start or refresh a development server use netstat -ano | findstr ":3000" to check
- If there is a listening port then use taskkill /PID  /F to kill what ever is on that port
- Then use npm run dev to run new enviroment

### Cursor Rules
The project includes comprehensive Cursor rules in `.cursor/rules/`:
- **howtocoderules.mdc**: Full-stack development standards
- **learningrules.mdc**: Documentation and learning folder management

### Learning Folder
The `/learning` directory serves as the single source of truth for:
- Component templates and documentation
- Implementation walkthroughs
- Change logs and architectural decisions

## Key Patterns

### Error Handling
- Early returns and guard clauses
- Custom error types for integration failures
- Comprehensive logging and monitoring

### Security
- Token encryption using AES-256
- Row-level security (RLS) policies in Supabase
- Input validation with Zod schemas

### Performance
- React Server Components where possible
- Dynamic imports for code splitting
- Image optimization with WebP/AVIF formats
- Caching strategies for integration data

### Testing
Tests should be written using Jest and React Testing Library when implementing new features. Check existing test patterns in the codebase before writing new tests.

## Documentation Requirements

**⚠️ IMPORTANT REMINDER**: You MUST update documentation after EVERY significant change or feature implementation.

When implementing significant features, fixes, or architectural changes, ALWAYS update the `/learning` directory with:
- Implementation walkthroughs for complex fixes in `/learning/walkthroughs/`
- Architecture documentation in `/learning/docs/`
- Update changelog in `/learning/logs/CHANGELOG.md`
- **Update social media summary in `/learning/logs/socialMedia.md` - YOU HAVE NOT BEEN DOING THIS CONSISTENTLY!**
  - Add new entries at the top
  - Use date headers (e.g., "## August 29, 2025") only ONCE per day
  - If multiple updates on the same day, add them to the existing date section
  - Include brief summary of changes made
  - Explain like a product changelog for customers, not like a pull request
  - Use paragraph form to write the entries. This is for posts for Twitter
  - Delete entries that are older than 8 days
  - This is REQUIRED for tracking progress and communication
- Component templates in `/learning/templates/` if creating reusable patterns

This ensures knowledge is captured for future development work and team collaboration.

## Integration Development

### New Modular Architecture (After September 2025 Refactoring)

When adding new integrations, follow the modular pattern established in the useDynamicOptions refactoring:

1. **Define Integration in availableNodes.ts**
   - Add actions/triggers with proper field definitions
   - Mark dynamic fields with `dynamic: true`
   - Include Zod schemas for validation

2. **Add Field Mappings** in `/components/workflows/configuration/config/fieldMappings.ts`
   - Map field names to resource types
   - Group by provider for organization

3. **Create Provider Options Loader** in `/components/workflows/configuration/providers/[provider]/`
   - Use the template at `/learning/templates/provider-options-loader.template.ts`
   - Implement `ProviderOptionsLoader` interface
   - Handle field dependencies properly

4. **Register Provider** in `/components/workflows/configuration/providers/registry.ts`
   - Import and register your loader
   - Provider will automatically be used by the refactored hook

5. **Create API Data Handler** at `/app/api/integrations/[provider]/data/route.ts`
   - Handle different data types for your provider
   - Return formatted data for dropdowns

6. **Implement Action Handlers** in `/lib/workflows/actions/[provider]/`
   - Create handler functions for each action
   - Register in `executeNode.ts`

7. **Add OAuth Configuration** if needed in `/lib/integrations/oauthConfig.ts`

**Time Estimate**: 30 minutes for simple providers, 2-4 hours for complex ones

For detailed instructions, see `/learning/docs/integration-development-guide.md`

## Workflow Node Development

New workflow nodes should:
1. Follow the pattern in `/lib/workflows/availableNodes.ts`
2. Implement proper TypeScript types
3. Include configuration validation
4. Support variable resolution
5. Handle errors gracefully
6. Provide clear user feedback

### AI-Powered Field Values

Fields in workflow configuration modals can be set to use AI-generated values. When a field is set to AI mode:

1. **AI Placeholder Format**: The field value is stored as `{{AI_FIELD:fieldName}}` 
   - Example: `{{AI_FIELD:subject}}` for an email subject field
   - This placeholder signals the workflow engine to generate the value using AI at runtime

2. **UI Behavior**:
   - Each editable field shows an AI button (robot icon) that toggles AI mode
   - When AI mode is active, the field displays "Defined automatically by AI"
   - Users can cancel AI mode with the X button to return to manual input
   - The recordId field and non-editable fields (computed, auto-number, formula) do not support AI mode

3. **Future Integration**:
   - AI agent nodes will generate values for these placeholders during workflow execution
   - The generated values will automatically slot into the appropriate fields
   - This allows for dynamic, context-aware field population based on workflow data

### Field Dependency Loading Pattern

When implementing dependent fields that show "Loading options..." when their parent field changes (e.g., table field updates when base field changes), follow this exact pattern:

#### Steps to Implement:

1. **Ensure resetOptions is available** in `components/workflows/configuration/ConfigurationForm.tsx`:
   ```typescript
   const {
     dynamicOptions,
     loading: loadingDynamic,
     isInitialLoading,
     loadOptions,
     resetOptions  // Must be included
   } = useDynamicOptions({...})
   ```

2. **In the parent field's change handler**, follow this exact sequence:
   ```typescript
   // Example: baseId change affecting tableName field
   if (fieldName === 'baseId' && nodeInfo?.providerId === 'airtable') {
     // 1. FIRST: Set loading state immediately
     setLoadingFields(prev => {
       const newSet = new Set(prev);
       newSet.add('tableName');  // The dependent field
       return newSet;
     });
     
     // 2. Clear the dependent field value
     setValue('tableName', '');
     
     // 3. Reset cached options to ensure fresh load
     resetOptions('tableName');
     
     // 4. Use setTimeout to ensure loading state is visible
     setTimeout(() => {
       if (value) {
         // Load new options
         loadOptions('tableName', 'baseId', value, true).finally(() => {
           setLoadingFields(prev => {
             const newSet = new Set(prev);
             newSet.delete('tableName');
             return newSet;
           });
         });
       } else {
         // Clear loading state if no value
         setLoadingFields(prev => {
           const newSet = new Set(prev);
           newSet.delete('tableName');
           return newSet;
         });
       }
     }, 10); // 10ms delay ensures smooth loading state
   }
   ```

#### Key Points:
- **Order matters**: Set loading state → Clear value → Reset options → Load new options
- **resetOptions** clears cached data ensuring "Loading options..." shows immediately
- **setTimeout** with 10ms prevents flickering and ensures loading state is visible
- **finally block** ensures loading state is cleared even if loading fails
- This pattern works for any parent-child field relationship (e.g., filterField→filterValue, baseId→tableName)

## Workflow Implementation Guides

### Field Implementation Guide
**IMPORTANT**: When creating or modifying fields for workflow actions/triggers, ALWAYS consult `/learning/docs/field-implementation-guide.md` for the complete checklist. Missing steps (especially field mappings) cause runtime errors.

Key areas to check:
1. Field definition in `availableNodes.ts`
2. **Field mapping in `useDynamicOptions.ts` (CRITICAL - often missed!)**
3. Backend handler implementation and registration
4. Action handler using the field value

### Action/Trigger Implementation Guide
**CRITICAL**: When implementing new workflow actions or triggers, ALWAYS follow `/learning/docs/action-trigger-implementation-guide.md` to ensure complete end-to-end functionality and uniform structure.

Essential steps that MUST be completed:
1. Define node in `availableNodes.ts` with all fields and schemas
2. Create action handler function with proper error handling
3. **Register handler in `executeNode.ts` (OFTEN MISSED!)**
4. Add field mappings for ALL dynamic fields
5. Implement and register data handlers for dropdowns
6. Handle special UI behavior if needed
7. Test complete flow from UI to execution

⚠️ **WARNING**: Missing ANY of these steps will cause runtime failures. The guides ensure uniform structure across all workflow nodes.

📝 **NOTE**: These implementation guides are living documents. UPDATE them when you discover new patterns, requirements, or solutions while implementing features. We are learning as we build, so capture that knowledge in the guides for future reference.

## Code Refactoring Guide

**CRITICAL**: When refactoring large files or modules, ALWAYS follow `/learning/docs/refactoring-guide.md` to ensure proper cleanup of legacy code and maintain functionality.

The refactoring guide covers:
- Pre-refactoring dependency analysis and type safety checks
- Step-by-step migration process for large files (especially those >1000 lines)
- Critical checks for import paths, handler registrations, and field mappings
- Common pitfalls and their solutions
- Post-refactoring validation steps
- Specific patterns for splitting node definitions and extracting handlers

Key reminders when refactoring:
1. **Never delete the original file** until all imports are updated
2. **Always update handler registrations** in executeNode.ts, route files, etc.
3. **Verify dynamic field mappings** in useDynamicOptions.ts still work
4. **Run build and lint** after each major refactoring step
5. **Document lessons learned** in the refactoring guide for future use

This is especially important for files like `availableNodes.ts` which has grown to 8000+ lines and requires systematic refactoring to maintain code quality and developer productivity.

## Security Considerations

- Never log or expose access tokens
- Use encrypted token storage
- Implement proper scope validation
- Follow OAuth best practices
- Maintain audit logs for sensitive operations