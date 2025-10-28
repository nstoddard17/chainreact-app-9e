# Workspace Integration Management - Implementation Guide

**Created:** 2025-10-27
**Status:** Ready for Implementation
**Model:** Option B - Workspace-Scoped Integrations

---

## 🎯 Overview

Integrations are scoped to workspaces (Personal, Team, Organization). The workspace switcher determines which integrations are available. Users connect apps for their current workspace, and permissions control who can manage those connections.

---

## 🏗️ Architecture

### Core Concept

**Integrations belong to workspaces, NOT to individual users across all contexts.**

```
Workspace Switcher Context = Integration Scope

If workspace = "Personal"
  → Shows/manages Personal integrations

If workspace = "BrightSpark Marketing Team"
  → Shows/manages Team integrations
  → Only team admins can connect/disconnect
  → All team members can USE in workflows

If workspace = "Personal" but user is on "Marketing Team"
  → Shows Personal integrations (not team integrations)
```

---

## 📊 Database Schema

### Updated integrations Table

```sql
ALTER TABLE integrations
ADD COLUMN workspace_type TEXT CHECK (workspace_type IN ('personal', 'organization', 'team')),
ADD COLUMN workspace_id UUID, -- References organization/team ID (NULL for personal)
ADD COLUMN connected_by UUID REFERENCES auth.users(id);

-- Index for performance
CREATE INDEX idx_integrations_workspace ON integrations(workspace_type, workspace_id);
CREATE INDEX idx_integrations_connected_by ON integrations(connected_by);
```

**Columns:**
- `workspace_type` - 'personal' | 'organization' | 'team'
- `workspace_id` - UUID of organization/team (NULL for personal)
- `connected_by` - User who connected the integration
- `user_id` (existing) - Still used for personal integrations for backward compatibility

**Examples:**
```sql
-- Personal integration (Marcus's personal Gmail)
INSERT INTO integrations (provider, workspace_type, workspace_id, user_id, connected_by)
VALUES ('gmail', 'personal', NULL, 'marcus-id', 'marcus-id');

-- Team integration (Marketing team's shared Gmail)
INSERT INTO integrations (provider, workspace_type, workspace_id, user_id, connected_by)
VALUES ('gmail', 'team', 'team-marketing-id', NULL, 'admin-alice-id');

-- Organization integration (Company-wide Slack)
INSERT INTO integrations (provider, workspace_type, workspace_id, user_id, connected_by)
VALUES ('slack', 'organization', 'org-brightsp ark-id', NULL, 'owner-bob-id');
```

### Integration Permissions Table

```sql
CREATE TABLE integration_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  integration_id UUID REFERENCES integrations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL CHECK (permission IN ('use', 'manage', 'admin')),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  granted_by UUID REFERENCES auth.users(id),
  UNIQUE(integration_id, user_id)
);

CREATE INDEX idx_integration_permissions_user ON integration_permissions(user_id);
CREATE INDEX idx_integration_permissions_integration ON integration_permissions(integration_id);
```

**Permission Levels:**
- `use` - Can use integration in workflows (all team members)
- `manage` - Can reconnect, view details (team admins)
- `admin` - Can connect, disconnect, manage permissions (team owners, org admins)

---

## 🔐 Permission System

### Auto-Grant Rules

When an integration is connected:

**Personal Integration:**
```typescript
// User gets 'admin' permission automatically
await grantPermission(integrationId, userId, 'admin', userId)
```

**Team Integration:**
```typescript
// 1. Connected_by user gets 'admin'
await grantPermission(integrationId, connectedBy, 'admin', connectedBy)

// 2. All team members get 'use'
const members = await getTeamMembers(teamId)
for (const member of members) {
  if (member.user_id !== connectedBy) {
    await grantPermission(integrationId, member.user_id, 'use', connectedBy)
  }
}

// 3. Team owners/admins get 'admin'
const admins = members.filter(m => ['owner', 'admin'].includes(m.role))
for (const admin of admins) {
  if (admin.user_id !== connectedBy) {
    await grantPermission(integrationId, admin.user_id, 'admin', connectedBy)
  }
}
```

**Organization Integration:**
```typescript
// 1. Connected_by user gets 'admin'
await grantPermission(integrationId, connectedBy, 'admin', connectedBy)

// 2. All org members (via teams) get 'use'
const orgMembers = await getAllOrgMembers(organizationId)
for (const member of orgMembers) {
  if (member.user_id !== connectedBy) {
    await grantPermission(integrationId, member.user_id, 'use', connectedBy)
  }
}

// 3. Org admins get 'admin'
const orgAdmins = await getOrgAdmins(organizationId)
for (const admin of orgAdmins) {
  if (admin.user_id !== connectedBy) {
    await grantPermission(integrationId, admin.user_id, 'admin', connectedBy)
  }
}
```

### Permission Checks

```typescript
// Check if user can use integration in workflow
async function canUseIntegration(userId: string, integrationId: string): Promise<boolean> {
  const perm = await getPermission(userId, integrationId)
  return perm !== null // Any permission level allows 'use'
}

// Check if user can manage integration (reconnect, view details)
async function canManageIntegration(userId: string, integrationId: string): Promise<boolean> {
  const perm = await getPermission(userId, integrationId)
  return perm && ['manage', 'admin'].includes(perm.permission)
}

// Check if user can admin integration (connect, disconnect, permissions)
async function canAdminIntegration(userId: string, integrationId: string): Promise<boolean> {
  const perm = await getPermission(userId, integrationId)
  return perm?.permission === 'admin'
}
```

---

## 🎨 UI/UX Design

### Workspace Switcher Integration Display

**Updated Workspace Switcher Dropdown:**

```
┌────────────────────────────────────────┐
│ 🏠 Personal                       ✓   │
│    📊 50/100 tasks used                │
│    🔌 2 integrations                   │  ← Count of personal integrations
│       • Gmail (personal)               │
│       • Slack (personal)               │
├────────────────────────────────────────┤
│ 🏠 BrightSpark Marketing Team         │
│    📊 450/10,000 tasks (shared)        │
│    🔌 5 integrations                   │  ← Count of team integrations
│       • Gmail (company-marketing@...)  │
│       • Slack (BrightSpark workspace)  │
│       • HubSpot (company account)      │
│       • Trello (team board)            │
│       • Notion (team workspace)        │
├────────────────────────────────────────┤
│ 🏠 BrightSpark Organization           │
│    📊 450/10,000 tasks (org pool)      │
│    🔌 3 integrations                   │  ← Count of org integrations
│       • Stripe (company account)       │
│       • Google Drive (org drive)       │
│       • Microsoft Teams (org)          │
└────────────────────────────────────────┘
```

### Integrations Page (Context-Aware)

**When workspace = "Personal":**

```
┌─────────────────────────────────────────────────────────┐
│ Integrations > Personal                                 │
│                                                         │
│ These integrations are only available in your personal │
│ workflows. Switch to a team workspace to manage team   │
│ integrations.                                           │
│                                                         │
│ Connected Integrations (2):                            │
│ ┌──────────────────────────────────────────────────┐  │
│ │ Gmail - marcus@personal.com                      │  │
│ │ Connected by you • Used in 3 workflows           │  │
│ │ [Reconnect] [Disconnect]                         │  │
│ └──────────────────────────────────────────────────┘  │
│                                                         │
│ ┌──────────────────────────────────────────────────┐  │
│ │ Slack - Personal Workspace                       │  │
│ │ Connected by you • Used in 1 workflow            │  │
│ │ [Reconnect] [Disconnect]                         │  │
│ └──────────────────────────────────────────────────┘  │
│                                                         │
│ [+ Connect New Integration]                            │
└─────────────────────────────────────────────────────────┘
```

**When workspace = "BrightSpark Marketing Team":**

```
┌─────────────────────────────────────────────────────────┐
│ Integrations > BrightSpark Marketing Team               │
│                                                         │
│ These integrations are shared by the Marketing team.   │
│ All team members can use them in workflows.            │
│                                                         │
│ Connected Integrations (5):                            │
│ ┌──────────────────────────────────────────────────┐  │
│ │ Gmail - company-marketing@brightsparkco.com      │  │
│ │ Connected by Alice • Used in 12 workflows        │  │
│ │ [Reconnect] [Disconnect]                         │  │  ← You see these if admin
│ └──────────────────────────────────────────────────┘  │
│                                                         │
│ ┌──────────────────────────────────────────────────┐  │
│ │ Slack - BrightSpark Marketing                    │  │
│ │ Connected by Bob • Used in 8 workflows           │  │
│ │ [View Details]                                   │  │  ← Read-only if not admin
│ └──────────────────────────────────────────────────┘  │
│                                                         │
│ [+ Connect New Integration]  ← Only visible to admins │
└─────────────────────────────────────────────────────────┘
```

**Insufficient Permissions Dialog:**

When non-admin tries to disconnect integration:

```
┌──────────────────────────────────────────┐
│ ⚠️  Insufficient Permissions             │
│                                          │
│ You don't have permission to disconnect │
│ this integration.                        │
│                                          │
│ Options:                                 │
│ • Ask your team admin (Alice, Bob)      │
│ • Switch to Personal workspace to        │
│   manage your own integrations          │
│ • Switch to a team where you're admin   │
│                                          │
│ [Switch to Personal] [OK]                │
└──────────────────────────────────────────┘
```

### Workflow Builder Integration Selector

**When creating workflow in "Personal" workspace:**

```
Gmail Trigger Configuration:
┌──────────────────────────────────────────┐
│ Integration Account:                     │
│ ● marcus@personal.com (Personal)         │  ← Only personal integrations shown
│                                          │
│ No team integrations available.         │
│ Switch workspace to use team Gmail.     │
│                                          │
│ [Connect Different Gmail]                │
└──────────────────────────────────────────┘
```

**When creating workflow in "Marketing Team" workspace:**

```
Gmail Trigger Configuration:
┌──────────────────────────────────────────┐
│ Integration Account:                     │
│ ● company-marketing@brightsparkco.com    │  ← Team integration (pre-selected)
│   (Marketing Team)                       │
│                                          │
│ This uses the team's shared Gmail       │
│ account. All team members can use this. │
│                                          │
│ [Connect Different Gmail]                │  ← Only admins see this
└──────────────────────────────────────────┘
```

---

## 🔨 Implementation

### Step 1: Database Migration

**File:** `/supabase/migrations/[timestamp]_add_workspace_integrations.sql`

```sql
-- ================================================================
-- ADD WORKSPACE CONTEXT TO INTEGRATIONS
-- ================================================================

-- Add workspace columns
ALTER TABLE integrations
ADD COLUMN IF NOT EXISTS workspace_type TEXT
  CHECK (workspace_type IN ('personal', 'organization', 'team')),
ADD COLUMN IF NOT EXISTS workspace_id UUID,
ADD COLUMN IF NOT EXISTS connected_by UUID REFERENCES auth.users(id);

-- Backfill existing integrations as 'personal'
UPDATE integrations
SET
  workspace_type = 'personal',
  workspace_id = NULL,
  connected_by = user_id
WHERE workspace_type IS NULL;

-- Make workspace_type NOT NULL after backfill
ALTER TABLE integrations
ALTER COLUMN workspace_type SET NOT NULL,
ALTER COLUMN workspace_type SET DEFAULT 'personal';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_integrations_workspace
  ON integrations(workspace_type, workspace_id);
CREATE INDEX IF NOT EXISTS idx_integrations_connected_by
  ON integrations(connected_by);

-- ================================================================
-- CREATE INTEGRATION PERMISSIONS TABLE
-- ================================================================

CREATE TABLE IF NOT EXISTS integration_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL CHECK (permission IN ('use', 'manage', 'admin')),
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  granted_by UUID REFERENCES auth.users(id),
  UNIQUE(integration_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_integration_permissions_user
  ON integration_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_integration_permissions_integration
  ON integration_permissions(integration_id);

-- ================================================================
-- RLS POLICIES FOR INTEGRATION PERMISSIONS
-- ================================================================

ALTER TABLE integration_permissions ENABLE ROW LEVEL SECURITY;

-- Users can view their own permissions
CREATE POLICY "Users can view own permissions"
  ON integration_permissions FOR SELECT
  USING (user_id = auth.uid());

-- Admins can grant/revoke permissions
CREATE POLICY "Admins can manage permissions"
  ON integration_permissions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM integration_permissions ip
      WHERE ip.integration_id = integration_permissions.integration_id
      AND ip.user_id = auth.uid()
      AND ip.permission = 'admin'
    )
  );

-- ================================================================
-- HELPER FUNCTIONS
-- ================================================================

-- Get user's permission for integration
CREATE OR REPLACE FUNCTION get_user_integration_permission(
  p_user_id UUID,
  p_integration_id UUID
)
RETURNS TEXT AS $$
DECLARE
  v_permission TEXT;
BEGIN
  SELECT permission INTO v_permission
  FROM integration_permissions
  WHERE user_id = p_user_id
  AND integration_id = p_integration_id;

  RETURN v_permission;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Check if user can use integration
CREATE OR REPLACE FUNCTION can_user_use_integration(
  p_user_id UUID,
  p_integration_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM integration_permissions
    WHERE user_id = p_user_id
    AND integration_id = p_integration_id
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Check if user can admin integration
CREATE OR REPLACE FUNCTION can_user_admin_integration(
  p_user_id UUID,
  p_integration_id UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM integration_permissions
    WHERE user_id = p_user_id
    AND integration_id = p_integration_id
    AND permission = 'admin'
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_user_integration_permission TO authenticated;
GRANT EXECUTE ON FUNCTION can_user_use_integration TO authenticated;
GRANT EXECUTE ON FUNCTION can_user_admin_integration TO authenticated;

-- ================================================================
-- BACKFILL PERMISSIONS FOR EXISTING INTEGRATIONS
-- ================================================================

-- Grant 'admin' permission to existing integration owners
INSERT INTO integration_permissions (integration_id, user_id, permission, granted_by)
SELECT id, user_id, 'admin', user_id
FROM integrations
WHERE user_id IS NOT NULL
ON CONFLICT (integration_id, user_id) DO NOTHING;
```

---

### Step 2: Update OAuth Flow

**File:** `/app/api/auth/callback/[provider]/route.ts` (update existing)

**Key Changes:**

```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: { provider: string } }
) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')

  // NEW: Parse workspace context from state
  const workspaceContext = parseWorkspaceContextFromState(state)
  // Returns: { type: 'personal' | 'team' | 'organization', id?: string }

  // Exchange code for tokens...
  const tokens = await exchangeCodeForTokens(code, provider)

  // NEW: Save integration with workspace context
  const { data: integration, error } = await supabase
    .from('integrations')
    .insert({
      provider,
      tokens: encryptTokens(tokens),
      workspace_type: workspaceContext.type,
      workspace_id: workspaceContext.id || null,
      user_id: workspaceContext.type === 'personal' ? user.id : null,
      connected_by: user.id,
      status: 'connected'
    })
    .select()
    .single()

  if (error) {
    return errorResponse('Failed to save integration', 500)
  }

  // NEW: Grant permissions based on workspace type
  await grantIntegrationPermissions(
    integration.id,
    workspaceContext,
    user.id
  )

  // Redirect back to integrations page
  return NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_BASE_URL}/integrations?success=true`
  )
}

// ================================================================
// HELPER: Parse workspace context from OAuth state
// ================================================================
function parseWorkspaceContextFromState(state: string | null): {
  type: 'personal' | 'team' | 'organization'
  id?: string
} {
  if (!state) return { type: 'personal' }

  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64').toString())
    return {
      type: decoded.workspace_type || 'personal',
      id: decoded.workspace_id
    }
  } catch {
    return { type: 'personal' }
  }
}

// ================================================================
// HELPER: Grant permissions after integration connection
// ================================================================
async function grantIntegrationPermissions(
  integrationId: string,
  context: { type: string; id?: string },
  connectedBy: string
) {
  const supabase = createSupabaseRouteHandlerClient()

  // 1. Grant 'admin' to connector
  await supabase.from('integration_permissions').insert({
    integration_id: integrationId,
    user_id: connectedBy,
    permission: 'admin',
    granted_by: connectedBy
  })

  // 2. Personal integration - only connector has access
  if (context.type === 'personal') {
    return
  }

  // 3. Team integration - grant 'use' to all team members
  if (context.type === 'team' && context.id) {
    const { data: members } = await queryWithTimeout(
      supabase
        .from('team_members')
        .select('user_id, role')
        .eq('team_id', context.id),
      8000
    )

    if (members) {
      const permissions = members.map(member => ({
        integration_id: integrationId,
        user_id: member.user_id,
        permission: ['owner', 'admin'].includes(member.role) ? 'admin' : 'use',
        granted_by: connectedBy
      }))

      await supabase
        .from('integration_permissions')
        .insert(permissions)
        .onConflict('integration_id, user_id')
        .ignore()
    }
  }

  // 4. Organization integration - grant 'use' to all org members
  if (context.type === 'organization' && context.id) {
    const { data: members } = await queryWithTimeout(
      supabase.rpc('get_organization_members', {
        p_organization_id: context.id
      }),
      8000
    )

    if (members) {
      const permissions = members.map(member => ({
        integration_id: integrationId,
        user_id: member.user_id,
        permission: member.is_admin ? 'admin' : 'use',
        granted_by: connectedBy
      }))

      await supabase
        .from('integration_permissions')
        .insert(permissions)
        .onConflict('integration_id, user_id')
        .ignore()
    }
  }
}
```

---

### Step 3: Update Integration Connect Button

**When user clicks "Connect Gmail" in UI:**

```typescript
// components/integrations/ConnectIntegrationButton.tsx

"use client"

import { useWorkspaceContext } from '@/components/providers/WorkspaceContextProvider'
import { Button } from '@/components/ui/button'

export function ConnectIntegrationButton({ provider }: { provider: string }) {
  const { currentContext } = useWorkspaceContext()

  const handleConnect = async () => {
    // Encode workspace context into OAuth state
    const state = Buffer.from(JSON.stringify({
      workspace_type: currentContext.type,
      workspace_id: currentContext.type === 'personal'
        ? undefined
        : currentContext.organizationId || currentContext.teamId
    })).toString('base64')

    // Redirect to OAuth with state
    const authUrl = `/api/auth/connect/${provider}?state=${state}`
    window.location.href = authUrl
  }

  return (
    <Button onClick={handleConnect}>
      Connect {provider}
    </Button>
  )
}
```

---

### Step 4: Fetch Integrations for Current Workspace

**API Route:** `/app/api/integrations/route.ts`

```typescript
export async function GET(request: NextRequest) {
  const supabase = createSupabaseRouteHandlerClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return errorResponse('Not authenticated', 401)
  }

  // Get workspace context from query params
  const url = new URL(request.url)
  const workspaceType = url.searchParams.get('workspace_type') || 'personal'
  const workspaceId = url.searchParams.get('workspace_id')

  // Build query based on workspace
  let query = supabase
    .from('integrations')
    .select(`
      *,
      permissions:integration_permissions!inner(permission)
    `)

  if (workspaceType === 'personal') {
    query = query
      .eq('workspace_type', 'personal')
      .eq('user_id', user.id)
  } else if (workspaceType === 'team' && workspaceId) {
    query = query
      .eq('workspace_type', 'team')
      .eq('workspace_id', workspaceId)
  } else if (workspaceType === 'organization' && workspaceId) {
    query = query
      .eq('workspace_type', 'organization')
      .eq('workspace_id', workspaceId)
  }

  // Filter to only integrations user has permission to see
  query = query.eq('permissions.user_id', user.id)

  const { data, error } = await queryWithTimeout(query, 8000)

  if (error) {
    return errorResponse(error.message, 500)
  }

  return jsonResponse(data)
}
```

---

### Step 5: Update Workflow Builder Integration Selector

**File:** `/components/workflows/configuration/IntegrationSelector.tsx`

```typescript
"use client"

import { useEffect, useState } from 'react'
import { useWorkspaceContext } from '@/components/providers/WorkspaceContextProvider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function IntegrationSelector({ provider }: { provider: string }) {
  const { currentContext } = useWorkspaceContext()
  const [integrations, setIntegrations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchIntegrations()
  }, [currentContext, provider])

  const fetchIntegrations = async () => {
    setLoading(true)

    const params = new URLSearchParams({
      workspace_type: currentContext.type,
      provider
    })

    if (currentContext.type === 'team') {
      params.set('workspace_id', currentContext.teamId)
    } else if (currentContext.type === 'organization') {
      params.set('workspace_id', currentContext.organizationId)
    }

    const response = await fetch(`/api/integrations?${params}`)
    const data = await response.json()

    setIntegrations(data)
    setLoading(false)
  }

  if (loading) {
    return <div>Loading integrations...</div>
  }

  if (integrations.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No {provider} integration connected for this workspace.
        {currentContext.type !== 'personal' && (
          <p>Ask your team admin to connect {provider}.</p>
        )}
      </div>
    )
  }

  return (
    <Select>
      <SelectTrigger>
        <SelectValue placeholder="Select account" />
      </SelectTrigger>
      <SelectContent>
        {integrations.map((integration) => (
          <SelectItem key={integration.id} value={integration.id}>
            {integration.account_email || integration.account_name}
            {integration.workspace_type !== 'personal' && (
              <span className="text-muted-foreground ml-2">
                ({integration.workspace_type})
              </span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
```

---

## 🎯 User Experience Scenarios

### Scenario 1: Marcus in Personal Workspace

**Context:** Marcus switches workspace switcher to "Personal"

**Integrations Page:**
- Shows only Marcus's personal integrations
- Marcus can connect/disconnect any integration
- "Connect Gmail" → Creates personal integration

**Workflow Builder:**
- Gmail node → Only shows Marcus's personal Gmail
- Slack node → Only shows Marcus's personal Slack
- Cannot see team integrations

---

### Scenario 2: Marcus in Marketing Team Workspace

**Context:** Marcus switches to "BrightSpark Marketing Team"

**Integrations Page (Marcus is regular member):**
- Shows team's 5 integrations
- Marcus sees "View Details" (read-only)
- Marcus CANNOT disconnect integrations
- "Connect Gmail" button is HIDDEN (not admin)

**Integrations Page (Alice is team admin):**
- Shows team's 5 integrations
- Alice can "Reconnect" or "Disconnect"
- Alice can "Connect Gmail" → Creates team integration
- All team members auto-get 'use' permission

**Workflow Builder:**
- Gmail node → Shows team Gmail (company-marketing@...)
- Marcus can SELECT team Gmail for workflow
- Workflow uses team's shared Gmail account
- If Marcus leaves team, workflow still works

---

### Scenario 3: Non-Admin Tries to Disconnect Team Integration

**Marcus clicks "Disconnect" on team Gmail:**

```
❌ Permission Dialog:
You don't have permission to disconnect this integration.

Options:
• Ask your team admin (Alice, Bob)
• Switch to Personal workspace to manage your own integrations
• Switch to a team where you're an admin

[Switch to Personal] [OK]
```

**If Marcus clicks "Switch to Personal":**
- Workspace switcher changes to "Personal"
- Integrations page reloads
- Now shows Marcus's personal integrations
- Marcus can manage these freely

---

## 🚀 Migration Path

### For Existing Integrations

**All existing integrations become "personal":**

```sql
-- Backfill script (already in migration above)
UPDATE integrations
SET
  workspace_type = 'personal',
  workspace_id = NULL,
  connected_by = user_id
WHERE workspace_type IS NULL;

-- Grant admin permission to existing owners
INSERT INTO integration_permissions (integration_id, user_id, permission, granted_by)
SELECT id, user_id, 'admin', user_id
FROM integrations
WHERE user_id IS NOT NULL
ON CONFLICT DO NOTHING;
```

**No breaking changes** - users keep their existing integrations.

---

## 📋 Implementation Checklist

- [ ] **Phase 1: Database**
  - [ ] Add workspace columns to integrations table
  - [ ] Create integration_permissions table
  - [ ] Create helper functions (can_user_admin_integration, etc.)
  - [ ] Backfill existing integrations as 'personal'
  - [ ] Grant admin permissions to existing owners

- [ ] **Phase 2: OAuth Flow**
  - [ ] Update OAuth callback to accept workspace context
  - [ ] Parse workspace from state parameter
  - [ ] Save integration with workspace_type and workspace_id
  - [ ] Auto-grant permissions based on workspace type

- [ ] **Phase 3: API Routes**
  - [ ] Update GET /api/integrations to filter by workspace
  - [ ] Update POST /api/integrations/connect to include workspace
  - [ ] Update DELETE /api/integrations/:id to check permissions
  - [ ] Add PUT /api/integrations/:id/reconnect with permission check

- [ ] **Phase 4: UI Components**
  - [ ] Update Workspace Switcher to show integration counts
  - [ ] Update Integrations page to be context-aware
  - [ ] Add permission checks to Connect/Disconnect buttons
  - [ ] Add "Insufficient Permissions" dialog
  - [ ] Update workflow builder integration selector

- [ ] **Phase 5: Testing**
  - [ ] Test personal integration creation
  - [ ] Test team integration creation (admin)
  - [ ] Test permission denial (non-admin tries to disconnect)
  - [ ] Test workspace switching updates available integrations
  - [ ] Test workflow execution uses correct integration

---

## 🎉 Success Metrics

When complete:
✅ Integrations scoped to workspaces (personal/team/org)
✅ Workspace switcher controls which integrations are shown
✅ Non-admins cannot disconnect team integrations
✅ Permission dialog guides users to correct workspace
✅ Workflow builder only shows integrations for current workspace
✅ Team integrations survive member turnover
✅ Zero permission bypasses or security holes
