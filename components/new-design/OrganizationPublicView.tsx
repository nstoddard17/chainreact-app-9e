"use client"

import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Building2,
  Users,
  Loader2,
  User as UserIcon,
  Settings,
  Plus,
  MoreHorizontal,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import CreateOrganizationDialog from "@/components/teams/CreateOrganizationDialog"

interface Organization {
  id: string
  name: string
  slug: string
  description?: string
  logo_url?: string
  owner_id: string
  user_role: string
  member_count: number
  team_count: number
  created_at: string
  is_workspace?: boolean
}

export function OrganizationPublicView() {
  const router = useRouter()
  const { user, profile } = useAuthStore()
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [loading, setLoading] = useState(true)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  // Prevent double-fetch on mount (React 18 Strict Mode calls effects twice)
  const hasFetchedRef = useRef(false)

  useEffect(() => {
    if (user && !hasFetchedRef.current) {
      hasFetchedRef.current = true
      fetchUserOrganizations()
    }
  }, [user])

  // Listen for create organization event
  useEffect(() => {
    const handleCreateOrganization = () => {
      // Check if user has required plan before opening dialog
      if (!profile?.role || !['business', 'organization'].includes(profile.role)) {
        toast.error('You need to upgrade to a Business or Organization plan to create organizations')
        router.push('/settings/billing')
        return
      }
      setCreateDialogOpen(true)
    }

    window.addEventListener('create-organization', handleCreateOrganization)
    return () => window.removeEventListener('create-organization', handleCreateOrganization)
  }, [profile, router])

  const fetchUserOrganizations = async () => {
    setLoading(true)

    try {
      // Fetch organizations where user is a team member
      // Use type=organizations_only to skip workspace and standalone teams for better performance
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 8000) // 8 second timeout

      try {
        const response = await fetch('/api/organizations?type=organizations_only', { signal: controller.signal })
        if (!response.ok) throw new Error('Failed to fetch organizations')

        const { organizations } = await response.json()

        // Filter to only real organizations (not personal workspaces)
        const realOrgs = organizations.filter((org: Organization) =>
          !org.is_workspace && org.team_count > 0
        )

        setOrganizations(realOrgs)
      } catch (error: any) {
        if (error.name === 'AbortError') {
          throw new Error('Request timed out. Please try again.')
        }
        throw error
      } finally {
        clearTimeout(timeoutId)
      }
    } catch (error: any) {
      console.error('Error fetching organizations:', error)
      toast.error(error.message || 'Failed to load organizations')
      setOrganizations([])
    } finally {
      setLoading(false)
    }
  }

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'owner':
        return <Badge className="bg-yellow-500">Owner</Badge>
      case 'admin':
        return <Badge variant="secondary">Admin</Badge>
      case 'member':
        return <Badge variant="outline">Member</Badge>
      default:
        return <Badge variant="outline">Viewer</Badge>
    }
  }

  const handleViewMembers = (org: Organization) => {
    router.push(`/organization-settings?org=${org.id}&tab=members`)
  }

  const handleViewTeams = (org: Organization) => {
    router.push(`/organization-settings?org=${org.id}&tab=teams`)
  }

  if (loading) {
    return (
      <>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
        <CreateOrganizationDialog
          open={createDialogOpen}
          onOpenChange={(open) => {
            setCreateDialogOpen(open)
            if (!open) fetchUserOrganizations()
          }}
        />
      </>
    )
  }

  // Show empty state when no organizations exist
  if (organizations.length === 0) {
    return (
      <>
        <div className="h-full w-full flex items-center justify-center">
          <Card className="max-w-2xl w-full">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <Building2 className="w-6 h-6 text-muted-foreground" />
              </div>
              <CardTitle>Organization Workspace</CardTitle>
              <CardDescription>
                You have no organizations. Create an organization to collaborate with teams.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex gap-3 justify-center">
                <Button
                  onClick={() => window.dispatchEvent(new CustomEvent('create-organization'))}
                >
                  <Building2 className="w-4 h-4 mr-2" />
                  Create Organization
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
        <CreateOrganizationDialog
          open={createDialogOpen}
          onOpenChange={(open) => {
            setCreateDialogOpen(open)
            if (!open) fetchUserOrganizations()
          }}
        />
      </>
    )
  }

  // Show organizations list
  return (
    <>
      <div className="h-full w-full">
        {/* Header */}
        <div className="px-6 py-4 border-b bg-white">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">My Organizations</h1>
              <p className="text-muted-foreground text-sm mt-1">
                {organizations.length} {organizations.length === 1 ? 'organization' : 'organizations'}
              </p>
            </div>
            <Button onClick={() => window.dispatchEvent(new CustomEvent('create-organization'))}>
              <Plus className="w-4 h-4 mr-2" />
              Create Organization
            </Button>
          </div>
        </div>

        {/* Organizations List */}
        <div className="p-6">
          <div className="bg-white rounded-lg border">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left p-4 font-semibold text-sm text-slate-600">Organization</th>
                  <th className="text-left p-4 font-semibold text-sm text-slate-600">Description</th>
                  <th className="text-left p-4 font-semibold text-sm text-slate-600">Teams</th>
                  <th className="text-left p-4 font-semibold text-sm text-slate-600">Members</th>
                  <th className="text-left p-4 font-semibold text-sm text-slate-600">Role</th>
                  <th className="text-right p-4 font-semibold text-sm text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {organizations.map((org) => {
                  // Roles that can access settings: owner, admin
                  const canAccessSettings = org.user_role && ['owner', 'admin'].includes(org.user_role)

                  return (
                    <tr
                      key={org.id}
                      className="border-b last:border-b-0 hover:bg-slate-50 cursor-pointer transition-colors"
                      onClick={() => router.push(`/organization-settings?org=${org.id}`)}
                    >
                      {/* Organization Name & Icon */}
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                            {org.logo_url ? (
                              <img src={org.logo_url} alt={org.name} className="w-full h-full object-cover rounded-lg" />
                            ) : (
                              <Building2 className="w-5 h-5 text-blue-600" />
                            )}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900">{org.name}</div>
                            <div className="text-xs text-slate-500">{org.slug}</div>
                          </div>
                        </div>
                      </td>

                      {/* Description */}
                      <td className="p-4">
                        <div className="text-sm text-slate-600 line-clamp-2 max-w-md">
                          {org.description || 'No description'}
                        </div>
                      </td>

                      {/* Teams */}
                      <td className="p-4">
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <Users className="w-4 h-4" />
                          <span>{org.team_count} {org.team_count === 1 ? 'team' : 'teams'}</span>
                        </div>
                      </td>

                      {/* Members */}
                      <td className="p-4">
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <UserIcon className="w-4 h-4" />
                          <span>{org.member_count} {org.member_count === 1 ? 'member' : 'members'}</span>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="p-4">
                        {getRoleBadge(org.user_role)}
                      </td>

                      {/* Actions */}
                      <td className="p-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem
                                onSelect={(e) => {
                                  e.preventDefault()
                                  handleViewMembers(org)
                                }}
                              >
                                <UserIcon className="w-4 h-4 mr-2" />
                                View Members
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={(e) => {
                                  e.preventDefault()
                                  handleViewTeams(org)
                                }}
                              >
                                <Users className="w-4 h-4 mr-2" />
                                View Teams
                              </DropdownMenuItem>
                              {canAccessSettings && (
                                <DropdownMenuItem
                                  onSelect={(e) => {
                                    e.preventDefault()
                                    router.push(`/organization-settings?org=${org.id}`)
                                  }}
                                >
                                  <Settings className="w-4 h-4 mr-2" />
                                  Settings
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Create Organization Dialog */}
      <CreateOrganizationDialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          setCreateDialogOpen(open)
          // Refresh organizations list after creating
          if (!open) {
            fetchUserOrganizations()
          }
        }}
      />
    </>
  )
}
