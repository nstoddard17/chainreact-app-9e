**Update CLAUDE.md before every git commit**

# CLAUDE.md
Guidance for Claude Code when working with this repository.

---

## 🚨 CRITICAL RULES - MANDATORY

### Follow Explicit User Instructions
**THIS IS THE HIGHEST PRIORITY. EXPLICIT INSTRUCTIONS OVERRIDE EVERYTHING.**

- **DO** the exact action requested immediately
- **DO NOT** skip instructions or assume you know better
- **DO NOT** prioritize your ideas over direct commands
- If user repeats an instruction, you DIDN'T do it - do it NOW

**YOU ARE MADE TO DO WHAT THE USER TELLS YOU TO DO.**

### Root Cause Analysis Protocol
When debugging ANY issue:

1. **STOP and Do NOT Assume** - Don't jump to conclusions
2. **Compare Working vs Broken** - Read BOTH implementations completely
3. **Trace Complete Logic Paths** - Don't stop at surface level
4. **Identify EXACT Difference** - Not just symptoms
5. **Only Then Implement Fix** - Address root cause

**If user says "look at how X works" - compare implementations first.**

### Search Exhaustively - NEVER Stop at First Instance
When searching for code to remove or fix:

1. **Search comprehensively FIRST** - Use grep to find ALL instances
2. **Document all locations** - List every file and line number
3. **Fix ALL instances in ONE response** - Never partial fixes
4. **Verify completeness** - Search again to confirm nothing missed

**If you fix one instance and the issue persists, you failed Step 1.**

**Remove Means DELETE** - When user says "remove X", DELETE the code, don't comment it out. Git preserves history.

---

## 🎯 API & FIELD IMPLEMENTATION

### API Capability Verification - MANDATORY
**VERIFY API SUPPORT BEFORE ADDING ANY TRIGGER/ACTION FIELDS**

#### Process for Every New Field:
1. **Ask:** "Can the API actually do this?"
2. **Research:** Find documentation + real examples
3. **Verify:** Check actual API responses/payloads
4. **Document:** Add comment with sources
5. **Implement:** Only if verified ✅

#### Checklist Before Adding Fields:
- [ ] Read provider's API documentation
- [ ] Verify webhook filtering capabilities (for triggers)
- [ ] Verify API endpoint parameters (for actions)
- [ ] Search for real-world examples
- [ ] Confirm webhook payload structure
- [ ] Document findings in code comments with links

**Example: Trello Case Study**
- ✅ Verified webhooks fire for ANY update (no server-side filtering)
- ✅ Found `action.data.old` object contains ONLY changed fields
- ✅ Implemented client-side filtering by checking `Object.keys(action.data.old)`
- ✅ Documented with links to examples and API docs

### Cascading Fields Pattern - MANDATORY
**IMPROVE UX BY HIDING FIELDS UNTIL PARENT SELECTIONS ARE MADE**

**When to use:** Actions with 5+ fields, resource selectors, hierarchical data

**Required Properties:**
```typescript
{
  name: "fieldName",
  label: "Field Label",
  type: "text",
  required: false,
  dependsOn: "parentFieldId",
  hidden: {
    $deps: ["parentFieldId"],
    $condition: { parentFieldId: { $exists: false } }
  }
}
```

**Common Patterns:**
- **Update actions**: Select resource → show update fields
- **Create actions**: Select parent → show creation fields
- **Triggers**: Select watch target → show trigger options

**Reference:** `/lib/workflows/nodes/providers/stripe/index.ts` (31 cascaded fields)

---

## 🚀 PERFORMANCE & OPTIMIZATION

### API Efficiency - MANDATORY

#### Rule 1: Minimize HTTP Requests
- Combine related data into one endpoint
- Use query parameters (`?include_invitations=true`)
- Never make sequential calls when parallel is possible

#### Rule 2: Optimize Database Queries
**CRITICAL: Split complex joins into simple parallel queries, then merge in memory**

```typescript
// ✅ CORRECT: Simple queries + parallel + memory merge
const memberships = await db
  .from('team_members')
  .select('team_id, role, joined_at')
  .eq('user_id', userId)

const teamIds = memberships.map(m => m.team_id)
const [teams, users] = await Promise.all([
  db.from('teams').select('*').in('id', teamIds),
  db.from('users').select('*').in('id', userIds)
])

// Merge in memory with Map for O(1) lookups
const teamMap = new Map(teams.map(t => [t.id, t]))
const result = memberships.map(m => ({
  ...m,
  team: teamMap.get(m.team_id)
}))
```

**Why?**
- Simple queries use primary keys → always fast
- Promise.all() runs simultaneously → faster than joins
- Memory operations are microseconds
- Map lookups are O(1) vs O(n) with .find()

#### Rule 3: Prevent React Double-Fetch
```typescript
const hasFetchedRef = useRef(false)
useEffect(() => {
  if (!hasFetchedRef.current) {
    hasFetchedRef.current = true
    fetchData()
  }
}, [user])
```

### Network Call Requirements - MANDATORY

#### All fetch() calls MUST have timeout protection
```typescript
import { fetchWithTimeout } from '@/lib/utils/fetch-with-timeout'
const response = await fetchWithTimeout('/api/data', {}, 8000)
```

#### All Supabase queries MUST have timeout protection
```typescript
import { queryWithTimeout } from '@/lib/utils/fetch-with-timeout'
const { data, error } = await queryWithTimeout(
  supabase.from('users').select('*'),
  8000
)
```

#### Loading states MUST use try/finally pattern
```typescript
const fetchData = async () => {
  setLoading(true)
  try {
    const data = await fetchWithTimeout('/api/data', {}, 8000)
    setData(data)
  } catch (error: any) {
    setError(error.message)
  } finally {
    setLoading(false)  // ✅ ALWAYS runs
  }
}
```

#### Error states MUST include retry mechanism
```typescript
if (error) {
  return (
    <div className="space-y-4">
      <div className="text-red-600">Error: {error}</div>
      <Button onClick={() => fetchData()} variant="outline">Retry</Button>
    </div>
  )
}
```

**Performance Checklist:**
- [ ] Can multiple calls be combined?
- [ ] Are queries executed in PARALLEL with Promise.all()?
- [ ] Are complex JOINs split into simple parallel queries?
- [ ] Are Map objects used for O(1) lookups?
- [ ] Does client prevent double-fetch with useRef?
- [ ] Are all network calls protected with timeouts?
- [ ] Would this scale to 100+ users/items?

---

## 🎨 UI & DESIGN

### Light & Dark Mode Color Schema - MANDATORY
**ALWAYS DESIGN FOR BOTH MODES SIMULTANEOUSLY**

**Light Mode:**
- Light backgrounds: `bg-blue-100`, `bg-green-100`
- Dark text: `text-blue-800`, `text-green-800`
- Medium borders: `border-blue-300`

**Dark Mode:**
- Semi-transparent/solid backgrounds: `dark:bg-blue-500/20` or `dark:bg-blue-700`
- Light text: `dark:text-blue-300`, `dark:text-white`
- Medium borders: `dark:border-blue-500/40`

**Always use `variant="outline"` when applying custom colors to Badge components.**

**Testing Checklist:**
- [ ] Viewed in light mode - colors visible and distinct
- [ ] Viewed in dark mode - colors visible and distinct
- [ ] Toggled between modes - no jarring transitions
- [ ] Text has sufficient contrast (WCAG AA)

### Configuration Modal Rule
- **NEVER use ScrollArea**
- **ALWAYS use ConfigurationContainer**
- See `/learning/docs/modal-column-overflow-solution.md`

---

## 🐛 DEBUGGING & LOGGING

### Admin Debug Panel Logging - MANDATORY
**ALL DEBUGGING LOGS MUST GO TO THE ADMIN DEBUG PANEL, NOT CONSOLE.LOG**

```typescript
import { useDebugStore } from "@/stores/debugStore"

const { logEvent, logApiCall, logApiResponse, logApiError } = useDebugStore()

// General events
logEvent('info', 'Category', 'Message', { data })
logEvent('error', 'Category', 'Error message', { error })

// API calls
const requestId = logApiCall('GET', '/api/endpoint')
logApiResponse(requestId, 200, { data }, duration)
logApiError(requestId, error, duration)
```

**Server-Side:**
```typescript
import { logger } from "@/lib/utils/logger"
logger.debug('[API Name] Debug info', { data })
logger.error('[API Name] Error', { error: error.message })
```

**NEVER use `console.log()` or `console.error()` for debugging.**

**Logging Requirements:**
- MUST follow `/learning/docs/logging-best-practices.md`
- NO tokens, keys, PII, or message content in logs

---

## 📚 DOCUMENTATION REQUIREMENTS - MANDATORY

### When to Document (Checklist)
- [ ] Fixed bug that took >30 minutes?
- [ ] Discovered gotcha/edge case?
- [ ] Implemented new integration/action/trigger?
- [ ] Learned how API actually works vs expected?
- [ ] Solved problem that could happen again?
- [ ] Discovered reusable pattern?

**If YES → DOCUMENT IT IMMEDIATELY**

### What to Update
- **Bug fixes:** `/learning/walkthroughs/[descriptive-name].md`
- **Actions/Triggers:** `/learning/docs/action-trigger-implementation-guide.md`
- **Architecture:** `/learning/docs/[relevant-guide].md`
- **Changes:** `/learning/logs/CHANGELOG.md`
- **Social:** `/learning/logs/socialMedia.md` (ADD AT TOP, date headers ONCE/day)

### Documentation Workflow
1. Complete technical work
2. Ask: "What did we learn?"
3. Proactively say: "Let me document this..."
4. Update relevant documentation
5. Confirm what was added

**Don't wait for user to ask "update the docs"**

---

## 🏗️ ARCHITECTURE & PATTERNS

### Coding Best Practices

**File Organization:**
- Max 500 lines/file
- One responsibility/file
- Extract utilities early
- Group by feature/domain

**Code Quality:**
- No duplication
- Max 50 lines per method
- DRY principle
- Clear naming

**Refactor When:**
- File >500 lines → Split
- Method >50 lines → Extract
- Switch >3 cases → Registry pattern
- Code in 2+ places → Share utility

### Architectural Decision Guidelines
For architectural changes ALWAYS:
1. Provide analysis comparing approaches
2. Recommend based on industry best practices (Notion, Linear, Stripe, Vercel)
3. Explain why it aligns with world-class standards
4. Get confirmation before implementing

### Architecture Patterns
1. **Registry Pattern** - Extensible handlers
2. **Strategy Pattern** - Different execution modes
3. **Delegation** - Specialized implementations
4. **Single Source of Truth** - One authoritative impl
5. **Lifecycle Pattern** - Resource management

### Trigger Lifecycle Pattern - MANDATORY
Resources created ONLY on workflow activation, cleaned up on deactivation/deletion.

**Pattern:** Connect→Save creds | Create workflow→No resources | ACTIVATE→CREATE resources | DEACTIVATE→DELETE resources

**Interface:**
```typescript
interface TriggerLifecycle {
  onActivate(context: TriggerActivationContext): Promise<void>
  onDeactivate(context: TriggerDeactivationContext): Promise<void>
  onDelete(context: TriggerDeactivationContext): Promise<void>
  checkHealth(workflowId: string, userId: string): Promise<TriggerHealthStatus>
}
```

**Files:**
- Interface: `/lib/triggers/types.ts`
- Manager: `/lib/triggers/TriggerLifecycleManager.ts`
- Registry: `/lib/triggers/index.ts`

---

## 🔧 DEVELOPMENT SETUP

### Overview
ChainReact: workflow automation platform with Next.js 15, TypeScript, Supabase. 20+ integrations including Gmail, Discord, Notion, Slack.

### Commands

**Building/Running:**
```bash
npm run dev           # Live dev server (user typically has running)
npm run build         # Production build - ASK FIRST
npm run lint          # Run linter
```
**IMPORTANT: Always ASK before running `npm run build`**

**Supabase Database:**
```bash
supabase migration new <name>  # Create migration
supabase db push               # Apply to remote
supabase db reset/pull/diff    # Local ops
```

**Migration Rules:**
- Never modify existing migrations after push
- Create new migrations for changes
- Test locally first

**Git Workflow:**
- NO automatic commits/push unless explicitly asked

### Architecture

**Core:**
- Next.js App Router with RSC
- Supabase: PostgreSQL + real-time
- Auth: Supabase OAuth
- State: Zustand stores
- UI: Tailwind + Shadcn/UI
- Engine: Custom node-based workflows

**Directories:**
- `/app` - Routes, APIs, pages
- `/components` - UI components
- `/lib` - Database, integrations, workflows
- `/stores` - Zustand state
- `/learning` - Documentation

### Integration Development
1. Define in `availableNodes.ts` with Zod schemas
2. Add field mappings in `fieldMappings.ts`
3. Create provider loader
4. Register in provider registry
5. Create API handler
6. Implement actions
7. Add OAuth config if needed

**Time:** 30min simple, 2-4hr complex
**Guide:** `/learning/docs/integration-development-guide.md`

---

## 🔒 SECURITY

### CORS Security - MANDATORY
```typescript
import { handleCorsPreFlight, addCorsHeaders } from '@/lib/utils/cors'

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request, {
    allowCredentials: true,
    allowedMethods: ['POST', 'OPTIONS'],
  })
}

const response = NextResponse.json(data)
return addCorsHeaders(response, request, { allowCredentials: true })
```

**NEVER use `Access-Control-Allow-Origin: *` with credentials**

**Security Headers (automatically included):**
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Content-Security-Policy: frame-ancestors 'none'`
- `Strict-Transport-Security: max-age=31536000`

### General Security
- No token logging
- Encrypted storage (AES-256)
- Scope validation
- OAuth best practices
- RLS policies

---

## 📋 WORKFLOW & NODES

### Loop Progress Tracking
**Files:**
- Migration: `/supabase/migrations/20251106000000_create_loop_executions_table.sql`
- Handler: `/lib/workflows/actions/logic/loop.ts`
- UI: `/components/workflows/execution/LoopProgressIndicator.tsx`

**Features:** Real-time progress, time estimates, error reporting, batch support

### AI Field Values
Format: `{{AI_FIELD:fieldName}}` - placeholder for AI generation at runtime

### Field Dependencies
```typescript
setLoadingFields(prev => {...add dependent...});
setValue('dependent', '');
resetOptions('dependent');
setTimeout(() => {
  loadOptions('dependent', 'parent', value, true).finally(() => {
    setLoadingFields(prev => {...remove dependent...});
  });
}, 10);
```

---

## 📖 GUIDES & REFERENCES

### Critical Guides - ALWAYS CONSULT
- **Logging:** `/learning/docs/logging-best-practices.md`
- **Modal Overflow:** `/learning/docs/modal-column-overflow-solution.md`
- **Field Implementation:** `/learning/docs/field-implementation-guide.md`
- **Workflow Execution:** `/learning/docs/workflow-execution-implementation-guide.md`
- **Action/Trigger:** `/learning/docs/action-trigger-implementation-guide.md`
- **CORS Security:** `/learning/docs/cors-security-guide.md`

### Templates
- **Complete:** `/learning/docs/template-management-supabase-guide.md`
- **Quick Ref:** `/learning/docs/template-quick-reference.md`

**Required Fields:** name, description, category, nodes, connections, is_public, is_predefined, created_by

**Positioning:** Start 400,100 | Vertical 160-200px | Horizontal 400px branches

### Common Issues

**Integration Status Not Showing:**
- Check fetchIntegrations()
- Verify store data
- Keep `status === 'connected'`
- Update providerMappings in isIntegrationConnected
- See `/learning/walkthroughs/integration-connection-status-fix.md`

---

## 🎯 AI AGENT FLOW - STATUS

### Completed Features (12/12 - 100%)
**Last Updated:** October 31, 2025

1. ✅ Chat Persistence
2. ✅ Planner Determinism (247-node catalog)
3. ✅ Animated Build Choreography
4. ✅ Design Tokens (420±4px, 380±4px)
5. ✅ Configuration Drawer (4 tabs)
6. ✅ Guided Setup
7. ✅ Cost Tracking
8. ✅ Build Badge
9. ✅ Reduced Motion
10. ✅ Node States
11. ✅ Edge Styling
12. ✅ Typography

**Documentation:**
- Complete: `/AI_AGENT_FLOW_COMPLETE.md`
- Enhancements: `/AI_AGENT_FLOW_ENHANCEMENTS.md`
- Manual Actions: `/MANUAL_ACTIONS_REQUIRED.md`

### Outstanding Enhancements (~28 hours)
1. **Node Testing in Guided Setup** (4-5h)
2. **Planner Node Descriptions** (2h)
3. **Complete Output Schemas** (4-12h)
4. **Runtime Execution States** (5-6h)
5. **Sample Data Preview** (4-5h)
6. **Actual Cost Tracking** (4h)

---

## 🗂️ AUTH STORE GUARDRAILS

- `stores/authStore.ts` clears initialization watchdog as soon as session exists
- Keep `clearInitTimeout()` and early `set({ user, initialized: true })` calls
- `Profile` objects MUST include `email` and `provider`
- Use `@/utils/supabaseClient` for all client-side Supabase access

---

## 🧪 TESTING

**Unit:** Jest + RTL
**Browser:** Follow `/PLAYWRIGHT.md` - Use Chrome, no new dev server, test from scratch

---

## 📝 KEY REMINDERS

- Update CLAUDE.md before every commit
- Follow explicit user instructions without exception
- Search exhaustively before claiming "done"
- Design for light AND dark mode simultaneously
- Use Admin Debug Panel for all logging
- Document immediately after learning something significant
- Ask before running `npm run build`
- Verify API support before adding fields
- Use cascading fields for 5+ field forms
- Optimize database queries with parallel execution
- Add timeout protection to all network calls
