"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronsUpDown, Home, Loader2, Settings, Crown, Star, Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from "sonner"
import { useAuthStore } from "@/stores/authStore"
import { useWorkflowStore } from "@/stores/workflowStore"
import { useIntegrationStore } from "@/stores/integrationStore"
import { type UserRole } from "@/lib/utils/roles"
import { logger } from "@/lib/utils/logger"

interface Organization {
  id: string
  name: string
  slug: string
  description?: string
  user_role: string
  member_count: number
  team_count: number
  is_workspace?: boolean  // True if this is a personal workspace, not an organization
  integration_count?: number  // Number of integrations in this workspace
}

interface Workspace {
  id: string
  name: string
  slug: string
  description?: string
}

interface Team {
  id: string
  name: string
  slug: string
  description?: string
  workspace_id?: string
  organization_id?: string
}

export function OrganizationSwitcher() {
  const router = useRouter()
  const { user, profile } = useAuthStore()
  const { setWorkspaceContext, fetchWorkflows } = useWorkflowStore()
  const { fetchIntegrations } = useIntegrationStore()
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState(false)

  // Get user role for badge icon
  const isAdmin = profile?.admin === true
  const userRole = isAdmin ? 'admin' : ((profile?.role as UserRole) || 'free')

  // Map roles to icons
  const getRoleIcon = () => {
    switch (userRole) {
      case 'admin':
        return Crown
      case 'pro':
      case 'beta-pro':
        return Star
      case 'enterprise':
        return Shield
      default:
        return User
    }
  }

  const RoleIcon = getRoleIcon()

  // Fetch integration counts for each workspace
  const fetchIntegrationCounts = async (orgs: Organization[]) => {
    try {
      // Fetch counts for all organizations in parallel
      const countsPromises = orgs.map(async (org) => {
        const isWorkspace = org.is_workspace || (org.team_count === 0 && org.member_count === 1)
        const workspaceType = isWorkspace ? 'personal' : (org.team_count > 0 ? 'organization' : 'team')
        const workspaceId = isWorkspace ? undefined : org.id

        const params = new URLSearchParams({ workspace_type: workspaceType })
        if (workspaceId) params.append('workspace_id', workspaceId)

        try {
          const response = await fetch(`/api/integrations?${params.toString()}`)
          if (!response.ok) return { orgId: org.id, count: 0 }

          const data = await response.json()
          return { orgId: org.id, count: data.data?.length || 0 }
        } catch {
          return { orgId: org.id, count: 0 }
        }
      })

      const counts = await Promise.all(countsPromises)

      // Update organizations with integration counts
      return orgs.map(org => ({
        ...org,
        integration_count: counts.find(c => c.orgId === org.id)?.count || 0
      }))
    } catch (error) {
      logger.error('Error fetching integration counts:', error)
      return orgs
    }
  }

  // Fetch organizations
  const fetchOrganizations = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/organizations')

      // If response is not ok, handle gracefully
      if (!response.ok) {
        // Try to get error details
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error('[OrganizationSwitcher] API error:', {
          status: response.status,
          error: errorData
        })

        // If it's a server error (500) related to teams, just return empty array
        // User may not have any organizations yet
        if (response.status === 500) {
          console.warn('[OrganizationSwitcher] Treating 500 error as no organizations (user may not have any yet)')
          setOrganizations([])
          setLoading(false)
          return
        }

        throw new Error(`Failed to fetch organizations: ${response.status} - ${errorData.error || 'Unknown error'}`)
      }

      const data = await response.json()
      let allOrgs = Array.isArray(data.organizations) ? data.organizations : (Array.isArray(data) ? data : [])

      // Fetch integration counts for all orgs
      allOrgs = await fetchIntegrationCounts(allOrgs)

      // Include both workspaces and organizations - show all contexts user can switch between
      setOrganizations(allOrgs)

      // Set current org/workspace from localStorage or default to first available
      const storedOrgId = localStorage.getItem('current_workspace_id')
      if (storedOrgId && allOrgs.length > 0) {
        const org = allOrgs.find((o: Organization) => o.id === storedOrgId)
        if (org) {
          setCurrentOrg(org)
        } else {
          // Stored ID doesn't exist, default to first
          setCurrentOrg(allOrgs[0] || null)
        }
      } else if (allOrgs.length > 0) {
        setCurrentOrg(allOrgs[0])
      } else {
        // No organizations/workspaces exist
        setCurrentOrg(null)
        // Clear invalid workspace ID from localStorage
        localStorage.removeItem('current_workspace_id')
      }
    } catch (error) {
      console.error('Error fetching organizations:', error)
      toast.error('Failed to load organizations')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user) {
      fetchOrganizations()
    }
  }, [user])

  // Save current org to localStorage when it changes
  useEffect(() => {
    if (currentOrg) {
      localStorage.setItem('current_workspace_id', currentOrg.id)
      // Dispatch event so other components can react
      window.dispatchEvent(new CustomEvent('organization-changed', { detail: currentOrg }))
    }
  }, [currentOrg])

  const handleSwitchOrganization = async (org: Organization) => {
    setSwitching(true)

    try {
      // Determine workspace type
      const isWorkspace = (org as any).is_workspace || (org.team_count === 0 && org.member_count === 1)
      const workspaceType: 'personal' | 'team' | 'organization' = isWorkspace
        ? 'personal'
        : (org.team_count > 0 ? 'organization' : 'team')

      logger.debug('[OrganizationSwitcher] Switching workspace (unified view - no filtering):', {
        orgId: org.id,
        workspaceType,
        isWorkspace
      })

      // Set workspace context for CREATION only (not filtering)
      setWorkspaceContext(workspaceType, isWorkspace ? null : org.id)

      // Update current org
      setCurrentOrg(org)

      // Refresh integrations (integrations ARE workspace-specific)
      await fetchIntegrations(true)

      // NOTE: We do NOT call fetchWorkflows() because workflows are shown in unified view
      // The workspace switcher only affects:
      // 1. Which workspace new workflows are created in (via workspaceContext)
      // 2. Task quota widget (updated automatically via workspace-context-changed event)
      // 3. Available integrations (fetched above)

      // Dispatch workspace-context-changed event for sidebar task widget
      window.dispatchEvent(new CustomEvent('workspace-context-changed', {
        detail: {
          type: workspaceType,
          id: isWorkspace ? null : org.id,
          name: org.name,
          isPersonal: isWorkspace
        }
      }))

      toast.success(`Switched to ${org.name}`)
      logger.info('[OrganizationSwitcher] Workspace switched successfully (unified view)')
    } catch (error: any) {
      logger.error('[OrganizationSwitcher] Failed to switch workspace:', error)
      toast.error('Failed to switch workspace')
    } finally {
      setSwitching(false)
    }
  }

  if (loading) {
    return (
      <Button variant="ghost" size="sm" disabled className="gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span className="hidden sm:inline">Loading...</span>
      </Button>
    )
  }

  if (!currentOrg) {
    return (
      <Button variant="ghost" size="sm" disabled className="gap-2">
        <Home className="w-4 h-4" />
        <span className="hidden sm:inline">No Workspace</span>
      </Button>
    )
  }

  // Check if current selection is a personal workspace (has is_workspace flag or team_count === 0 && member_count === 1)
  const isPersonalWorkspace = (currentOrg as any).is_workspace || (currentOrg.team_count === 0 && currentOrg.member_count === 1)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 max-w-[200px]"
            disabled={switching}
          >
            {switching ? (
              <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" />
            ) : (
              <Home className="w-4 h-4 flex-shrink-0" />
            )}
            <span className="hidden sm:inline truncate">{currentOrg.name}</span>
            <ChevronsUpDown className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[280px]">
          {/* Clean workspace list - names only, simple and uncluttered */}
          {organizations.length > 0 && (
            <>
              {organizations.map((org) => {
                return (
                  <DropdownMenuItem
                    key={org.id}
                    onClick={() => handleSwitchOrganization(org)}
                    className="flex items-center justify-between cursor-pointer"
                    disabled={switching}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Home className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                      <p className="font-medium truncate">{org.name}</p>
                    </div>
                    {currentOrg.id === org.id && (
                      <Check className="w-4 h-4 flex-shrink-0 text-primary" />
                    )}
                  </DropdownMenuItem>
                )
              })}
            </>
          )}

          <DropdownMenuSeparator />

          {isPersonalWorkspace ? (
            <DropdownMenuItem
              onClick={() => router.push('/settings?section=workspace')}
              className="cursor-pointer"
            >
              <Settings className="w-4 h-4 mr-2" />
              <span>Workspace Settings</span>
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={() => router.push('/organization-settings')}
              className="cursor-pointer"
            >
              <Settings className="w-4 h-4 mr-2" />
              <span>Organization Settings</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
