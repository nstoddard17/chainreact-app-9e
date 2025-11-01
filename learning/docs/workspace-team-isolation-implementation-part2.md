# Workspace & Team Isolation Implementation Guide (Part 2)

**Continuation of:** `workspace-team-isolation-implementation.md`

---

## Phase 3: Frontend State Management

### 3.1 - Update workflowStore for Team Filtering

**File:** `/stores/workflowStore.ts`

**Objectives:**
- **UNIFIED VIEW**: Fetch ALL workflows by default
- Optional filtering by context
- Group workflows by context (personal, teams, orgs) for UI
- Fetch workflows with team/org metadata

**Key Changes (Option B: Unified View):**

```typescript
"use client"

import { create } from "zustand"
import { getSupabaseClient } from "@/lib/supabase"
import { queryWithTimeout, fetchWithTimeout } from '@/lib/utils/fetch-with-timeout'
import { logger } from '@/lib/utils/logger'
import { WorkspaceContext } from '@/lib/utils/team-context'

// ================================================================
// TYPES
// ================================================================

interface Team {
  id: string
  name: string
  slug: string
  color: string
}

interface Organization {
  id: string
  name: string
  slug: string
}

interface WorkflowCreator {
  id: string
  email: string
  full_name?: string
  username?: string
}

interface Workflow {
  id: string
  name: string
  description?: string
  user_id: string
  organization_id?: string
  team_id?: string
  visibility: 'private' | 'team' | 'organization' | 'public'
  folder_id?: string
  nodes: any[]
  connections: any[]
  status: 'draft' | 'active' | 'inactive'
  created_at: string
  updated_at: string

  // Joined data
  team?: Team
  organization?: Organization
  creator?: WorkflowCreator
}

interface WorkflowState {
  workflows: Workflow[]
  currentWorkflow: Workflow | null
  currentContext: WorkspaceContext
  loading: boolean
  error: string | null
}

interface WorkflowActions {
  // Context management
  setContext: (context: WorkspaceContext) => void

  // Workflow CRUD
  fetchWorkflows: (context?: WorkspaceContext) => Promise<void>
  fetchWorkflow: (id: string) => Promise<Workflow | null>
  createWorkflow: (data: CreateWorkflowData) => Promise<Workflow>
  updateWorkflow: (id: string, data: Partial<Workflow>) => Promise<void>
  deleteWorkflow: (id: string) => Promise<void>

  // Filtering
  getWorkflowsByTeam: (teamId: string) => Workflow[]
  getWorkflowsByVisibility: (visibility: string) => Workflow[]

  // Utility
  setCurrentWorkflow: (workflow: Workflow | null) => void
  clearError: () => void
}

interface CreateWorkflowData {
  name: string
  description?: string
  organization_id?: string
  team_id?: string
  visibility?: 'private' | 'team' | 'organization'
  folder_id?: string
  status?: 'draft' | 'active'
}

// ================================================================
// STORE
// ================================================================

export const useWorkflowStore = create<WorkflowState & WorkflowActions>((set, get) => ({
  workflows: [],
  currentWorkflow: null,
  currentContext: { type: 'personal' },
  loading: false,
  error: null,

  // ================================================================
  // CONTEXT MANAGEMENT
  // ================================================================

  setContext: (context: WorkspaceContext) => {
    set({ currentContext: context })
    // Auto-fetch workflows for new context
    get().fetchWorkflows(context)
  },

  // ================================================================
  // FETCH WORKFLOWS
  // ================================================================

  fetchWorkflows: async (filter?: { context?: WorkspaceContext; visibility?: string }) => {
    set({ loading: true, error: null })

    try {
      // ================================================================
      // OPTION B: Fetch ALL workflows by default
      // ================================================================

      const params = new URLSearchParams()

      // Apply OPTIONAL filters if provided
      if (filter?.context) {
        const ctx = filter.context

        if (ctx.type === 'personal') {
          params.set('filter_context', 'personal')
        } else if (ctx.type === 'organization') {
          params.set('filter_context', 'organization')
          params.set('organization_id', ctx.organizationId)
        } else if (ctx.type === 'team') {
          params.set('filter_context', 'team')
          params.set('team_id', ctx.teamId)
          if (ctx.organizationId) {
            params.set('organization_id', ctx.organizationId)
          }
        }
      }

      // Apply visibility filter if specified
      if (filter?.visibility) {
        params.set('visibility', filter.visibility)
      }

      // Default: Fetch ALL workflows user can access (no params)
      const url = `/api/workflows${params.toString() ? `?${params.toString()}` : ''}`

      const response = await fetchWithTimeout(url, {}, 8000)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch workflows')
      }

      const workflows = await response.json()

      set({
        workflows,
        loading: false
      })
    } catch (error: any) {
      logger.error('Fetch workflows error:', error)
      set({
        error: error.message || 'Failed to fetch workflows',
        loading: false
      })
    }
  },

  // ================================================================
  // FETCH SINGLE WORKFLOW
  // ================================================================

  fetchWorkflow: async (id: string) => {
    try {
      const response = await fetchWithTimeout(`/api/workflows/${id}`, {}, 8000)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch workflow')
      }

      const workflow = await response.json()
      return workflow
    } catch (error: any) {
      logger.error('Fetch workflow error:', error)
      set({ error: error.message })
      return null
    }
  },

  // ================================================================
  // CREATE WORKFLOW
  // ================================================================

  createWorkflow: async (data: CreateWorkflowData) => {
    const ctx = get().currentContext

    // Apply context to workflow data
    const workflowData: CreateWorkflowData = {
      ...data,
      organization_id: data.organization_id || (ctx.type === 'organization' ? ctx.organizationId : undefined),
      team_id: data.team_id || (ctx.type === 'team' ? ctx.teamId : undefined),
      visibility: data.visibility || (ctx.type === 'team' ? 'team' : 'private')
    }

    try {
      const response = await fetchWithTimeout(
        '/api/workflows',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(workflowData),
        },
        8000
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create workflow')
      }

      const result = await response.json()
      const workflow = result.workflow

      // Add to local state
      set((state) => ({
        workflows: [workflow, ...state.workflows],
      }))

      return workflow
    } catch (error: any) {
      logger.error('Create workflow error:', error)
      set({ error: error.message || 'Failed to create workflow' })
      throw error
    }
  },

  // ================================================================
  // UPDATE WORKFLOW
  // ================================================================

  updateWorkflow: async (id: string, data: Partial<Workflow>) => {
    try {
      const response = await fetchWithTimeout(
        `/api/workflows/${id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        },
        8000
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update workflow')
      }

      const result = await response.json()
      const updatedWorkflow = result.workflow

      // Update local state
      set((state) => ({
        workflows: state.workflows.map((w) =>
          w.id === id ? { ...w, ...updatedWorkflow } : w
        ),
        currentWorkflow:
          state.currentWorkflow?.id === id
            ? { ...state.currentWorkflow, ...updatedWorkflow }
            : state.currentWorkflow,
      }))
    } catch (error: any) {
      logger.error('Update workflow error:', error)
      set({ error: error.message })
      throw error
    }
  },

  // ================================================================
  // DELETE WORKFLOW
  // ================================================================

  deleteWorkflow: async (id: string) => {
    try {
      const response = await fetchWithTimeout(
        `/api/workflows/${id}`,
        {
          method: 'DELETE',
        },
        8000
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to delete workflow')
      }

      // Remove from local state
      set((state) => ({
        workflows: state.workflows.filter((w) => w.id !== id),
        currentWorkflow: state.currentWorkflow?.id === id ? null : state.currentWorkflow,
      }))
    } catch (error: any) {
      logger.error('Delete workflow error:', error)
      set({ error: error.message })
      throw error
    }
  },

  // ================================================================
  // FILTERING & GROUPING (for Option B: Unified View)
  // ================================================================

  getWorkflowsByTeam: (teamId: string) => {
    return get().workflows.filter((w) => w.team_id === teamId)
  },

  getWorkflowsByVisibility: (visibility: string) => {
    return get().workflows.filter((w) => w.visibility === visibility)
  },

  // NEW: Group workflows by context for folder-based UI
  getGroupedWorkflows: () => {
    const { workflows } = get()

    const grouped: {
      personal: Workflow[]
      organizations: Record<string, {
        org: Organization
        teams: Record<string, { team: Team; workflows: Workflow[] }>
        shared: Workflow[]
      }>
      standaloneTeams: Record<string, { team: Team; workflows: Workflow[] }>
    } = {
      personal: [],
      organizations: {},
      standaloneTeams: {}
    }

    workflows.forEach(workflow => {
      // Personal workflows
      if (!workflow.organization_id && !workflow.team_id) {
        grouped.personal.push(workflow)
        return
      }

      // Organization workflows
      if (workflow.organization_id) {
        const orgId = workflow.organization_id

        // Initialize organization if not exists
        if (!grouped.organizations[orgId] && workflow.organization) {
          grouped.organizations[orgId] = {
            org: workflow.organization,
            teams: {},
            shared: []
          }
        }

        const org = grouped.organizations[orgId]
        if (!org) return

        // Team-specific workflow
        if (workflow.team_id && workflow.team) {
          const teamId = workflow.team_id

          if (!org.teams[teamId]) {
            org.teams[teamId] = {
              team: workflow.team,
              workflows: []
            }
          }

          org.teams[teamId].workflows.push(workflow)
        }
        // Organization-wide workflow
        else {
          org.shared.push(workflow)
        }
        return
      }

      // Standalone team workflows
      if (workflow.team_id && !workflow.organization_id && workflow.team) {
        const teamId = workflow.team_id

        if (!grouped.standaloneTeams[teamId]) {
          grouped.standaloneTeams[teamId] = {
            team: workflow.team,
            workflows: []
          }
        }

        grouped.standaloneTeams[teamId].workflows.push(workflow)
      }
    })

    return grouped
  },

  // ================================================================
  // UTILITY
  // ================================================================

  setCurrentWorkflow: (workflow: Workflow | null) => {
    set({ currentWorkflow: workflow })
  },

  clearError: () => {
    set({ error: null })
  },
}))
```

**Key Additions (Option B: Unified View):**
1. ✅ `fetchWorkflows()` fetches ALL workflows by default (no context filtering required)
2. ✅ Optional filtering via `filter` parameter: `{ context, visibility }`
3. ✅ `getGroupedWorkflows()` organizes workflows by context for folder-based UI
4. ✅ `createWorkflow()` still respects context for creating new workflows
5. ✅ Workflows include `team`, `organization`, `creator` metadata
6. ✅ Helper methods `getWorkflowsByTeam()`, `getWorkflowsByVisibility()`

**Usage Example:**
```typescript
// Fetch ALL workflows (personal + teams + orgs)
await fetchWorkflows()

// Group for UI display
const grouped = getGroupedWorkflows()
// Returns:
// {
//   personal: [workflow1, workflow2, ...],
//   organizations: {
//     'org-123': {
//       org: { id, name, slug },
//       teams: {
//         'team-marketing': { team: {...}, workflows: [...] },
//         'team-sales': { team: {...}, workflows: [...] }
//       },
//       shared: [orgWorkflow1, orgWorkflow2, ...]
//     }
//   },
//   standaloneTeams: {
//     'team-456': { team: {...}, workflows: [...] }
//   }
// }

// Optional: Filter to specific context
await fetchWorkflows({ context: { type: 'team', teamId: 'team-123' } })

// Optional: Filter by visibility
await fetchWorkflows({ visibility: 'private' })
```

---

### 3.2 - Create teamStore for Team State

**File:** `/stores/teamStore.ts`

**Objectives:**
- Manage team data and memberships
- Cache team queries
- Provide team context utilities

**Implementation:**

```typescript
"use client"

import { create } from "zustand"
import { fetchWithTimeout, queryWithTimeout } from '@/lib/utils/fetch-with-timeout'
import { logger } from '@/lib/utils/logger'
import { getSupabaseClient } from '@/lib/supabase'

// ================================================================
// TYPES
// ================================================================

interface Team {
  id: string
  organization_id?: string
  name: string
  slug: string
  description?: string
  color: string
  settings: any
  created_by: string
  created_at: string
  updated_at: string
}

interface TeamMember {
  id: string
  team_id: string
  user_id: string
  role: 'owner' | 'admin' | 'manager' | 'hr' | 'finance' | 'lead' | 'member' | 'guest'
  joined_at: string
  user?: {
    email: string
    full_name?: string
    username?: string
  }
}

interface TeamState {
  teams: Team[]
  currentTeam: Team | null
  members: TeamMember[]
  userRole: string | null
  loading: boolean
  error: string | null
}

interface TeamActions {
  fetchTeams: () => Promise<void>
  fetchTeamsByOrganization: (orgId: string) => Promise<void>
  fetchTeam: (id: string) => Promise<void>
  createTeam: (data: CreateTeamData) => Promise<Team>
  updateTeam: (id: string, data: Partial<Team>) => Promise<void>
  deleteTeam: (id: string) => Promise<void>

  fetchMembers: (teamId: string) => Promise<void>
  inviteMember: (teamId: string, userId: string, role: string) => Promise<void>
  updateMemberRole: (memberId: string, role: string) => Promise<void>
  removeMember: (memberId: string) => Promise<void>

  setCurrentTeam: (team: Team | null) => void
  getUserRole: (teamId: string) => string | null
  clearError: () => void
}

interface CreateTeamData {
  name: string
  slug: string
  description?: string
  organization_id?: string
  color?: string
}

// ================================================================
// STORE
// ================================================================

export const useTeamStore = create<TeamState & TeamActions>((set, get) => ({
  teams: [],
  currentTeam: null,
  members: [],
  userRole: null,
  loading: false,
  error: null,

  // ================================================================
  // FETCH TEAMS
  // ================================================================

  fetchTeams: async () => {
    set({ loading: true, error: null })

    try {
      const response = await fetchWithTimeout('/api/teams', {}, 8000)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch teams')
      }

      const teams = await response.json()
      set({ teams, loading: false })
    } catch (error: any) {
      logger.error('Fetch teams error:', error)
      set({
        error: error.message || 'Failed to fetch teams',
        loading: false
      })
    }
  },

  // ================================================================
  // FETCH TEAMS BY ORGANIZATION
  // ================================================================

  fetchTeamsByOrganization: async (orgId: string) => {
    set({ loading: true, error: null })

    try {
      const response = await fetchWithTimeout(
        `/api/teams?organization_id=${orgId}`,
        {},
        8000
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch teams')
      }

      const teams = await response.json()
      set({ teams, loading: false })
    } catch (error: any) {
      logger.error('Fetch teams by org error:', error)
      set({
        error: error.message || 'Failed to fetch teams',
        loading: false
      })
    }
  },

  // ================================================================
  // FETCH SINGLE TEAM
  // ================================================================

  fetchTeam: async (id: string) => {
    set({ loading: true, error: null })

    try {
      const response = await fetchWithTimeout(`/api/teams/${id}`, {}, 8000)

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch team')
      }

      const team = await response.json()
      set({
        currentTeam: team,
        loading: false
      })

      // Fetch members for this team
      await get().fetchMembers(id)
    } catch (error: any) {
      logger.error('Fetch team error:', error)
      set({
        error: error.message || 'Failed to fetch team',
        loading: false
      })
    }
  },

  // ================================================================
  // CREATE TEAM
  // ================================================================

  createTeam: async (data: CreateTeamData) => {
    try {
      const response = await fetchWithTimeout(
        '/api/teams',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        },
        8000
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create team')
      }

      const team = await response.json()

      set((state) => ({
        teams: [team, ...state.teams],
      }))

      return team
    } catch (error: any) {
      logger.error('Create team error:', error)
      set({ error: error.message || 'Failed to create team' })
      throw error
    }
  },

  // ================================================================
  // UPDATE TEAM
  // ================================================================

  updateTeam: async (id: string, data: Partial<Team>) => {
    try {
      const response = await fetchWithTimeout(
        `/api/teams/${id}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(data),
        },
        8000
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update team')
      }

      const updatedTeam = await response.json()

      set((state) => ({
        teams: state.teams.map((t) => (t.id === id ? updatedTeam : t)),
        currentTeam: state.currentTeam?.id === id ? updatedTeam : state.currentTeam,
      }))
    } catch (error: any) {
      logger.error('Update team error:', error)
      set({ error: error.message })
      throw error
    }
  },

  // ================================================================
  // DELETE TEAM
  // ================================================================

  deleteTeam: async (id: string) => {
    try {
      const response = await fetchWithTimeout(
        `/api/teams/${id}`,
        {
          method: 'DELETE',
        },
        8000
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to delete team')
      }

      set((state) => ({
        teams: state.teams.filter((t) => t.id !== id),
        currentTeam: state.currentTeam?.id === id ? null : state.currentTeam,
      }))
    } catch (error: any) {
      logger.error('Delete team error:', error)
      set({ error: error.message })
      throw error
    }
  },

  // ================================================================
  // FETCH MEMBERS
  // ================================================================

  fetchMembers: async (teamId: string) => {
    try {
      const response = await fetchWithTimeout(
        `/api/teams/${teamId}/members`,
        {},
        8000
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to fetch members')
      }

      const data = await response.json()
      const members = data.members || data

      // Get current user's role
      const supabase = getSupabaseClient()
      if (supabase) {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const userMember = members.find((m: TeamMember) => m.user_id === user.id)
          set({
            members,
            userRole: userMember?.role || null
          })
          return
        }
      }

      set({ members })
    } catch (error: any) {
      logger.error('Fetch members error:', error)
      set({ error: error.message })
    }
  },

  // ================================================================
  // INVITE MEMBER
  // ================================================================

  inviteMember: async (teamId: string, userId: string, role: string) => {
    try {
      const response = await fetchWithTimeout(
        `/api/teams/${teamId}/members`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ user_id: userId, role }),
        },
        8000
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to invite member')
      }

      // Refresh members list
      await get().fetchMembers(teamId)
    } catch (error: any) {
      logger.error('Invite member error:', error)
      set({ error: error.message })
      throw error
    }
  },

  // ================================================================
  // UPDATE MEMBER ROLE
  // ================================================================

  updateMemberRole: async (memberId: string, role: string) => {
    try {
      const response = await fetchWithTimeout(
        `/api/team-members/${memberId}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ role }),
        },
        8000
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update role')
      }

      set((state) => ({
        members: state.members.map((m) =>
          m.id === memberId ? { ...m, role: role as any } : m
        ),
      }))
    } catch (error: any) {
      logger.error('Update member role error:', error)
      set({ error: error.message })
      throw error
    }
  },

  // ================================================================
  // REMOVE MEMBER
  // ================================================================

  removeMember: async (memberId: string) => {
    try {
      const response = await fetchWithTimeout(
        `/api/team-members/${memberId}`,
        {
          method: 'DELETE',
        },
        8000
      )

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to remove member')
      }

      set((state) => ({
        members: state.members.filter((m) => m.id !== memberId),
      }))
    } catch (error: any) {
      logger.error('Remove member error:', error)
      set({ error: error.message })
      throw error
    }
  },

  // ================================================================
  // UTILITY
  // ================================================================

  setCurrentTeam: (team: Team | null) => {
    set({ currentTeam: team })
  },

  getUserRole: (teamId: string) => {
    const { members } = get()
    const supabase = getSupabaseClient()

    if (!supabase) return null

    // This is synchronous - assumes members are already loaded
    // For async, use fetchMembers first
    return null // Implement if needed
  },

  clearError: () => {
    set({ error: null })
  },
}))
```

---

### 3.3 - Update organizationStore for Team Queries

**File:** `/stores/organizationStore.ts` (update existing)

**Add these methods to existing store:**

```typescript
// Add to existing organizationStore.ts

// ================================================================
// NEW: Fetch teams for organization
// ================================================================
fetchTeams: async (orgId: string) => {
  const supabase = getSupabaseClient()
  if (!supabase) {
    set({ error: 'Supabase client not configured' })
    return []
  }

  try {
    const { data, error } = await queryWithTimeout(
      supabase
        .from("teams")
        .select(`
          *,
          member_count:team_members(count)
        `)
        .eq("organization_id", orgId)
        .order("name"),
      8000
    )

    if (error) throw error

    return data || []
  } catch (error: any) {
    set({ error: error.message })
    return []
  }
},

// ================================================================
// NEW: Get user's teams in current organization
// ================================================================
fetchUserTeamsInOrg: async (orgId: string) => {
  const supabase = getSupabaseClient()
  if (!supabase) return []

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const { data, error } = await queryWithTimeout(
      supabase.rpc('get_user_teams_in_org', {
        p_user_id: user.id,
        p_organization_id: orgId
      }),
      8000
    )

    if (error) throw error

    return data || []
  } catch (error: any) {
    logger.error('Fetch user teams error:', error)
    return []
  }
},

// ================================================================
// NEW: Get organization task usage
// ================================================================
getOrganizationUsage: async (orgId: string) => {
  const supabase = getSupabaseClient()
  if (!supabase) return null

  try {
    const { data, error } = await queryWithTimeout(
      supabase
        .from("organizations")
        .select("tasks_limit, tasks_used, plan, billing_cycle_start, billing_cycle_end")
        .eq("id", orgId)
        .single(),
      8000
    )

    if (error) throw error

    return data
  } catch (error: any) {
    logger.error('Fetch org usage error:', error)
    return null
  }
}
```

---

### 3.4 - Create Workspace Context Provider

**File:** `/components/providers/WorkspaceContextProvider.tsx`

**Objectives:**
- React context for workspace state
- Provide workspace utilities to components
- Handle context switching

**Implementation:**

```typescript
"use client"

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { useAuthStore } from '@/stores/authStore'
import { useWorkflowStore } from '@/stores/workflowStore'
import { useOrganizationStore } from '@/stores/organizationStore'
import { useTeamStore } from '@/stores/teamStore'
import {
  WorkspaceContext,
  getStoredWorkspaceContext,
  storeWorkspaceContext,
  buildWorkflowsUrl
} from '@/lib/utils/team-context'
import { useRouter } from 'next/navigation'

// ================================================================
// CONTEXT TYPE
// ================================================================

interface WorkspaceContextValue {
  currentContext: WorkspaceContext
  switchToPersonal: () => void
  switchToOrganization: (orgId: string) => void
  switchToTeam: (teamId: string, orgId?: string) => void
  getContextLabel: () => string
  getContextIcon: () => 'user' | 'building' | 'users'
}

const WorkspaceContextContext = createContext<WorkspaceContextValue | undefined>(undefined)

// ================================================================
// PROVIDER
// ================================================================

export function WorkspaceContextProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const { user } = useAuthStore()
  const { setContext: setWorkflowContext } = useWorkflowStore()
  const [currentContext, setCurrentContext] = useState<WorkspaceContext>({ type: 'personal' })

  // Initialize context from localStorage on mount
  useEffect(() => {
    const stored = getStoredWorkspaceContext()
    if (stored) {
      setCurrentContext(stored)
      setWorkflowContext(stored)
    }
  }, [])

  // Switch to personal workspace
  const switchToPersonal = () => {
    const newContext: WorkspaceContext = { type: 'personal' }
    setCurrentContext(newContext)
    setWorkflowContext(newContext)
    storeWorkspaceContext(newContext)
    router.push('/workflows')
  }

  // Switch to organization
  const switchToOrganization = (orgId: string) => {
    const newContext: WorkspaceContext = { type: 'organization', organizationId: orgId }
    setCurrentContext(newContext)
    setWorkflowContext(newContext)
    storeWorkspaceContext(newContext)
    router.push(buildWorkflowsUrl(newContext))
  }

  // Switch to team
  const switchToTeam = (teamId: string, orgId?: string) => {
    const newContext: WorkspaceContext = {
      type: 'team',
      teamId,
      organizationId: orgId
    }
    setCurrentContext(newContext)
    setWorkflowContext(newContext)
    storeWorkspaceContext(newContext)
    router.push(buildWorkflowsUrl(newContext))
  }

  // Get context label for UI
  const getContextLabel = (): string => {
    if (currentContext.type === 'personal') return 'Personal'
    if (currentContext.type === 'organization') return 'Organization'
    if (currentContext.type === 'team') return 'Team'
    return 'Unknown'
  }

  // Get context icon
  const getContextIcon = (): 'user' | 'building' | 'users' => {
    if (currentContext.type === 'personal') return 'user'
    if (currentContext.type === 'organization') return 'building'
    return 'users'
  }

  const value: WorkspaceContextValue = {
    currentContext,
    switchToPersonal,
    switchToOrganization,
    switchToTeam,
    getContextLabel,
    getContextIcon
  }

  return (
    <WorkspaceContextContext.Provider value={value}>
      {children}
    </WorkspaceContextContext.Provider>
  )
}

// ================================================================
// HOOK
// ================================================================

export function useWorkspaceContext() {
  const context = useContext(WorkspaceContextContext)
  if (context === undefined) {
    throw new Error('useWorkspaceContext must be used within WorkspaceContextProvider')
  }
  return context
}
```

**Usage in app layout:**

```typescript
// app/layout.tsx or app/(dashboard)/layout.tsx

import { WorkspaceContextProvider } from '@/components/providers/WorkspaceContextProvider'

export default function Layout({ children }) {
  return (
    <WorkspaceContextProvider>
      {children}
    </WorkspaceContextProvider>
  )
}
```

---

### 3.5 - Update authStore to Track Current Workspace

**File:** `/stores/authStore.ts` (update existing)

**Add workspace tracking:**

```typescript
// Add to existing authStore interface
interface AuthState {
  // ... existing fields
  currentWorkspaceId: string | null
}

interface AuthActions {
  // ... existing methods
  setCurrentWorkspace: (workspaceId: string | null) => void
}

// In store implementation, add:
export const useAuthStore = create<AuthState & AuthActions>((set, get) => ({
  // ... existing state
  currentWorkspaceId: null,

  // ... existing methods

  setCurrentWorkspace: (workspaceId: string | null) => {
    set({ currentWorkspaceId: workspaceId })
    if (typeof window !== 'undefined') {
      if (workspaceId) {
        localStorage.setItem('current_workspace_id', workspaceId)
      } else {
        localStorage.removeItem('current_workspace_id')
      }
    }
  },

  // Update initialize to restore workspace
  initialize: async () => {
    // ... existing initialization code

    // Restore workspace context
    const storedWorkspaceId = typeof window !== 'undefined'
      ? localStorage.getItem('current_workspace_id')
      : null

    if (storedWorkspaceId) {
      set({ currentWorkspaceId: storedWorkspaceId })
    }
  }
}))
```

---

## Phase 4: UI Components

### 4.1 - Update OrganizationSwitcher with Team Info

**File:** `/components/new-design/OrganizationSwitcher.tsx` (update existing)

**Key Changes:**

```typescript
// In fetchOrganizations, also fetch team count and user's teams
const fetchOrganizations = async () => {
  try {
    setLoading(true)

    // Fetch organizations with team counts
    const response = await fetch('/api/organizations')
    if (!response.ok) throw new Error('Failed to fetch organizations')

    const data = await response.json()
    const allOrgs = Array.isArray(data.organizations) ? data.organizations : (Array.isArray(data) ? data : [])

    // For each org, fetch user's teams
    const orgsWithTeams = await Promise.all(
      allOrgs.map(async (org: Organization) => {
        const teamsResponse = await fetch(`/api/organizations/${org.id}/teams?user_only=true`)
        const teams = await teamsResponse.json()
        return {
          ...org,
          user_teams: teams || []
        }
      })
    )

    setOrganizations(orgsWithTeams)

    // ... rest of existing code
  } catch (error) {
    console.error('Error fetching organizations:', error)
    toast.error('Failed to load organizations')
  } finally {
    setLoading(false)
  }
}

// In dropdown menu, show teams under each organization
{organizations.map((org) => {
  const isWorkspace = (org as any).is_workspace || (org.team_count === 0 && org.member_count === 1)
  const userTeams = (org as any).user_teams || []

  return (
    <div key={org.id}>
      <DropdownMenuItem
        onClick={() => handleSwitchOrganization(org)}
        className="flex items-center justify-between cursor-pointer"
      >
        {/* ... existing org display ... */}
      </DropdownMenuItem>

      {/* Show user's teams in this org */}
      {!isWorkspace && userTeams.length > 0 && (
        <div className="ml-6 mt-1 space-y-1">
          {userTeams.map((team: any) => (
            <DropdownMenuItem
              key={team.id}
              onClick={() => handleSwitchToTeam(team.id, org.id)}
              className="flex items-center gap-2 text-xs cursor-pointer"
            >
              <Users className="w-3 h-3 text-muted-foreground" />
              <span>{team.name}</span>
              <div
                className="w-2 h-2 rounded-full ml-auto"
                style={{ backgroundColor: team.color }}
              />
            </DropdownMenuItem>
          ))}
        </div>
      )}
    </div>
  )
})}
```

---

### 4.2 - Create TeamBadge Component

**File:** `/components/workflows/TeamBadge.tsx`

**Objectives:**
- Display team ownership badge
- Show team color
- Clickable to filter by team

**Implementation:**

```typescript
"use client"

import { Users } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TeamBadgeProps {
  teamName: string
  teamColor: string
  size?: 'sm' | 'md' | 'lg'
  onClick?: () => void
  className?: string
}

export function TeamBadge({
  teamName,
  teamColor,
  size = 'sm',
  onClick,
  className
}: TeamBadgeProps) {
  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-3 py-1.5'
  }

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "inline-flex items-center gap-1 rounded-md font-medium transition-colors",
        "border border-transparent",
        sizeClasses[size],
        onClick && "hover:border-current cursor-pointer",
        !onClick && "cursor-default",
        className
      )}
      style={{
        backgroundColor: `${teamColor}20`,
        color: teamColor
      }}
    >
      <Users className={cn(
        size === 'sm' && "w-3 h-3",
        size === 'md' && "w-3.5 h-3.5",
        size === 'lg' && "w-4 h-4"
      )} />
      <span>{teamName}</span>
    </button>
  )
}

// ================================================================
// VISIBILITY BADGE
// ================================================================

interface VisibilityBadgeProps {
  visibility: 'private' | 'team' | 'organization' | 'public'
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function VisibilityBadge({
  visibility,
  size = 'sm',
  className
}: VisibilityBadgeProps) {
  const configs = {
    private: {
      label: 'Private',
      color: 'text-gray-600 bg-gray-100 dark:text-gray-400 dark:bg-gray-800'
    },
    team: {
      label: 'Team',
      color: 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30'
    },
    organization: {
      label: 'Organization',
      color: 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30'
    },
    public: {
      label: 'Public',
      color: 'text-purple-600 bg-purple-100 dark:text-purple-400 dark:bg-purple-900/30'
    }
  }

  const config = configs[visibility]

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-3 py-1.5'
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md font-medium",
        config.color,
        sizeClasses[size],
        className
      )}
    >
      {config.label}
    </span>
  )
}

// ================================================================
// CREATOR BADGE
// ================================================================

interface CreatorBadgeProps {
  creatorName: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function CreatorBadge({
  creatorName,
  size = 'sm',
  className
}: CreatorBadgeProps) {
  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-3 py-1.5'
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md font-medium",
        "text-muted-foreground bg-muted",
        sizeClasses[size],
        className
      )}
    >
      <span>👤</span>
      <span>{creatorName}</span>
    </span>
  )
}
```

**Usage:**
```typescript
<TeamBadge
  teamName="Marketing"
  teamColor="#3B82F6"
  onClick={() => filterByTeam('team-id')}
/>

<VisibilityBadge visibility="team" />

<CreatorBadge creatorName="Sarah" />
```

---

### 4.3 - Create TeamFilter Component

**File:** `/components/workflows/TeamFilter.tsx`

**Objectives:**
- Filter workflows by team
- Show all teams user has access to
- Quick toggle between teams

**Implementation:**

```typescript
"use client"

import { useState, useEffect } from 'react'
import { Check, Users, Building2, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTeamStore } from '@/stores/teamStore'
import { useWorkspaceContext } from '@/components/providers/WorkspaceContextProvider'
import { cn } from '@/lib/utils'

interface TeamFilterProps {
  selectedTeamId?: string | null
  onFilterChange: (teamId: string | null, visibility?: string) => void
}

export function TeamFilter({ selectedTeamId, onFilterChange }: TeamFilterProps) {
  const { currentContext } = useWorkspaceContext()
  const { teams, fetchTeamsByOrganization } = useTeamStore()
  const [loading, setLoading] = useState(false)

  // Fetch teams when in organization context
  useEffect(() => {
    if (currentContext.type === 'organization') {
      setLoading(true)
      fetchTeamsByOrganization(currentContext.organizationId).finally(() => setLoading(false))
    }
  }, [currentContext])

  // Don't show filter in personal context
  if (currentContext.type === 'personal') {
    return null
  }

  // Team context - no filter needed (already filtered)
  if (currentContext.type === 'team') {
    return (
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted text-sm">
        <Users className="w-4 h-4" />
        <span className="font-medium">Team View</span>
      </div>
    )
  }

  // Organization context - show team filter
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          {selectedTeamId ? (
            <>
              <Users className="w-4 h-4" />
              <span>{teams.find(t => t.id === selectedTeamId)?.name || 'Team'}</span>
            </>
          ) : (
            <>
              <Building2 className="w-4 h-4" />
              <span>All Teams</span>
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          FILTER BY TEAM
        </DropdownMenuLabel>

        {/* All teams option */}
        <DropdownMenuItem
          onClick={() => onFilterChange(null)}
          className="flex items-center justify-between cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-muted-foreground" />
            <span>All Teams</span>
          </div>
          {!selectedTeamId && <Check className="w-4 h-4 text-primary" />}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        {/* Team options */}
        {teams.length === 0 && (
          <div className="px-2 py-3 text-sm text-muted-foreground text-center">
            {loading ? 'Loading teams...' : 'No teams found'}
          </div>
        )}

        {teams.map((team) => (
          <DropdownMenuItem
            key={team.id}
            onClick={() => onFilterChange(team.id)}
            className="flex items-center justify-between cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: team.color }}
              />
              <span>{team.name}</span>
            </div>
            {selectedTeamId === team.id && <Check className="w-4 h-4 text-primary" />}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        {/* My workflows */}
        <DropdownMenuItem
          onClick={() => onFilterChange(null, 'private')}
          className="flex items-center gap-2 cursor-pointer"
        >
          <User className="w-4 h-4 text-muted-foreground" />
          <span>My Personal Workflows</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

**Usage in workflows page:**
```typescript
const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
const [selectedVisibility, setSelectedVisibility] = useState<string | undefined>()

// ... in render
<TeamFilter
  selectedTeamId={selectedTeamId}
  onFilterChange={(teamId, visibility) => {
    setSelectedTeamId(teamId)
    setSelectedVisibility(visibility)
    // Re-fetch workflows with filter
  }}
/>
```

---

## (Continued in workspace-team-isolation-implementation-part3.md for remaining sections)

**Phases remaining:**
- 4.4 - Update WorkflowCard with team badges
- 4.5 - Update workflow creation modal
- 4.6 - Update folder UI
- 4.7 - Add team selector to workflow builder
- Phase 5: Billing Integration
- Phase 6: Testing & Documentation