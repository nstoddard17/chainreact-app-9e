**Update CLAUDE.md before every git commit**

# CLAUDE.md
Guidance for Claude Code when working with this repository.

## 🚨 CRITICAL: Root Cause Analysis Protocol - MANDATORY
**THIS IS NON-NEGOTIABLE. FAILURE TO FOLLOW THIS WILL BREAK THE CODEBASE.**

When debugging ANY issue:

### Step 1: STOP and Do NOT Assume
- **DO NOT** jump to conclusions about caching, timing, or stale data
- **DO NOT** implement a fix based on your first hypothesis
- **DO NOT** assume you understand the issue without comparing implementations

### Step 2: Compare Working vs Broken Implementations
1. **Read the working implementation** - understand EXACTLY how it works
2. **Read the broken implementation** - understand EXACTLY how it works
3. **Trace the complete logic path** for both - don't stop at surface level
4. **Identify the EXACT difference** in logic, not just symptoms

### Step 3: Verify Root Cause
- What specific line of code causes the difference in behavior?
- Why does the working version not have this issue?
- Is this a logic difference, data difference, or timing difference?

### Step 4: Only Then Implement Fix
- Fix should address the ROOT CAUSE identified in Step 3
- Fix should make broken implementation match working implementation's logic
- Test that fix actually resolves the issue

**Example of WRONG approach:**
- "Page A works, Page B doesn't" → Assume caching issue → Add refresh logic → May or may not work

**Example of CORRECT approach:**
- "Page A works, Page B doesn't" → Compare both implementations → Page A checks `integrations.find(i => i.provider === id)`, Page B calls `getConnectedProviders()` which has different logic → Fix Page B to use same logic as Page A → Verified fix

**If user says "look at how X works", that means:**
1. Read X's implementation completely
2. Trace through its logic paths
3. Compare to the broken code's logic paths
4. Identify the EXACT difference
5. Only then propose a fix

This is a large codebase with many moving parts. Jumping to conclusions will break things.

## 🚨 CRITICAL: API Efficiency - MANDATORY
**ALWAYS OPTIMIZE API CALLS. PERFORMANCE IS NOT OPTIONAL.**

When creating or reviewing API endpoints and client-side data fetching:

### Rule 1: Minimize HTTP Requests
- **Combine related data** - If client needs A and B, create one endpoint that returns both
- **Use query parameters** - Allow clients to request optional data (`?include_invitations=true`)
- **Never make sequential calls** - If data is related, fetch it in parallel or in one query

**❌ WRONG:**
```typescript
// Client makes 2 separate calls
const members = await fetch('/api/teams/123/members')
const invitations = await fetch('/api/teams/123/invitations')
```

**✅ CORRECT:**
```typescript
// Client makes 1 call, server returns both
const data = await fetch('/api/teams/123/members?include_invitations=true')
// Returns: { members: [...], invitations: [...] }
```

### Rule 2: Optimize Database Queries
**CRITICAL: Split complex joins into simple queries, then merge in memory**

- **Break apart nested joins** - Complex joins cause timeouts; split into simple queries
- **Use Promise.all()** - Fetch independent data in parallel, not sequentially
- **Batch lookups** - Get all IDs first, then fetch related data in one query with `.in()`
- **Avoid N+1 queries** - Never loop and query; collect IDs and query once
- **Merge in memory** - Simple queries + memory merge is faster than complex database joins

**❌ WRONG:**
```typescript
// Complex nested join - SLOW and prone to timeouts
const { data } = await db
  .from('team_members')
  .select(`
    *,
    team:teams(
      *,
      organization:organizations(*)
    ),
    user:users(*)
  `)
  .eq('user_id', userId)
```

**✅ CORRECT:**
```typescript
// Step 1: Get team memberships (simple query, fast)
const memberships = await db
  .from('team_members')
  .select('team_id, role, joined_at')
  .eq('user_id', userId)

// Step 2: Get related data in parallel
const teamIds = memberships.map(m => m.team_id)
const [teams, users] = await Promise.all([
  db.from('teams').select('*').in('id', teamIds),
  db.from('users').select('*').in('id', userIds)
])

// Step 3: Merge in memory (instant)
const result = memberships.map(m => ({
  ...m,
  team: teams.find(t => t.id === m.team_id),
  user: users.find(u => u.id === m.user_id)
}))
```

**Why split queries?**
- ✅ Database joins require complex index lookups → can timeout
- ✅ Simple queries use primary keys → always fast
- ✅ Parallel fetching is faster than sequential joins
- ✅ Memory operations are nearly instant (microseconds)
- ✅ More reliable and predictable performance
- ✅ Easier to debug and optimize individual queries

**Real Example:**
- `/api/teams/my-teams` had 8-second timeouts with nested join
- Split into 3 simple queries → no more timeouts, 2x faster

### Rule 3: Prevent React Double-Fetch
- **Always use useRef** - Prevent React 18 Strict Mode double-execution
- **Check hasFetchedRef** - Before making API calls in useEffect

**❌ WRONG:**
```typescript
useEffect(() => {
  fetchData()  // Called twice in Strict Mode
}, [user])
```

**✅ CORRECT:**
```typescript
const hasFetchedRef = useRef(false)
useEffect(() => {
  if (!hasFetchedRef.current) {
    hasFetchedRef.current = true
    fetchData()  // Called once
  }
}, [user])
```

### Rule 4: Network Call Timeouts
- **Always use timeouts** - Use `fetchWithTimeout` utility (8s default, 30s for payments)
- **Use AbortController** - Allow cancellation of in-flight requests
- See "Network Call Requirements" section for full details

### Performance Checklist
Before committing ANY API code:
- [ ] Can multiple calls be combined into one?
- [ ] Are database queries executed in parallel where possible?
- [ ] Is there a single batch query for user profiles/related data?
- [ ] Does the client prevent double-fetch with useRef?
- [ ] Are all network calls protected with timeouts?
- [ ] Would this scale to 100+ users/items?

**Real Example from Codebase:**
- **Before:** Team members page made 2 API calls (members + invitations), 4 database queries total
- **After:** 1 API call with `?include_invitations=true`, parallel fetching, single profile query
- **Result:** 50% fewer HTTP requests, 2x faster page load

## 🚨 CRITICAL: Light & Dark Mode Color Schema Design - MANDATORY
**ALWAYS DESIGN FOR BOTH LIGHT AND DARK MODES SIMULTANEOUSLY.**

When implementing any UI component with colors (badges, pills, buttons, cards, etc.):

### Design Principle
- **NEVER** design for only one mode and assume it will work in the other
- **ALWAYS** test and verify colors in BOTH light AND dark modes
- **COLORS MUST BE DISTINCT AND VISIBLE** in both modes
- Each color should have a clear purpose and be visually distinct from others

### Color Schema Requirements

**Light Mode:**
- Use light/pastel backgrounds (e.g., `bg-blue-100`, `bg-green-100`)
- Use dark text for contrast (e.g., `text-blue-800`, `text-green-800`)
- Use medium borders (e.g., `border-blue-300`, `border-green-300`)

**Dark Mode:**
- Use semi-transparent OR solid darker backgrounds (e.g., `dark:bg-blue-500/20` or `dark:bg-blue-700`)
- Use light text for contrast (e.g., `dark:text-blue-300`, `dark:text-white`)
- Use medium opacity borders (e.g., `dark:border-blue-500/40`)

### Common Mistakes to Avoid

❌ **WRONG**: Designing colors that look good only in one mode
```typescript
// This will be invisible or hard to read in one mode
badgeColor: 'bg-white text-black'  // No dark mode support
```

❌ **WRONG**: Using default component variants without checking both modes
```typescript
// Default Badge variant may override custom colors
<Badge className="bg-blue-100">  // Gets overridden by default variant
```

✅ **CORRECT**: Explicitly define both light and dark mode colors
```typescript
badgeColor: 'bg-blue-100 text-blue-800 dark:bg-blue-700 dark:text-blue-100 border border-blue-300 dark:border-blue-600'
```

✅ **CORRECT**: Use outline variant when applying custom colors to Badge
```typescript
<Badge variant="outline" className={customColors}>
```

### Testing Checklist
Before marking any UI work as complete:
- [ ] Viewed component in light mode - colors are visible and distinct
- [ ] Viewed component in dark mode - colors are visible and distinct
- [ ] Toggled between modes - no jarring transitions or invisible text
- [ ] All color variations tested (success, warning, error, info, etc.)
- [ ] Text has sufficient contrast in both modes (WCAG AA minimum)

### Real Example from This Codebase

**Issue**: Role badges in admin panel showed distinct colors in dark mode but appeared as black/white pills in light mode.

**Root Cause**: Badge component's default variant applied `bg-primary` which overrode the custom light mode colors.

**Fix**:
1. Added `variant="outline"` to RoleBadge component to prevent default override
2. Verified all role colors render correctly in BOTH modes
3. Ensured each role has a distinct, visible color in both light and dark modes

**Color Pattern Used**:
```typescript
// Each role gets a unique color with proper light/dark support
free: 'bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300'
pro: 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-300'
enterprise: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-700 dark:text-emerald-100'
admin: 'bg-red-100 text-red-800 dark:bg-red-500/20 dark:text-red-300'
```

### When to Use Each Approach

**Semi-transparent backgrounds** (`bg-color-500/20`):
- When you want the background to blend slightly with the container
- Good for subtle badges and tags
- Works well with varied background colors

**Solid backgrounds** (`bg-color-700`):
- When you need strong visual presence
- For important status indicators
- When the badge needs to stand out prominently

## 🚨 CRITICAL: Search Exhaustively - NEVER Stop at First Instance
**THIS IS A CRITICAL FAILURE PATTERN THAT MUST BE ELIMINATED.**

When searching for code to remove or fix:

### ❌ WRONG Approach (NEVER DO THIS):
1. Find one instance of the problem
2. Fix that one instance
3. Assume you're done
4. User reports it still happens
5. Repeat steps 1-4 multiple times

### ✅ CORRECT Approach (ALWAYS DO THIS):
1. **Search comprehensively FIRST** - Use grep/search to find ALL instances
2. **Document all locations found** - List every file and line number
3. **Analyze each instance** - Understand context of each occurrence
4. **Fix ALL instances in ONE response** - Never partial fixes
5. **Verify completeness** - Search again to confirm nothing missed

**Real Example from This Codebase:**

Task: Remove AddActionNode creation from workflow builder

❌ **WRONG**:
- Found AddActionNode creation in workflow loading (lines 1374-1518)
- Removed it
- Told user "Done!"
- User: "It still appears"
- Found it in handleReplaceTrigger (lines 2034-2065)
- Removed it
- Told user "Done!"
- User: "STILL appears"
- Eventually found 4 total instances

✅ **CORRECT**:
1. Search: `grep -n "type: 'addAction'" useWorkflowBuilder.ts`
2. Found 4 instances: lines 1441, 2052, 2263, 2499
3. Analyzed each context
4. Removed all 4 in single response
5. Verified: `grep -n "type: 'addAction'" useWorkflowBuilder.ts` → No results
6. User: "Fixed!"

**Search Commands to Use:**
```bash
# Find all instances of a pattern
grep -rn "pattern" directory/

# Find in specific file types
grep -rn "pattern" --include="*.ts" --include="*.tsx"

# Find type definitions
grep -rn "type:\s*['\"]addAction['\"]"

# Find variable assignments
grep -rn "addActionNode\s*="

# Verify removal
grep -rn "pattern" # Should return nothing
```

**Before You Say "Done":**
- [ ] Did I search the ENTIRE codebase for this pattern?
- [ ] Did I check all related patterns (variables, types, edges)?
- [ ] Did I verify with a final search that returns NO results?
- [ ] Am I 100% certain there are no other instances?

**If you fix one instance and the issue persists, you failed Step 1.**

### 🚨 Remove Means DELETE, Not Comment Out
**When user says "remove X" - DELETE the code, don't comment it out.**

❌ **WRONG**:
```typescript
// Old code that user asked to remove
// const addActionNode = createAddAction()
// setNodes([...nodes, addActionNode])
```

✅ **CORRECT**:
```typescript
// Code is completely gone - nothing here
```

**Why This Matters:**
- Commented code clutters the codebase
- Creates confusion about what's active
- Makes diffs harder to read
- Suggests you're unsure about the change
- Git history preserves old code if we need it

**Only comment out code when:**
- User explicitly asks you to comment it out
- You're proposing a change and want to show the old code for comparison
- It's temporary debugging code

**Default action for "remove" = DELETE completely.**

## 🚨 CRITICAL: Admin Debug Panel Logging - MANDATORY
**ALL DEBUGGING LOGS MUST GO TO THE ADMIN DEBUG PANEL, NOT CONSOLE.LOG**

### Why This Matters
The Admin Debug Panel is a persistent, floating panel that:
- Only shows for admin users (`user_profiles.admin = true`)
- Persists across all pages in the app
- Provides live event logging with timestamps
- Allows export of debug data
- Shows real-time state snapshots
- Is accessible via the Bug icon in the bottom-right corner

### When to Use Debug Panel Logging
**ALWAYS use debug panel logging when:**
- Debugging ANY issue reported by the user
- Adding temporary logging to troubleshoot problems
- Tracking API calls and responses
- Monitoring state changes
- Investigating errors or unexpected behavior

**Files:**
- Debug Store: `/stores/debugStore.ts`
- Global Panel: `/components/debug/GlobalAdminDebugPanel.tsx`

### How to Use Debug Panel Logging

**1. Import the debug store:**
```typescript
import { useDebugStore } from "@/stores/debugStore"
```

**2. Get logging functions (in components):**
```typescript
const { logEvent, logApiCall, logApiResponse, logApiError } = useDebugStore()
```

**3. Log events:**
```typescript
// General events
logEvent('info', 'Category', 'Message', { optional: 'data' })
logEvent('error', 'Category', 'Error message', { error: errorObj })
logEvent('warning', 'Category', 'Warning message')

// API calls
const requestId = logApiCall('GET', '/api/endpoint', { params })
logApiResponse(requestId, 200, { data }, duration)
logApiError(requestId, error, duration)

// State changes
logEvent('state_change', 'StoreName', 'What changed', { newValue })
```

**Event Types:**
- `'info'` - General information
- `'error'` - Errors
- `'warning'` - Warnings
- `'api_call'` - API request started
- `'api_response'` - API request succeeded
- `'api_error'` - API request failed
- `'state_change'` - State/store updated
- `'user_action'` - User interaction

**4. Example - API Call Logging:**
```typescript
const fetchData = async () => {
  const startTime = Date.now()
  const requestId = logApiCall('GET', '/api/data')

  try {
    logEvent('info', 'DataFetch', 'Starting data fetch...')

    const response = await fetch('/api/data')
    const duration = Date.now() - startTime

    if (!response.ok) {
      const errorData = await response.json()
      logApiError(requestId, new Error(errorData.error), duration)
      logEvent('error', 'DataFetch', 'API returned error', errorData)
      throw new Error(errorData.error)
    }

    const data = await response.json()
    logApiResponse(requestId, response.status, { count: data.length }, duration)
    logEvent('info', 'DataFetch', `Successfully fetched ${data.length} items`)

    return data
  } catch (error: any) {
    const duration = Date.now() - startTime
    logApiError(requestId, error, duration)
    logEvent('error', 'DataFetch', 'Fetch failed', {
      message: error?.message,
      stack: error?.stack
    })
    throw error
  }
}
```

**5. Server-Side Logging (API Routes):**
Use the standard logger which already goes to the debug panel for admin users:
```typescript
import { logger } from "@/lib/utils/logger"

// In API routes
logger.debug('[API Name] Debug info', { data })
logger.error('[API Name] Error occurred', { error: error.message, details: error.details })
logger.info('[API Name] Operation completed', { result })
```

### DO NOT Use console.log
**❌ WRONG:**
```typescript
console.log('Fetching teams...')
console.error('Error:', error)
```

**✅ CORRECT:**
```typescript
logEvent('info', 'Teams', 'Fetching teams...')
logEvent('error', 'Teams', 'Error fetching teams', { error })
```

### Viewing Debug Logs
1. User must be admin (`user_profiles.admin = true`)
2. Click the Bug icon in bottom-right corner
3. Panel shows all logged events with timestamps
4. Filter by category or event type
5. Export logs for sharing
6. Clear logs when done

### Enforcement Checklist
When debugging ANY issue:
- [ ] Import `useDebugStore` in component
- [ ] Use `logEvent()` for general logging
- [ ] Use `logApiCall/Response/Error()` for API calls
- [ ] Include category and descriptive messages
- [ ] Include relevant data in the data parameter
- [ ] NO `console.log()` or `console.error()` for debugging
- [ ] Test that logs appear in admin debug panel

**Violation of this rule makes debugging impossible for the admin user.**

## 🚨 CRITICAL: Network Call Requirements - MANDATORY
**ALL NETWORK CALLS MUST FOLLOW THESE PATTERNS TO PREVENT STUCK LOADING SCREENS.**

### Rule 1: ALL fetch() calls MUST have timeout protection

**Use the fetchWithTimeout utility** (`/lib/utils/fetch-with-timeout.ts`):

```typescript
// ❌ WRONG - No timeout protection
const response = await fetch('/api/data')

// ✅ CORRECT - 8 second timeout
import { fetchWithTimeout } from '@/lib/utils/fetch-with-timeout'
const response = await fetchWithTimeout('/api/data', {}, 8000)
```

**Default timeout: 8 seconds** (8000ms) for normal requests, 30 seconds for checkout/payment operations.

### Rule 2: ALL Supabase queries MUST have timeout protection

**Use the queryWithTimeout utility**:

```typescript
// ❌ WRONG - No timeout protection
const { data, error } = await supabase.from('users').select('*')

// ✅ CORRECT - 8 second timeout
import { queryWithTimeout } from '@/lib/utils/fetch-with-timeout'
const { data, error } = await queryWithTimeout(
  supabase.from('users').select('*'),
  8000
)
```

### Rule 3: useEffect dependencies MUST NOT include state updated by the effect

```typescript
// ❌ WRONG - Infinite loop
useEffect(() => {
  fetchData()  // This updates 'data' state
}, [data])  // Triggers effect when data changes → infinite loop

// ✅ CORRECT - Run once on mount
useEffect(() => {
  fetchData()
}, [])

// ✅ CORRECT - Memoized fetch function
const fetchData = useCallback(async () => {
  // ...
}, [/* stable dependencies only */])

useEffect(() => {
  fetchData()
}, [fetchData])
```

### Rule 4: Use Promise.allSettled instead of Promise.all for parallel fetches

```typescript
// ❌ WRONG - One failure stops everything
await Promise.all([
  fetchPlans(),
  fetchSubscription(),
  fetchUsage()
])

// ✅ CORRECT - Partial success is acceptable
const results = await Promise.allSettled([
  fetchPlans(),
  fetchSubscription(),
  fetchUsage()
])

// Check for failures
const failures = results.filter(r => r.status === 'rejected')
if (failures.length > 0) {
  logger.error('Some fetches failed:', failures)
  // Decide: show error or continue with partial data?
}
```

### Rule 5: Loading states MUST use try/finally pattern

```typescript
// ❌ WRONG - Loading might not reset on error
const fetchData = async () => {
  try {
    setLoading(true)
    const data = await fetch('/api/data')
    setData(data)
    setLoading(false)  // Won't run if error occurs
  } catch (error) {
    setError(error.message)
  }
}

// ✅ CORRECT - Loading always resets
const fetchData = async () => {
  setLoading(true)

  try {
    const data = await fetchWithTimeout('/api/data', {}, 8000)
    setData(data)
  } catch (error: any) {
    setError(error.message)
    logger.error('Fetch failed:', error)
  } finally {
    setLoading(false)  // ✅ ALWAYS runs
  }
}
```

### Rule 6: Error states MUST include retry mechanism

```typescript
// ❌ WRONG - User is stuck, no recovery
if (error) {
  return <div>Error: {error}</div>
}

// ✅ CORRECT - User can retry
if (error) {
  return (
    <div className="space-y-4">
      <div className="text-red-600">Error: {error}</div>
      <Button onClick={() => fetchData()} variant="outline">
        Retry
      </Button>
    </div>
  )
}
```

### Rule 7: NEVER swallow errors in catch() blocks

```typescript
// ❌ WRONG - Error logged but never propagates
await Promise.all([
  fetchPlans().catch(err => logger.error(err)),
  fetchSubscription().catch(err => logger.error(err))
])
// Promise.all thinks all succeeded!

// ✅ CORRECT - Errors propagate
try {
  const results = await Promise.allSettled([
    fetchPlans(),
    fetchSubscription()
  ])
  // Handle results individually
} catch (error) {
  // Handle overall error
}
```

### Rule 8: NO early returns that bypass finally blocks

```typescript
// ❌ RISKY - Early return skips cleanup
const fetchData = async () => {
  setLoading(true)
  try {
    const response = await fetch('/api/data')
    if (!response.ok) {
      setLoading(false)  // Manual cleanup
      return  // Early exit
    }
    // More logic...
  } finally {
    setLoading(false)  // This still runs, but fragile pattern
  }
}

// ✅ CORRECT - No manual cleanup needed
const fetchData = async () => {
  setLoading(true)
  try {
    const response = await fetch('/api/data')
    if (!response.ok) {
      throw new Error('Failed to fetch')  // Throw instead of return
    }
    // More logic...
  } catch (error: any) {
    logger.error('Fetch failed:', error)
  } finally {
    setLoading(false)  // ✅ Always runs, no manual cleanup
  }
}
```

### Available Utilities

**File:** `/lib/utils/fetch-with-timeout.ts`

1. **fetchWithTimeout(url, options?, timeoutMs?)** - Fetch with automatic timeout
2. **queryWithTimeout(queryPromise, timeoutMs?)** - Supabase query timeout wrapper
3. **retryWithBackoff(fn, retries?, delayMs?)** - Retry with exponential backoff

**Examples:**

```typescript
// Simple fetch with timeout
const response = await fetchWithTimeout('/api/users', {}, 8000)

// POST with timeout
const response = await fetchWithTimeout(
  '/api/organizations',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  },
  8000
)

// Supabase query with timeout
const { data, error } = await queryWithTimeout(
  supabase.from('plans').select('*').eq('active', true),
  8000
)

// Retry with backoff
const data = await retryWithBackoff(
  async () => {
    const response = await fetchWithTimeout('/api/data', {}, 8000)
    if (!response.ok) throw new Error('Failed')
    return response.json()
  },
  3, // retry 3 times
  1000 // start with 1 second delay
)
```

### Enforcement Checklist

Before committing ANY code with network calls:
- [ ] All `fetch()` calls use `fetchWithTimeout`
- [ ] All Supabase queries use `queryWithTimeout`
- [ ] useEffect dependencies don't include state updated by the effect
- [ ] Parallel fetches use `Promise.allSettled` when partial success is acceptable
- [ ] Loading states use `try/finally` pattern
- [ ] Error states include retry button
- [ ] No error swallowing in `.catch()`
- [ ] No early returns that bypass `finally` blocks

**Violation of these rules causes stuck loading screens and broken UX.**

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

## Auth Store Guardrails
- `stores/authStore.ts` now clears the initialization watchdog (`clearInitTimeout`) as soon as we have a Supabase session and immediately marks auth as initialized before the profile fetch runs. This prevents the recurring `Auth initialization timed out, forcing completion...` warning.
- **Do not remove or relocate** the `clearInitTimeout()` call that runs right after the `userObj` is created, and keep the early `set({ user, initialized: true })` call. Both are required to keep the watchdog from firing when the profile lookup stalls.
- If you adjust auth initialization, preserve the non-blocking profile fetch pattern (fetch/creation happens after `initialized` is set) and keep any long-running work out of the watchdog window.
- `Profile` objects **must include** `email` and `provider` (see `mapProfileData` in `stores/authStore.ts`) so the UI can show the correct identity and downstream beta-tester tracking keeps working. Never strip those fields.
- All client-side Supabase access for workflows goes through `@/utils/supabaseClient` (see `stores/workflowStore.ts`). Do not reintroduce the old `lib/supabase-singleton` helper—the shared client is required so auth state and workflow queries stay in sync.

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
**IMPORTANT**: Always ASK before running `npm run build`. The user has a live dev server running for real-time testing.

```bash
npm run dev           # Live dev server (user typically has this running)
npm run build         # Production build - ASK FIRST before running
npm run build:analyze # Bundle analysis
npm run dev:turbo     # Turbo dev mode
npm run start         # Start production server
npm run lint          # Run linter
```

**Testing Protocol**:
- Use the live dev server (`npm run dev`) for immediate feedback
- Only run builds when explicitly requested or for deployment verification

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

### CORS Security - MANDATORY
**CRITICAL**: All API routes MUST use secure CORS configuration
- **NEVER use `Access-Control-Allow-Origin: *`** with credentials
- **ALWAYS validate origins** against whitelist using `/lib/utils/cors.ts`
- **Guide**: `/learning/docs/cors-security-guide.md`
- **Security Fix**: `/learning/walkthroughs/cors-security-fix.md`

**Quick Reference:**
```typescript
import { handleCorsPreFlight, addCorsHeaders } from '@/lib/utils/cors'

// OPTIONS handler
export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request, {
    allowCredentials: true,
    allowedMethods: ['POST', 'OPTIONS'],
  })
}

// Add CORS to response
const response = NextResponse.json(data)
return addCorsHeaders(response, request, { allowCredentials: true })
```

**Allowed Origins** (in `/lib/utils/cors.ts`):
- Production: `https://www.chainreact.app`, `https://chainreact.app`
- Development: `localhost:3000`, ngrok (set `NGROK_URL` env var)

**Security Headers** (automatically included):
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Content-Security-Policy: frame-ancestors 'none'` (clickjacking protection)
- `X-XSS-Protection: 1; mode=block`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`

**Clickjacking Defense**: Dual protection via `X-Frame-Options: DENY` + `CSP: frame-ancestors 'none'`

### General Security
No token logging, encrypted storage, scope validation, OAuth best practices, audit logs

## 🎯 AI Agent Flow - Current Status & Enhancements

### ✅ Completed Features (12/12 - 100%)
**Last Updated**: October 31, 2025  
**Documentation**: See `/AI_AGENT_FLOW_COMPLETE.md` and `/AI_AGENT_FLOW_ENHANCEMENTS.md`

**Core Features Implemented:**
1. ✅ Chat Persistence - Messages saved to database per flow
2. ✅ Planner Determinism - 247-node catalog with deterministic planning
3. ✅ Animated Build Choreography - 120ms stagger, 550ms camera movements
4. ✅ Design Tokens - 420±4px agent panel, 380±4px inspector, exact spacing
5. ✅ Configuration Drawer - 4 tabs (Setup, Output, Advanced, Results)
6. ✅ Guided Setup - Sequential Continue/Skip flow for node configuration
7. ✅ Cost Tracking - Pre-run estimation + breakdown by provider
8. ✅ Build Badge - Top-center overlay with stage indicators
9. ✅ Reduced Motion - Full accessibility support
10. ✅ Node States - CSS classes (skeleton, halo, pulse, success, error)
11. ✅ Edge Styling - 1.5px stroke, neutral gray from design tokens
12. ✅ Typography - 11/12.5/14/16px scale

**Files Modified:**
- `components/workflows/builder/WorkflowBuilderV2.tsx` - Main integration (~200 lines)
- `components/workflows/configuration/ConfigurationModal.tsx` - 4-tab system
- See `/AI_AGENT_FLOW_COMPLETE.md` for full file manifest

**Infrastructure Created:**
- `/lib/workflows/ai-agent/` - design-tokens, chat-service, build-choreography, cost-tracker
- `/components/workflows/ai-agent/` - BuildBadge, GuidedSetupCard, AgentChatPanel, CostDisplay
- `/app/api/workflows/[id]/chat/` - Chat persistence API
- `/supabase/migrations/agent_chat_persistence_v2.sql` - Database schema

### ⚠️ Manual Action Required (User Must Do)

**CRITICAL - Database Migration:**
```bash
# Apply this SQL in Supabase Studio SQL Editor
# File: /supabase/migrations/agent_chat_persistence_v2.sql
# Creates: agent_chat_messages table with RLS policies
# Required for: Chat persistence to work
```

See `/MANUAL_ACTIONS_REQUIRED.md` for detailed steps.

### 🎯 Outstanding Enhancements (Beyond Original Spec)

**See**: `/AI_AGENT_FLOW_ENHANCEMENTS.md` for detailed implementation guides

**High Priority (10-12 hours):**
1. **Node Testing in Guided Setup** (4-5h)
   - Test node before advancing to next
   - Save sample output data
   - Track cost per tested node
   - **Why**: Ensures workflows configured correctly before deployment

2. **Planner Node Descriptions** (2h)
   - Generate descriptions for each node in plan
   - Show subtitles on canvas
   - Display preview snippets
   - **Why**: Improves UX clarity of what each node does

3. **Complete Output Schemas** (4-12h)
   - Define `outputSchema` for all 247 nodes
   - Enable full variable picker functionality
   - Type-safe merge field references
   - **Why**: Critical for variable picker and workflow composability
   - **Note**: Can start with top 20 nodes (4h) for 80% coverage

**Medium Priority (9-11 hours):**
4. **Runtime Execution States** (5-6h)
   - Real-time visual states during workflow execution
   - Success/failure indicators
   - Streaming execution updates
   - **Why**: Better debugging and monitoring

5. **Sample Data Preview** (4-5h)
   - Show output data on canvas after tests
   - Collapsible JSON viewer with syntax highlighting
   - Copy merge fields from preview
   - **Why**: Faster iteration on workflow development

**Low Priority (4 hours):**
6. **Actual Cost Tracking** (4h)
   - Track actual cost during execution
   - Compare estimate vs actual
   - Historical cost trends
   - **Why**: Analytics and optimization insights

**Total Estimated Time**: ~28 hours over 3 weeks

### 🔍 End-to-End Requirements Checklist

**For AI Agent Flow to work end-to-end:**

1. ✅ **Code Integration** - COMPLETE
   - All infrastructure wired into WorkflowBuilderV2.tsx
   - Agent panel renders at 420px ± 4
   - BuildBadge shows during build
   - CostDisplay in top-right
   - Guided setup Continue/Skip buttons wired

2. ⚠️ **Database Migration** - REQUIRES USER ACTION
   - Apply `agent_chat_persistence_v2.sql` in Supabase Studio
   - Creates `agent_chat_messages` table
   - Without this: Chat won't persist across refreshes

3. ✅ **API Routes** - COMPLETE
   - `/api/workflows/[id]/chat` - GET/POST/PATCH
   - Chat service handles all persistence
   - Status messages prevent duplicates

4. ✅ **Design System** - COMPLETE
   - `agent-flow.css` imported
   - Design tokens applied (420±4, 380±4, etc.)
   - Node state CSS classes ready
   - Reduced motion support

5. ✅ **Build Choreography** - COMPLETE
   - BuildChoreographer integrated
   - 120ms node stagger (spec-compliant)
   - 550ms camera movements
   - Zoom-fit → skeleton → focus sequence

6. ⚠️ **Testing** - NOT YET DONE
   - User needs to test with actual prompt
   - Verify chat persistence after migration
   - Check build animation timing
   - Confirm guided setup flow

**Test URL Format:**
```
http://localhost:3001/workflows/[flow-id]?prompt=Send%20email%20to%20Slack
```

### 🐛 Known Issues

1. **Gmail Icon Warning (Non-Breaking)**
   - Dev server shows `TagOff/TagPlus not exported`
   - Code is correct (uses `Plus` and `X`)
   - Fix: `rm -rf .next && npm run dev`

2. **Chat Persistence Requires Migration**
   - Messages don't persist until migration applied
   - User must manually run SQL in Supabase Studio

### 📖 Documentation Reference

When user asks about AI Agent Flow enhancements:
1. **Feature List**: `/AI_AGENT_FLOW_ENHANCEMENTS.md`
2. **What's Complete**: `/AI_AGENT_FLOW_COMPLETE.md`
3. **Manual Actions**: `/MANUAL_ACTIONS_REQUIRED.md`
4. **Technical Details**: `/learning/docs/agent-flow-integration-complete.md`

**Quick Status Check:**
- Core Features: 12/12 (100%)
- Manual Actions: 1 required (database migration)
- Enhancements: 6 identified, prioritized, documented

### 🎬 Next Steps for User

1. Apply database migration from `/MANUAL_ACTIONS_REQUIRED.md`
2. Test end-to-end: Submit prompt → Plan → Build → Guided setup
3. Verify chat persistence (refresh page after prompt)
4. Report any issues
5. Choose enhancements to implement from `/AI_AGENT_FLOW_ENHANCEMENTS.md`

---

