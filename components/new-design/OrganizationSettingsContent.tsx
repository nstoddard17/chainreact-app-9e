"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuthStore } from "@/stores/authStore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Building2,
  Users,
  Mail,
  Trash2,
  Save,
  Loader2,
  User as UserIcon,
  Crown,
  Shield,
  UserPlus
} from "lucide-react"
import { toast } from "sonner"
import { TeamContent } from "./TeamContent"

interface Organization {
  id: string
  name: string
  slug: string
  description?: string
  logo_url?: string
  billing_email?: string
  owner_id: string
  user_role: string
  member_count: number
  team_count: number
  created_at: string
  is_personal?: boolean
}

interface OrganizationMember {
  id: string
  user_id: string
  role: string
  joined_at: string
  user?: {
    user_id: string
    username?: string
    email: string
  }
}

export function OrganizationSettingsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuthStore()
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [members, setMembers] = useState<OrganizationMember[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [activeTab, setActiveTab] = useState("general")

  // Form state
  const [orgName, setOrgName] = useState("")
  const [orgDescription, setOrgDescription] = useState("")
  const [billingEmail, setBillingEmail] = useState("")

  // Handle tab parameter from URL
  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab) {
      setActiveTab(tab)
    }
  }, [searchParams])

  // Fetch current organization
  useEffect(() => {
    if (user) {
      const orgId = localStorage.getItem('current_organization_id')
      if (orgId) {
        fetchOrganization(orgId)
        fetchMembers(orgId)
      }
    }
  }, [user])

  // Listen for organization changes
  useEffect(() => {
    const handleOrgChange = (event: CustomEvent) => {
      const org = event.detail
      fetchOrganization(org.id)
      fetchMembers(org.id)
    }

    window.addEventListener('organization-changed', handleOrgChange as EventListener)
    return () => {
      window.removeEventListener('organization-changed', handleOrgChange as EventListener)
    }
  }, [])

  const fetchOrganization = async (orgId: string) => {
    try {
      setLoading(true)
      const response = await fetch(`/api/organizations/${orgId}`)
      if (!response.ok) throw new Error('Failed to fetch organization')

      const data = await response.json()
      const org = Array.isArray(data) ? data[0] : data
      setOrganization(org)

      // Populate form
      setOrgName(org.name || "")
      setOrgDescription(org.description || "")
      setBillingEmail(org.billing_email || "")
    } catch (error) {
      console.error('Error fetching organization:', error)
      toast.error('Failed to load organization')
    } finally {
      setLoading(false)
    }
  }

  const fetchMembers = async (orgId: string) => {
    try {
      const response = await fetch(`/api/organizations/${orgId}/members`)
      if (!response.ok) throw new Error('Failed to fetch members')

      const data = await response.json()
      setMembers(data.members || [])
    } catch (error) {
      console.error('Error fetching members:', error)
      toast.error('Failed to load members')
    }
  }

  const handleSaveSettings = async () => {
    if (!organization) return

    if (!orgName.trim()) {
      toast.error('Organization name is required')
      return
    }

    try {
      setSaving(true)
      const response = await fetch(`/api/organizations/${organization.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: orgName.trim(),
          description: orgDescription.trim() || null,
          billing_email: billingEmail.trim() || null,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update organization')
      }

      toast.success('Organization updated successfully')

      // Refresh organization data
      fetchOrganization(organization.id)

      // Dispatch event so other components can update
      window.dispatchEvent(new CustomEvent('organization-updated'))
    } catch (error: any) {
      console.error('Error updating organization:', error)
      toast.error(error.message || 'Failed to update organization')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteOrganization = async () => {
    if (!organization) return

    try {
      const response = await fetch(`/api/organizations/${organization.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete organization')
      }

      toast.success('Organization deleted successfully')

      // Clear from localStorage
      localStorage.removeItem('current_organization_id')

      // Redirect to home or refresh
      router.push('/workflows')
      router.refresh()
    } catch (error: any) {
      console.error('Error deleting organization:', error)
      toast.error(error.message || 'Failed to delete organization')
    }
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner':
        return <Crown className="w-4 h-4 text-yellow-500" />
      case 'admin':
        return <Shield className="w-4 h-4 text-blue-500" />
      default:
        return <UserIcon className="w-4 h-4 text-muted-foreground" />
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

  const isOwner = organization?.owner_id === user?.id
  const isAdmin = organization?.user_role === 'admin' || isOwner

  if (loading && !organization) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!organization) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No organization selected</p>
      </div>
    )
  }

  return (
    <div className="h-full w-full space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold">Organization Settings</h2>
        <p className="text-muted-foreground mt-1">
          Manage your organization settings, members, and billing
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="teams">Teams</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          {isOwner && !organization.is_personal && <TabsTrigger value="danger">Danger Zone</TabsTrigger>}
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general" className="space-y-6">
          {organization.is_personal && (
            <Card className="border-blue-500 bg-blue-50 dark:bg-blue-950/20">
              <CardHeader>
                <CardTitle className="text-blue-700 dark:text-blue-400">Personal Workspace</CardTitle>
                <CardDescription className="text-blue-600 dark:text-blue-300">
                  This is your personal workspace. It cannot be deleted or transferred, and is private to you.
                  Create an organization to collaborate with others.
                </CardDescription>
              </CardHeader>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Organization Details</CardTitle>
              <CardDescription>
                Update your organization's basic information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="org-name">Organization Name *</Label>
                <Input
                  id="org-name"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  disabled={!isAdmin}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="org-slug">URL Slug</Label>
                <Input
                  id="org-slug"
                  value={organization.slug}
                  disabled
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  The URL slug cannot be changed
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="org-description">Description</Label>
                <Textarea
                  id="org-description"
                  value={orgDescription}
                  onChange={(e) => setOrgDescription(e.target.value)}
                  rows={3}
                  disabled={!isAdmin}
                  placeholder="What does your organization do?"
                />
              </div>

              {isAdmin && (
                <Button onClick={handleSaveSettings} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {!saving && <Save className="w-4 h-4 mr-2" />}
                  Save Changes
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Organization Stats</CardTitle>
              <CardDescription>
                Overview of your organization
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Users className="w-4 h-4" />
                    <span className="text-sm">Members</span>
                  </div>
                  <p className="text-2xl font-bold">{organization.member_count}</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Building2 className="w-4 h-4" />
                    <span className="text-sm">Teams</span>
                  </div>
                  <p className="text-2xl font-bold">{organization.team_count}</p>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-2 text-muted-foreground mb-1">
                    <Crown className="w-4 h-4" />
                    <span className="text-sm">Your Role</span>
                  </div>
                  <div className="mt-1">{getRoleBadge(organization.user_role)}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Teams Tab */}
        <TabsContent value="teams" className="space-y-6">
          <TeamContent />
        </TabsContent>

        {/* Members Tab */}
        <TabsContent value="members" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Organization Members</CardTitle>
                  <CardDescription>
                    {organization.is_personal
                      ? "Personal workspaces are private to you only"
                      : "Manage who has access to your organization"
                    }
                  </CardDescription>
                </div>
                {isAdmin && !organization.is_personal && (
                  <Button>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Invite Member
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                        <UserIcon className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium">
                          {member.user?.username || member.user?.email?.split('@')[0] || 'User'}
                        </p>
                        <p className="text-sm text-muted-foreground">{member.user?.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {getRoleIcon(member.role)}
                      {getRoleBadge(member.role)}
                    </div>
                  </div>
                ))}

                {members.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No members found
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Billing Tab */}
        <TabsContent value="billing" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Billing Information</CardTitle>
              <CardDescription>
                Manage billing and subscription settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="billing-email">Billing Email</Label>
                <Input
                  id="billing-email"
                  type="email"
                  value={billingEmail}
                  onChange={(e) => setBillingEmail(e.target.value)}
                  disabled={!isAdmin}
                  placeholder="billing@example.com"
                />
              </div>

              {isAdmin && (
                <Button onClick={handleSaveSettings} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {!saving && <Save className="w-4 h-4 mr-2" />}
                  Save Changes
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Current Plan</CardTitle>
              <CardDescription>
                You are currently on the Free plan
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="p-4 border rounded-lg">
                <p className="text-sm text-muted-foreground">
                  Upgrade to unlock more features and capabilities
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Danger Zone */}
        {isOwner && !organization.is_personal && (
          <TabsContent value="danger" className="space-y-6">
            <Card className="border-destructive">
              <CardHeader>
                <CardTitle className="text-destructive">Danger Zone</CardTitle>
                <CardDescription>
                  Irreversible and destructive actions
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between p-4 border border-destructive rounded-lg">
                  <div>
                    <h4 className="font-semibold">Delete Organization</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Permanently delete this organization and all its data. This action cannot be undone.
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    onClick={() => setDeleteDialogOpen(true)}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{organization.name}</strong> and remove all
              associated data including teams, workflows, and member access. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteOrganization}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Organization
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
