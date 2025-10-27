"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronsUpDown, Plus, Building2, Loader2, Settings, User, Crown, Star, Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { useAuthStore } from "@/stores/authStore"
import { type UserRole } from "@/lib/utils/roles"

interface Organization {
  id: string
  name: string
  slug: string
  description?: string
  user_role: string
  member_count: number
  team_count: number
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
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)

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

  // Form state
  const [orgName, setOrgName] = useState("")
  const [orgDescription, setOrgDescription] = useState("")

  // Fetch organizations
  const fetchOrganizations = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/organizations')
      if (!response.ok) throw new Error('Failed to fetch organizations')

      const data = await response.json()
      const organizations = Array.isArray(data.organizations) ? data.organizations : (Array.isArray(data) ? data : [])
      setOrganizations(organizations)

      // Set current org from localStorage or default to first
      const storedOrgId = localStorage.getItem('current_workspace_id')
      if (storedOrgId && organizations.length > 0) {
        const org = organizations.find((o: Organization) => o.id === storedOrgId)
        setCurrentOrg(org || organizations[0] || null)
      } else if (organizations.length > 0) {
        setCurrentOrg(organizations[0])
      } else {
        setCurrentOrg(null)
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

  // Listen for create organization event
  useEffect(() => {
    const handleCreateOrg = () => {
      setCreateDialogOpen(true)
    }

    window.addEventListener('create-organization', handleCreateOrg)
    return () => {
      window.removeEventListener('create-organization', handleCreateOrg)
    }
  }, [])

  // Save current org to localStorage when it changes
  useEffect(() => {
    if (currentOrg) {
      localStorage.setItem('current_workspace_id', currentOrg.id)
      // Dispatch event so other components can react
      window.dispatchEvent(new CustomEvent('organization-changed', { detail: currentOrg }))
    }
  }, [currentOrg])

  const handleCreateOrganization = async () => {
    if (!orgName.trim()) {
      toast.error('Organization name is required')
      return
    }

    try {
      setCreating(true)
      const response = await fetch('/api/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: orgName.trim(),
          description: orgDescription.trim() || null,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create organization')
      }

      const { organization } = await response.json()
      toast.success('Organization created successfully')

      // Add to list and set as current
      setOrganizations(prev => [organization, ...prev])
      setCurrentOrg(organization)

      // Reset form and close dialog
      setOrgName("")
      setOrgDescription("")
      setCreateDialogOpen(false)

      // Redirect to organization page
      router.push('/organization')
      router.refresh()
    } catch (error: any) {
      console.error('Error creating organization:', error)
      toast.error(error.message || 'Failed to create organization')
    } finally {
      setCreating(false)
    }
  }

  const handleSwitchOrganization = (org: Organization) => {
    setCurrentOrg(org)
    toast.success(`Switched to ${org.name}`)
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
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setCreateDialogOpen(true)}
        className="gap-2"
      >
        <Plus className="w-4 h-4" />
        <span className="hidden sm:inline">Create Organization</span>
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
          >
            {isPersonalWorkspace ? (
              <User className="w-4 h-4 flex-shrink-0" />
            ) : (
              <Building2 className="w-4 h-4 flex-shrink-0" />
            )}
            <span className="hidden sm:inline truncate">{currentOrg.name}</span>
            <ChevronsUpDown className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[280px]">
          {/* Organizations Section */}
          {organizations.length > 0 && (
            <>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                WORKSPACES & ORGANIZATIONS
              </DropdownMenuLabel>
              {organizations.map((org) => {
                const isWorkspace = (org as any).is_workspace || (org.team_count === 0 && org.member_count === 1)
                return (
                  <DropdownMenuItem
                    key={org.id}
                    onClick={() => handleSwitchOrganization(org)}
                    className="flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {isWorkspace ? (
                        <User className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                      ) : (
                        <Building2 className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{org.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {isWorkspace ? (
                            'Personal workspace'
                          ) : (
                            <>
                              {org.member_count} {org.member_count === 1 ? 'member' : 'members'}
                              {' • '}
                              {org.team_count} {org.team_count === 1 ? 'team' : 'teams'}
                            </>
                          )}
                        </p>
                      </div>
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

          <DropdownMenuItem
            onClick={() => setCreateDialogOpen(true)}
            className="cursor-pointer"
          >
            <Plus className="w-4 h-4 mr-2" />
            <span>Create Organization</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Create Organization Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create Organization</DialogTitle>
            <DialogDescription>
              Create a new organization to manage teams and workflows together.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="org-name">Organization Name *</Label>
              <Input
                id="org-name"
                placeholder="Acme Inc."
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateOrganization()}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="org-description">Description</Label>
              <Textarea
                id="org-description"
                placeholder="What does your organization do?"
                value={orgDescription}
                onChange={(e) => setOrgDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateOrganization} disabled={creating}>
              {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Organization
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
