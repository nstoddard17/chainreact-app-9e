# CLAUDE.md
Guidance for Claude Code when working with this repository.

## Architectural Decision Guidelines
**IMPORTANT**: For architectural changes ALWAYS:
1. **Provide analysis** comparing approaches with pros/cons
2. **Recommend best approach** based on: industry best practices (Notion, Linear, Figma, Stripe, Vercel), scalability, performance, DX, technical debt
3. **Explain why** it aligns with world-class standards
4. **Get confirmation** before implementing
5. **Consider flex factor** - ensure adaptability

## Coding Best Practices - MANDATORY

### File Organization
- **New files proactively** - Max 500 lines/file
- **One responsibility/file** - Single, clear purpose
- **Extract utilities early** - Reusable logic in dedicated files
- **Proper directory structure** - Group by feature/domain

### Code Quality
- **No duplication** - Delegate to existing implementations
- **Method size** - Max 50 lines, extract helpers
- **DRY principle** - Extract common patterns
- **Clear naming** - Descriptive, intent-revealing

### Security & Maintainability
- **Dependency injection** - Pass deps, don't create
- **Type safety** - Strict TypeScript, no `any`
- **Error handling** - try-catch with specific types
- **Logging** - **CRITICAL**: MUST follow `/learning/docs/logging-best-practices.md` - NO tokens, keys, PII, or message content in logs

### Refactor When
- File >500 lines → Split
- Method >50 lines → Extract
- Switch >3 cases → Registry pattern
- Code in 2+ places → Share utility
- Hardcoded providers → Plugin pattern

### Architecture Patterns
1. **Registry Pattern** - Extensible handlers
2. **Strategy Pattern** - Different execution modes
3. **Delegation** - Specialized implementations
4. **Single Source of Truth** - One authoritative impl
5. **Lifecycle Pattern** - Resource management

## Trigger Lifecycle Pattern - MANDATORY
Resources for triggers created ONLY on workflow activation, cleaned up on deactivation/deletion.

**Pattern**: Connect→Save creds only | Create workflow→No resources | ACTIVATE→CREATE resources | DEACTIVATE→DELETE resources | REACTIVATE→CREATE fresh | DELETE workflow→DELETE resources

**Implementation**: All triggers implement `TriggerLifecycle`:
```typescript
interface TriggerLifecycle {
  onActivate(context: TriggerActivationContext): Promise<void>
  onDeactivate(context: TriggerDeactivationContext): Promise<void>
  onDelete(context: TriggerDeactivationContext): Promise<void>
  checkHealth(workflowId: string, userId: string): Promise<TriggerHealthStatus>
}
```

**Key Files**:
- Interface: `/lib/triggers/types.ts`
- Manager: `/lib/triggers/TriggerLifecycleManager.ts`
- Example: `/lib/triggers/providers/MicrosoftGraphTriggerLifecycle.ts`
- Registry: `/lib/triggers/index.ts`
- Usage: `/app/api/workflows/[id]/route.ts` (PUT/DELETE)

**Adding Triggers**:
1. Create in `/lib/triggers/providers/`
2. Implement `TriggerLifecycle`
3. **CRITICAL**: Register with EXACT provider ID from node definition
4. Register in `/lib/triggers/index.ts`

**Common Issue**: No resources in `trigger_resources`? Check provider ID mismatch - see `/learning/docs/action-trigger-implementation-guide.md#troubleshooting`

**Database**: `trigger_resources` table tracks: workflow_id (cascades delete), external_id, expires_at, status

## Overview
ChainReact: workflow automation platform with Next.js 15, TypeScript, Supabase. Automate workflows integrating Gmail, Discord, Notion, Slack, 20+ services.

## Development Commands

### Building/Running
```bash
npm run build/build:analyze/dev/dev:turbo/start/lint
```

### Token Management
```bash
npm run refresh-tokens[:dry-run/:verbose/:batch]
npm run fix-integrations
```

### Supabase Database - USE CLI FOR ALL CHANGES
**Setup (User Required)**:
1. Get token: https://supabase.com/dashboard/account/tokens
2. Set: `export SUPABASE_ACCESS_TOKEN="your-token"`
3. Link: `supabase link --project-ref xzwsdwllmrnrgbltibxt`

**Commands**:
```bash
supabase migration new <name>  # Create migration
supabase db push              # Apply to remote
supabase db reset/pull/diff   # Local ops
supabase start/stop/status    # Local stack
```

**Migration Rules**:
- Never modify existing migrations after push
- Create new migrations for changes
- Test locally first
- Files in `/supabase/migrations/`

### Git Workflow
**IMPORTANT**: NO automatic git commits/push unless explicitly asked.

## Architecture

### Core
- Next.js App Router with RSC
- Supabase: PostgreSQL + real-time
- Auth: Supabase OAuth
- State: Zustand stores
- UI: Tailwind + Shadcn/UI
- Engine: Custom node-based workflows

### Directories
- `/app` - Routes, APIs, pages
- `/components` - UI (shadcn), features, layouts
- `/lib` - Database, integrations, workflows, auth, security
- `/stores` - Zustand state management
- `/hooks` - Custom React hooks

### Database Entities
Users, Integrations, Workflows, Executions, Organizations

### Integrations (20+)
Communication: Gmail, Slack, Discord, Teams
Productivity: Notion, Drive, OneDrive, Trello
Business: HubSpot, Stripe, Airtable, Shopify
Social: Facebook, Twitter, LinkedIn, Instagram

Pattern: OAuth→Token management→API client→Webhooks

### Workflow Engine
Node-based visual builder (@xyflow/react), async execution, scheduling, real-time monitoring

### Recent Updates
- **Airtable webhooks**: Normalized payloads, dedupe, verification delay (`app/api/workflow/airtable/route.ts`)
- **Gmail triggers**: Shared Discord helper, provider dispatch with warnings
- **Operational**: After tunnel changes, toggle Airtable workflows for fresh webhook URLs

### Airtable Coverage
✅ new_record, record_updated, table_deleted - all with normalized payloads, dedupe, delays

## Configuration

### Environment
Required: `NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, OAuth credentials

### Dev Server
Check port: `netstat -ano | findstr ":3000"`
Kill: `taskkill /PID <pid> /F`
Start: `npm run dev`

### Cursor Rules
`.cursor/rules/`: howtocoderules.mdc, learningrules.mdc

### Learning Folder
`/learning` - templates, walkthroughs, changelogs, architectural decisions

## 🚨 Configuration Modal Rule
**ALL CONTENT STAYS IN LEFT COLUMN**
- NEVER use ScrollArea
- ALWAYS use ConfigurationContainer
- Test with wide content
See `/learning/docs/modal-column-overflow-solution.md`

## Common Issues

### Integration Status Not Showing
**Causes**: Server utilities with wrong Supabase init, modified status logic, broken fetching, import issues
**Fix**: Check fetchIntegrations(), verify store data, keep `status === 'connected'`, proper imports
**Prevention**: Don't create new Supabase clients in handlers, don't modify status logic, test after changes

## Key Patterns
- Early returns, guard clauses
- Custom error types
- RLS policies, token encryption (AES-256)
- Zod validation
- RSC where possible, dynamic imports
- WebP/AVIF optimization

### Testing
Unit: Jest + RTL
Browser: **FOLLOW `/PLAYWRIGHT.md`** - Use Chrome, no new dev server, test from scratch, fix errors immediately

## 🚨 Documentation Requirements - MANDATORY

**THIS IS NOT OPTIONAL - TREAT AS PART OF THE TASK:**

After implementing, fixing, or discovering anything significant, you MUST proactively update documentation:

### When to Document (Checklist)
Ask yourself after completing any work:
- [ ] Did we fix a bug that took more than 30 minutes to solve?
- [ ] Did we discover a gotcha, edge case, or non-obvious behavior?
- [ ] Did we implement a new integration, action, or trigger?
- [ ] Did we learn something about how a provider/API actually works vs how we thought it worked?
- [ ] Did we solve a problem that could happen again?
- [ ] Did we discover a pattern that should be reused?

**If you answered YES to any of these → DOCUMENT IT IMMEDIATELY**

### What to Update

**After bug fixes / troubleshooting:**
- `/learning/walkthroughs/[descriptive-name].md` - Step-by-step of what was wrong and how we fixed it

**After implementing actions/triggers:**
- `/learning/docs/action-trigger-implementation-guide.md` - Add gotchas, patterns, lessons learned

**After architectural changes:**
- `/learning/docs/[relevant-guide].md` - Update architecture docs with new patterns

**After significant changes to logs/changelogs:**
- `/learning/logs/CHANGELOG.md` - Major feature additions, breaking changes
- `/learning/logs/socialMedia.md` - ADD AT TOP, use date headers ONCE/day, paragraph form for Twitter, delete >8 days old

### Documentation Workflow

**IMPORTANT: Don't wait for the user to ask "update the docs"**

1. **Complete the technical work** (fix bug, implement feature, etc.)
2. **IMMEDIATELY ask yourself**: "What did we learn that would help future us?"
3. **Proactively say**: "Let me document what we learned in [specific file]"
4. **Update the relevant documentation**
5. **Confirm**: "I've updated [file] with [what was added]"

### Example of Correct Behavior

```
User: "The Outlook trigger is firing twice for new emails"
Assistant: [investigates and fixes the issue]
Assistant: "Fixed! The issue was Microsoft sending both 'created' and 'updated'
           notifications. I changed the subscription to only 'created' and added
           deduplication logic.

           Let me document this in the action-trigger implementation guide so
           we don't forget this Microsoft Graph gotcha."
[Updates docs]
Assistant: "I've added a new 'Microsoft Graph Webhook Implementation' section
           to action-trigger-implementation-guide.md covering:
           - Why 'created,updated' causes duplicates
           - Deduplication strategy
           - Content filtering approach
           - All 6 issues we discovered"
```

### Why This Matters

**Without documentation:**
- ❌ We'll hit the same bug again in 3 months
- ❌ New team members will make the same mistakes
- ❌ Solutions are lost when conversation history is gone
- ❌ Patterns don't become reusable

**With documentation:**
- ✅ Future fixes take minutes, not hours
- ✅ Institutional knowledge grows
- ✅ Patterns become standard practices
- ✅ Onboarding is faster and easier

## Workflow Template Layout
- Template spacing/layout rules live in `learning/docs/template-quick-reference.md` (see **Node Positioning Guide**).
- When adjusting template nodes or adding new templates, follow the spacing guidance (center x: 600, branch offset: 400, vertical spacing: 180).
- `/learning/docs/` - architecture
- `/learning/logs/CHANGELOG.md`
- **`/learning/logs/socialMedia.md`** - ADD AT TOP, use date headers ONCE/day, paragraph form for Twitter, delete >8 days old
- `/learning/templates/` - reusable patterns

## Integration Development (Post-Sept 2025 Refactoring)
1. Define in `availableNodes.ts` with Zod schemas
2. Add field mappings `/components/workflows/configuration/config/fieldMappings.ts`
3. Create provider loader `/components/workflows/configuration/providers/[provider]/`
4. Register in `/components/workflows/configuration/providers/registry.ts`
5. Create API handler `/app/api/integrations/[provider]/data/route.ts`
6. Implement actions `/lib/workflows/actions/[provider]/`
7. Add OAuth config if needed

**Time**: 30min simple, 2-4hr complex
See `/learning/docs/integration-development-guide.md`

## Workflow Nodes
Follow `/lib/workflows/availableNodes.ts` pattern with validation, variable resolution, error handling

### AI Field Values
Format: `{{AI_FIELD:fieldName}}` - placeholder for AI generation at runtime
UI: Robot icon toggles, shows "Defined automatically by AI"
Non-editable fields don't support AI mode

### AI Agent Chain Builder - DO NOT MODIFY WITHOUT UNDERSTANDING
**Core Files**:
1. `AIAgentConfigModal.tsx` - Main config (lines 420-445 handleSave)
2. `AIAgentVisualChainBuilder.tsx` - ReactFlow builder
3. `CollaborativeWorkflowBuilder.tsx` - Lines 5785-6585 integration, 5854-6544 setNodes, 6530-6575 edges

**Chain Flow**: VisualBuilder→ConfigModal→WorkflowBuilder
**Node ID**: `{aiAgentId}-{originalNodeId}-{timestamp}`
**Add Action**: 120px chain spacing, 160px workflow
**Issues**: Check chainsToProcess, use getNodes() in timeouts, filter AI agents from Add Action

**Jan 10 Fix**: Added parentChainIndex metadata for persistence (lines 465-498 visual, 6068 workflow, 1792-1799 recognition)

See `/learning/docs/ai-agent-chain-builder-architecture.md`

### Field Dependencies
```typescript
// Parent change handler sequence:
setLoadingFields(prev => {...add dependent...});
setValue('dependent', '');
resetOptions('dependent');
setTimeout(() => {
  loadOptions('dependent', 'parent', value, true).finally(() => {
    setLoadingFields(prev => {...remove dependent...});
  });
}, 10);
```

## Implementation Guides

### Critical Guides - ALWAYS CONSULT
- **Logging Best Practices**: `/learning/docs/logging-best-practices.md` - **MANDATORY** for ANY logging - NO tokens/keys/PII/content
- **Modal Overflow**: `/learning/docs/modal-column-overflow-solution.md` - Use ConfigurationContainer, no ScrollArea
- **Field Implementation**: `/learning/docs/field-implementation-guide.md` - Complete checklist, field mappings critical
- **Workflow Execution**: `/learning/docs/workflow-execution-implementation-guide.md` - Service patterns, ExecutionContext, filter UI nodes
- **Action/Trigger**: `/learning/docs/action-trigger-implementation-guide.md` - End-to-end steps, register handlers, provider ID matching

### Common Issues
**Integration Status (RECURRING)**: Config IDs don't match DB providers
- Fix: Update providerMappings in isIntegrationConnected
- See `/learning/walkthroughs/integration-connection-status-fix.md`

**Integration Modal Sync**: Changes needed in:
1. CollaborativeWorkflowBuilder (inline modals)
2. AIAgentConfigModal (lines 1729-1970)
3. Standalone dialogs (future use)
- Coming Soon list: `/hooks/workflows/useIntegrationSelection.ts` (lines 208-227)

## Templates

### Documentation
- **Complete**: `/learning/docs/template-management-supabase-guide.md`
- **Quick Ref**: `/learning/docs/template-quick-reference.md`

### Required Fields
name, description, category (valid list), nodes, connections, is_public, is_predefined, created_by

### Creation Methods
1. Workflow Builder (Admin) - Edit button
2. Supabase Dashboard - Direct insert
3. API - POST /api/templates

### Best Practices
✅ Clear names, helpful tags, reasonable defaults, test after creation
❌ No sensitive data, user-specific IDs, deprecated nodes

### Node Structure
```json
{
  "id": "unique-id",
  "type": "custom",
  "position": {"x": 400, "y": 100},
  "data": {
    "title": "Name",
    "type": "actual_type",
    "providerId": "provider",
    "config": {}
  }
}
```

Positioning: Start 400,100 | Vertical 160-200px | Horizontal 400px branches

### AI Testing
- Test emails: `/learning/test-emails/ai-agent-test-emails.md`
- Setup: `/learning/docs/ai-agent-testing-setup-guide.md`

## Code Refactoring
**FOLLOW**: `/learning/docs/refactoring-guide.md`
1. Never delete original until imports updated
2. Update handler registrations
3. Verify field mappings
4. Build/lint after each step
5. Document lessons learned

## UI Styling
**Combobox/Select**: `/learning/docs/combobox-field-styling-guide.md`
- MultiCombobox: Airtable 'tasks/feedback/project'
- Combobox: Single Airtable fields
- Inline styles for white text: `style={{ color: 'white' }}`

## Security
No token logging, encrypted storage, scope validation, OAuth best practices, audit logs
