"use client"

import { useEffect, useState } from "react"
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
  Crown,
  Shield,
  Settings
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"

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
  const { user } = useAuthStore()
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) {
      fetchUserOrganizations()
    }
  }, [user])

  const fetchUserOrganizations = async () => {
    try {
      setLoading(true)

      // Fetch organizations where user is a team member
      const response = await fetch('/api/organizations')
      if (!response.ok) throw new Error('Failed to fetch organizations')

      const { organizations } = await response.json()

      // Filter to only real organizations (not personal workspaces)
      const realOrgs = organizations.filter((org: Organization) =>
        !org.is_workspace && org.team_count > 0
      )

      setOrganizations(realOrgs)

      // Set the first organization as selected, or null if none exist
      setSelectedOrg(realOrgs.length > 0 ? realOrgs[0] : null)
    } catch (error) {
      console.error('Error fetching organizations:', error)
      toast.error('Failed to load organizations')
      setOrganizations([])
      setSelectedOrg(null)
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

  const isOwnerOrAdmin = selectedOrg?.user_role === 'owner' || selectedOrg?.user_role === 'admin'

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Show empty state when no organizations exist
  if (organizations.length === 0) {
    return (
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
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('create-organization'))
                }}
              >
                <Building2 className="w-4 h-4 mr-2" />
                Create Organization
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Show organization details if at least one exists
  if (!selectedOrg) return null

  return (
    <div className="h-full w-full space-y-6 max-w-5xl mx-auto">
      {/* Organization Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-6">
            <div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center">
              {selectedOrg.logo_url ? (
                <img src={selectedOrg.logo_url} alt={selectedOrg.name} className="w-full h-full object-cover rounded-lg" />
              ) : (
                <Building2 className="w-10 h-10 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <h1 className="text-3xl font-bold">{selectedOrg.name}</h1>
                <p className="text-muted-foreground mt-1">{selectedOrg.description || 'No description'}</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Your Role:</span>
                  {getRoleBadge(selectedOrg.user_role)}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="w-4 h-4" />
                  <span>{selectedOrg.member_count} {selectedOrg.member_count === 1 ? 'member' : 'members'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Building2 className="w-4 h-4" />
                  <span>{selectedOrg.team_count} {selectedOrg.team_count === 1 ? 'team' : 'teams'}</span>
                </div>
              </div>
              {isOwnerOrAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push('/organization-settings')}
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Organization Settings
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Organization Stats */}
      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Users className="w-4 h-4" />
              Members
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{selectedOrg.member_count}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Total organization members
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Teams
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{selectedOrg.team_count}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Active teams
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Crown className="w-4 h-4" />
              Your Role
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mt-2">
              {getRoleBadge(selectedOrg.user_role)}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Your access level
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Organization Details */}
      <Card>
        <CardHeader>
          <CardTitle>Organization Details</CardTitle>
          <CardDescription>Information about this organization</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Organization Name</p>
              <p className="text-sm">{selectedOrg.name}</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">URL Slug</p>
              <p className="text-sm font-mono text-xs">{selectedOrg.slug}</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Created</p>
              <p className="text-sm">{new Date(selectedOrg.created_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Your Role</p>
              <div>{getRoleBadge(selectedOrg.user_role)}</div>
            </div>
          </div>
          {selectedOrg.description && (
            <div className="space-y-2 pt-2 border-t">
              <p className="text-sm font-medium text-muted-foreground">Description</p>
              <p className="text-sm">{selectedOrg.description}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
