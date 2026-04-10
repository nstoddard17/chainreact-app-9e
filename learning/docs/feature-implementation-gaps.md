# Feature Implementation Gaps

Tracked items that are partially implemented or not yet built. Reference this when planning sprints.

Last updated: 2026-04-06

---

## Not Implemented

### Task Overage Billing
**Status:** Config only — no charging logic
**What exists:** `PLAN_INFO` in `lib/utils/plan-restrictions.ts` defines overage rates (Pro: $0.025/task, Team: $0.02, Business: $0.015). The subscription page displays these rates.
**What's missing:**
- Stripe metered billing or usage-based charges when a user exceeds their task limit
- Logic in `lib/workflows/taskDeduction.ts` to allow execution beyond the cap on paid plans and record overage
- End-of-cycle overage invoice generation
- UI showing accumulated overage charges in billing dashboard

**Key files to modify:**
- `lib/workflows/taskDeduction.ts` — currently blocks execution at limit, needs overage path
- `stores/billingStore.ts` — needs overage tracking state
- `app/api/integrations/stripe/data/handlers/subscriptions.ts` — needs metered billing webhook handling

---

### Extra Task Packs
**Status:** Not implemented
**What exists:** The subscription page comparison table references task pack pricing (Pro: +1,000 for $15, Team: +5,000 for $35, Business: +15,000 for $100).
**What's missing:**
- Stripe one-time purchase products for task packs
- API endpoint to purchase a task pack and credit the user's account
- UI on subscription page (button/dropdown to buy packs)
- Auto-purchase toggle ("buy a pack when I run out")
- Task pack balance tracking separate from monthly allocation

**Key files to create/modify:**
- New: `app/api/billing/task-packs/route.ts`
- `stores/billingStore.ts` — task pack balance state
- `app/(app)/subscription/page.tsx` — purchase UI
- `lib/workflows/taskDeduction.ts` — draw from pack balance when monthly limit exhausted

---

### Re-run Failed Executions
**Status:** Not implemented
**What exists:** `components/workflows/ExecutionHistoryModal.tsx` shows execution history with error details. Execution data is stored in the database.
**What's missing:**
- "Re-run" button in execution history UI
- API endpoint to re-trigger a workflow with the same input data
- Logic to clone the original trigger payload and re-execute
- Option to re-run with modified inputs
- Plan-gating (Pro+ only per pricing page)

**Key files to modify:**
- `components/workflows/ExecutionHistoryModal.tsx` — add re-run button per execution
- New: `app/api/workflows/[id]/rerun/route.ts`
- `lib/workflows/execution/` — re-execution logic using stored trigger data

---

## Partially Implemented

### AI Learns from Corrections
**Status:** Tracks corrections but no feedback loop
**What exists:**
- Agent eval system tracks `agent.manual_correction` events (`lib/eval/agentEvalTypes.ts`)
- `agentEvalTracker.trackEvent()` records when users manually edit AI-generated workflows
**What's missing:**
- Persistent correction memory per user/workspace (e.g., "when I say 'notify the team' I mean Slack #general, not email")
- Retrieval of past corrections during planning to avoid repeating mistakes
- Per-provider correction patterns (e.g., "always use channel X for Slack notifications")
- UI showing what the AI has learned ("AI Memory" section in settings)

**Key files:**
- `lib/eval/agentEvalTracker.ts` — currently tracks, needs to also store corrections
- `src/lib/workflows/builder/agent/planner.ts` — planning pipeline needs correction context injection
- New: correction storage table and retrieval service

---

### Audit Logs
**Status:** Integration events only
**What exists:**
- `app/api/audit/log-integration-event/route.ts` logs integration connect/disconnect/refresh events to `integration_audit_log` table
- Admin actions logged via `lib/utils/admin-audit.ts` (`logAdminAction()`)
**What's missing:**
- Comprehensive audit trail for Business/Enterprise plans covering:
  - Workflow CRUD (created, edited, activated, deactivated, deleted)
  - Team/member changes (invited, removed, role changed)
  - Settings changes (workspace, notification preferences)
  - Login/logout events
  - API key creation/deletion
- Audit log viewer UI for Business plan users
- Audit log export (CSV/JSON) as listed in pricing
- Retention policy aligned with plan (Business: 1 year, Enterprise: unlimited)

**Key files:**
- `lib/utils/admin-audit.ts` — extend pattern to general audit logging
- New: `lib/audit/auditLogger.ts` — centralized audit service
- New: `app/api/audit/logs/route.ts` — query endpoint
- New: `components/audit/AuditLogViewer.tsx` — UI component

---

### SSO/SAML
**Status:** UI and DB schema exist, auth flow unclear
**What exists:**
- `components/organizations/SSOConfiguration.tsx` — configuration UI for SAML and OIDC
- Database tables: `sso_configurations`, `sso_domain_mappings`, `sso_login_attempts`
- Domain verification flow in UI
**What's missing:**
- Verification that the SAML/OIDC auth flow actually works end-to-end with Supabase Auth
- Testing with real identity providers (Okta, Azure AD, Google Workspace)
- Domain-based auto-routing (user@company.com → SSO login)
- JIT (Just-In-Time) user provisioning
- SCIM provisioning (Enterprise tier)

**Key files:**
- `components/organizations/SSOConfiguration.tsx` — existing UI
- Auth callback routes — need SSO-specific handling
- Supabase Auth config — needs SAML/OIDC provider setup

---

### Integration Health Dashboard
**Status:** Metrics exist but no dedicated dashboard
**What exists:**
- `app/api/analytics/integration-metrics/route.ts` — returns integration usage stats
- Health check infrastructure: `app/api/cron/proactive-health-check/route.ts`, token refresh cron
- Health transition engine: `lib/integrations/healthTransitionEngine.ts`
- `health_check_status` column on integrations table
**What's missing:**
- Dedicated "Integration Health" page or panel showing:
  - Status of each connected integration (healthy/warning/action required/disconnected)
  - Last successful connection time
  - Error history per integration
  - One-click reconnect for failed integrations
- Currently health data exists server-side but isn't surfaced in a user-facing dashboard

**Key files:**
- `lib/integrations/healthTransitionEngine.ts` — data source
- New: `components/integrations/IntegrationHealthDashboard.tsx`
- Existing: `components/apps/` — could add health indicators to existing apps page

---

### Real-time Collaboration
**Status:** Presence only, not co-editing
**What exists:**
- `hooks/use-presence.ts` — tracks which users are online via Supabase Realtime
- `hooks/use-presence-optimized.ts` — optimized version
- `hooks/use-single-tab-presence.ts` — prevents duplicate presence
- Presence indicators show who's viewing a workflow
**What's missing:**
- Simultaneous workflow editing (two people editing the same workflow)
- Conflict resolution (OT/CRDT or last-write-wins with warnings)
- Real-time cursor/selection sharing in the builder
- Live node position syncing
- This is a complex feature — may not be needed for initial launch. Presence awareness + workflow locking may be sufficient.

**Key files:**
- `hooks/use-presence.ts` — existing presence system
- Workflow builder components would need Supabase Realtime broadcast channels for node changes

---

## Plain English Error Translator

### Current State
The codebase has proven the pattern works in two places:
- **OAuth errors:** `lib/integrations/errorClassificationService.ts` maps token errors to messages like "Authentication expired. Please reconnect your account." with provider-specific patterns for Google, Microsoft, Slack, etc.
- **Slack action errors:** `lib/workflows/actions/slack/utils.ts` has `getSlackErrorMessage()` mapping error codes to plain English.

But these are isolated — most action errors surface raw API responses to users.

### What's Needed

#### 1. Centralized Error Translator (`lib/workflows/execution/errorTranslator.ts`)
A service that takes a raw error (HTTP status, error code, provider, action type) and returns:
```typescript
interface TranslatedError {
  message: string           // "The Slack channel you selected no longer exists"
  category: 'auth' | 'input' | 'rate_limit' | 'not_found' | 'permission' | 'server' | 'network' | 'unknown'
  severity: 'recoverable' | 'action_required' | 'permanent'
  suggestion: string        // "Check that the channel hasn't been archived or deleted, then update your workflow"
  retryable: boolean
  retryAfterSeconds?: number
}
```

#### 2. HTTP Status Code Mapper
Generic translations for common HTTP errors, contextualized by provider and action:
- 400 → "The request was invalid. Check that all required fields are filled in correctly."
- 401 → "Your [Provider] connection has expired. Reconnect in the Apps page."
- 403 → "Your [Provider] account doesn't have permission for this action. Check your [Provider] permissions."
- 404 → "The [resource] you referenced doesn't exist or has been deleted."
- 429 → "Too many requests to [Provider]. This will retry automatically in [X] seconds."
- 500 → "[Provider] is experiencing issues. This isn't your fault — it will retry automatically."

#### 3. Provider-Specific Error Patterns
Each provider's common errors mapped to plain English. Examples:

**Gmail:**
- `invalid_grant` → "Your Gmail connection expired. Reconnect in Apps."
- `notFound` → "The email thread doesn't exist or was deleted."
- `quotaExceeded` → "Gmail daily sending limit reached. Resets tomorrow."

**Notion:**
- `object_not_found` → "The Notion page or database doesn't exist. It may have been deleted or unshared."
- `validation_error` → "A field value doesn't match the expected format in your Notion database."

**Stripe:**
- `card_declined` → "The card was declined by the issuing bank."
- `rate_limit` → "Too many Stripe API calls. Retrying in 60 seconds."

**Airtable:**
- `NOT_FOUND` → "The Airtable record or table doesn't exist."
- `INVALID_PERMISSIONS` → "Your Airtable token doesn't have access to this base."

**Discord:**
- `50001` → "Your Discord bot doesn't have access to this channel. Check bot permissions in Discord server settings."
- `50035` → "The message content is invalid. Check for empty messages or content over 2000 characters."

#### 4. Workflow Builder Error Translation
Errors during the AI build process also need translation:
- Node configuration failures → "Couldn't configure [node name] because [specific reason]"
- Missing integration connections → "This workflow needs [Provider] connected. Go to Apps to connect it."
- Invalid field mappings → "The field [fieldName] from [sourceNode] isn't available. The upstream node may have changed."

#### 5. Integration Points
- `lib/workflows/actions/` — each action handler wraps errors through the translator before storing
- `lib/workflows/execution/executionLogger.ts` — `formatErrorData()` calls translator
- `components/workflows/ExecutionHistoryModal.tsx` — displays translated message with suggestion
- `components/workflows/ErrorNotificationPopup.tsx` — uses translated message in notifications

### Files to Create
- `lib/workflows/execution/errorTranslator.ts` — core translation service
- `lib/workflows/execution/errorPatterns.ts` — provider-specific error pattern registry
- `lib/workflows/execution/httpErrorMapper.ts` — generic HTTP status translations

### Files to Modify
- `lib/workflows/execution/executionLogger.ts` — pipe errors through translator
- `components/workflows/ExecutionHistoryModal.tsx` — show translated message + suggestion + category badge
- Individual action handlers in `lib/workflows/actions/` — use translator on catch
