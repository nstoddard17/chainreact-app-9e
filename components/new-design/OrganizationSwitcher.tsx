"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronsUpDown, Home, Loader2, Settings, Crown, Star, Shield, User, Users, Building, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
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
  const [searchQuery, setSearchQuery] = useState("")
  const [recentWorkspaces, setRecentWorkspaces] = useState<string[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const isInitialLoadRef = useRef(true)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Check if we're on a page with an org parameter in the URL
  const getOrgFromUrl = () => {
    if (typeof window === 'undefined') return null
    const params = new URLSearchParams(window.location.search)
    return params.get('org')
  }

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

  // Load recent workspaces from localStorage
  useEffect(() => {
    const stored = localStorage.getItem('recent_workspaces')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        setRecentWorkspaces(Array.isArray(parsed) ? parsed : [])
      } catch {
        setRecentWorkspaces([])
      }
    }
  }, [])

  // Track workspace usage for recents
  const addToRecentWorkspaces = (orgId: string) => {
    setRecentWorkspaces(prev => {
      // Remove if already exists, then add to front
      const filtered = prev.filter(id => id !== orgId)
      const updated = [orgId, ...filtered].slice(0, 5) // Keep max 5 recent
      localStorage.setItem('recent_workspaces', JSON.stringify(updated))
      return updated
    })
  }

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

      // Set current org/workspace from URL first (if on org-specific page), then localStorage, then default
      const urlOrgId = getOrgFromUrl()

      if (urlOrgId && allOrgs.length > 0) {
        // If URL has org parameter, use that (user is viewing a specific org)
        const org = allOrgs.find((o: Organization) => o.id === urlOrgId)
        if (org) {
          setCurrentOrg(org)
          // Update localStorage to reflect the URL org
          localStorage.setItem('current_workspace_id', org.id)
        } else {
          // URL org not found, fall back to localStorage
          const storedOrgId = localStorage.getItem('current_workspace_id')
          const storedOrg = allOrgs.find((o: Organization) => o.id === storedOrgId)
          setCurrentOrg(storedOrg || allOrgs[0] || null)
        }
      } else {
        // No URL org parameter, use localStorage or default
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

      // Only dispatch event for actual workspace switches, not initial load
      // This prevents race conditions with workflows page initial fetch
      if (!isInitialLoadRef.current) {
        logger.debug('[OrganizationSwitcher] Workspace changed, dispatching organization-changed event')
        window.dispatchEvent(new CustomEvent('organization-changed', { detail: currentOrg }))
      } else {
        logger.debug('[OrganizationSwitcher] Initial load, skipping organization-changed event dispatch')
        isInitialLoadRef.current = false
      }
    }
  }, [currentOrg])

  // Reset selected index when search changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [searchQuery])

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

      // Add to recent workspaces
      addToRecentWorkspaces(org.id)

      // Clear search query
      setSearchQuery("")

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

      // Removed toast notification - it appears in the way of the workspace switcher
      logger.info('[OrganizationSwitcher] Workspace switched successfully (unified view)')
    } catch (error: any) {
      logger.error('[OrganizationSwitcher] Failed to switch workspace:', error)
      // Keep error toast for actual failures
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

  // Check if current selection is a personal workspace, standalone team, or organization
  const isPersonalWorkspace = (currentOrg as any).is_workspace === true
  const isStandaloneTeam = (currentOrg as any).is_team === true

  // Determine icon for current workspace
  const CurrentIcon = isPersonalWorkspace ? Home : isStandaloneTeam ? Users : Building

  // Filter and group organizations
  const filteredOrgs = organizations.filter(org =>
    org.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Group organizations by type
  const personalWorkspaces = filteredOrgs.filter(org => (org as any).is_workspace === true)
  const teams = filteredOrgs.filter(org => (org as any).is_team === true)
  const orgs = filteredOrgs.filter(org => !(org as any).is_workspace && !(org as any).is_team)

  // Recent workspaces (only show if not searching and there are recents)
  const recentOrgs = searchQuery === ''
    ? recentWorkspaces
        .map(id => organizations.find(org => org.id === id))
        .filter((org): org is Organization => org !== undefined)
        .slice(0, 5)
    : []

  // Flatten all visible workspaces for keyboard navigation
  const allVisibleOrgs = [
    ...recentOrgs,
    ...personalWorkspaces,
    ...teams,
    ...orgs
  ].filter((org, index, self) =>
    // Remove duplicates (recent might also be in other categories)
    self.findIndex(o => o.id === org.id) === index
  )

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (allVisibleOrgs.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev => (prev + 1) % allVisibleOrgs.length)
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => (prev - 1 + allVisibleOrgs.length) % allVisibleOrgs.length)
        break
      case 'Enter':
        e.preventDefault()
        const selectedOrg = allVisibleOrgs[selectedIndex]
        if (selectedOrg) {
          handleSwitchOrganization(selectedOrg)
        }
        break
      case 'Escape':
        e.preventDefault()
        setSearchQuery("")
        break
    }
  }

  const renderWorkspaceItem = (org: Organization, index?: number) => {
    const isPersonalWorkspace = (org as any).is_workspace === true
    const isStandaloneTeam = (org as any).is_team === true
    const WorkspaceIcon = isPersonalWorkspace ? Home : isStandaloneTeam ? Users : Building
    const isSelected = index !== undefined && allVisibleOrgs[selectedIndex]?.id === org.id

    return (
      <DropdownMenuItem
        key={org.id}
        onClick={() => handleSwitchOrganization(org)}
        className={`flex items-center justify-between cursor-pointer ${isSelected ? 'bg-accent' : ''}`}
        disabled={switching}
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <WorkspaceIcon className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
          <p className="font-medium truncate">{org.name}</p>
        </div>
        {currentOrg.id === org.id && (
          <Check className="w-4 h-4 flex-shrink-0 text-primary" />
        )}
      </DropdownMenuItem>
    )
  }

  return (
    <>
      <DropdownMenu onOpenChange={(open) => {
        if (open) {
          // Focus search input when dropdown opens
          setTimeout(() => searchInputRef.current?.focus(), 0)
        } else {
          // Clear search when dropdown closes
          setSearchQuery("")
        }
      }}>
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
              <CurrentIcon className="w-4 h-4 flex-shrink-0" />
            )}
            <span className="hidden sm:inline truncate">{currentOrg.name}</span>
            <ChevronsUpDown className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[320px] p-0">
          {/* Search Input */}
          <div className="p-2 border-b">
            <Input
              ref={searchInputRef}
              type="text"
              placeholder="Search workspaces..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-8 text-sm"
            />
          </div>

          {/* Scrollable workspace list */}
          <div className="max-h-[400px] overflow-y-auto p-1">
            {filteredOrgs.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No workspaces found
              </div>
            ) : (
              <>
                {/* Recent Workspaces */}
                {recentOrgs.length > 0 && (
                  <>
                    <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground px-2 py-1.5">
                      RECENT
                    </DropdownMenuLabel>
                    {recentOrgs.map((org) => {
                      const globalIndex = allVisibleOrgs.findIndex(o => o.id === org.id)
                      return renderWorkspaceItem(org, globalIndex)
                    })}
                    <DropdownMenuSeparator className="my-1" />
                  </>
                )}

                {/* Personal Workspaces */}
                {personalWorkspaces.length > 0 && (
                  <>
                    <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground px-2 py-1.5">
                      PERSONAL
                    </DropdownMenuLabel>
                    {personalWorkspaces.map((org) => {
                      const globalIndex = allVisibleOrgs.findIndex(o => o.id === org.id)
                      return renderWorkspaceItem(org, globalIndex)
                    })}
                    <DropdownMenuSeparator className="my-1" />
                  </>
                )}

                {/* Teams */}
                {teams.length > 0 && (
                  <>
                    <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground px-2 py-1.5">
                      TEAMS ({teams.length})
                    </DropdownMenuLabel>
                    {teams.map((org) => {
                      const globalIndex = allVisibleOrgs.findIndex(o => o.id === org.id)
                      return renderWorkspaceItem(org, globalIndex)
                    })}
                    <DropdownMenuSeparator className="my-1" />
                  </>
                )}

                {/* Organizations */}
                {orgs.length > 0 && (
                  <>
                    <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground px-2 py-1.5">
                      ORGANIZATIONS ({orgs.length})
                    </DropdownMenuLabel>
                    {orgs.map((org) => {
                      const globalIndex = allVisibleOrgs.findIndex(o => o.id === org.id)
                      return renderWorkspaceItem(org, globalIndex)
                    })}
                  </>
                )}
              </>
            )}
          </div>

          {/* Settings Footer */}
          <div className="border-t p-1">
            {isPersonalWorkspace ? (
              <DropdownMenuItem
                onClick={() => router.push('/settings?section=workspace')}
                className="cursor-pointer"
              >
                <Settings className="w-4 h-4 mr-2" />
                <span>Workspace Settings</span>
              </DropdownMenuItem>
            ) : isStandaloneTeam ? (
              <DropdownMenuItem
                onClick={() => router.push(`/team-settings?team=${currentOrg.id}`)}
                className="cursor-pointer"
              >
                <Settings className="w-4 h-4 mr-2" />
                <span>Team Settings</span>
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
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
