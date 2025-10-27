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
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (user) {
      const orgId = localStorage.getItem('current_workspace_id')
      if (orgId) {
        // Check if this is actually an organization, not a workspace
        checkIfOrganization(orgId)
      } else {
        setLoading(false)
      }
    }
  }, [user])

  // Listen for organization changes
  useEffect(() => {
    const handleOrgChange = (event: CustomEvent) => {
      const org = event.detail
      fetchOrganization(org.id)
    }

    window.addEventListener('organization-changed', handleOrgChange as EventListener)
    return () => {
      window.removeEventListener('organization-changed', handleOrgChange as EventListener)
    }
  }, [])

  const checkIfOrganization = async (orgId: string) => {
    try {
      setLoading(true)
      // Fetch all organizations to see if this ID is a real organization
      const response = await fetch('/api/organizations')
      if (!response.ok) throw new Error('Failed to fetch organizations')

      const { organizations } = await response.json()

      // Find if this ID corresponds to a real organization (not a workspace)
      const realOrg = organizations.find((org: Organization) =>
        org.id === orgId && org.team_count > 0
      )

      if (realOrg) {
        setOrganization(realOrg)
      } else {
        // It's a workspace or doesn't exist, show empty state
        setOrganization(null)
      }
    } catch (error) {
      console.error('Error checking organization:', error)
      setOrganization(null)
    } finally {
      setLoading(false)
    }
  }

  const fetchOrganization = async (orgId: string) => {
    try {
      setLoading(true)
      const response = await fetch(`/api/organizations/${orgId}`)
      if (!response.ok) throw new Error('Failed to fetch organization')

      const data = await response.json()
      setOrganization(data)
    } catch (error) {
      console.error('Error fetching organization:', error)
      toast.error('Failed to load organization')
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

  // Check if current selection is a personal workspace
  const isPersonalWorkspace = organization?.is_workspace || (organization?.team_count === 0 && organization?.member_count === 1)
  const isOwnerOrAdmin = organization?.user_role === 'owner' || organization?.user_role === 'admin'

  if (loading && !organization) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Show empty state when no organization is selected or available
  if (!organization) {
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

  // Show organization details for actual organizations
  return (
    <div className="h-full w-full space-y-6 max-w-5xl mx-auto">
      {/* Organization Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-6">
            <div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center">
              {organization.logo_url ? (
                <img src={organization.logo_url} alt={organization.name} className="w-full h-full object-cover rounded-lg" />
              ) : (
                <Building2 className="w-10 h-10 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 space-y-3">
              <div>
                <h1 className="text-3xl font-bold">{organization.name}</h1>
                <p className="text-muted-foreground mt-1">{organization.description || 'No description'}</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Your Role:</span>
                  {getRoleBadge(organization.user_role)}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="w-4 h-4" />
                  <span>{organization.member_count} {organization.member_count === 1 ? 'member' : 'members'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Building2 className="w-4 h-4" />
                  <span>{organization.team_count} {organization.team_count === 1 ? 'team' : 'teams'}</span>
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
            <p className="text-3xl font-bold">{organization.member_count}</p>
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
            <p className="text-3xl font-bold">{organization.team_count}</p>
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
              {getRoleBadge(organization.user_role)}
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
              <p className="text-sm">{organization.name}</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">URL Slug</p>
              <p className="text-sm font-mono text-xs">{organization.slug}</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Created</p>
              <p className="text-sm">{new Date(organization.created_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}</p>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Your Role</p>
              <div>{getRoleBadge(organization.user_role)}</div>
            </div>
          </div>
          {organization.description && (
            <div className="space-y-2 pt-2 border-t">
              <p className="text-sm font-medium text-muted-foreground">Description</p>
              <p className="text-sm">{organization.description}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
