"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuthStore } from "@/stores/authStore"
import { useDebugStore } from "@/stores/debugStore"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
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
  Building2,
  Trash2,
  Save,
  Loader2,
  Crown,
  CreditCard,
  Settings,
  Users,
  ChevronRight
} from "lucide-react"
import { toast } from "sonner"
import { TeamContent } from "./TeamContent"
import { OrganizationMembersManager } from "@/components/organizations/OrganizationMembersManager"

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
  is_workspace?: boolean
  billing?: {
    plan?: string
    credits?: number
    billing_source?: 'owner' | 'organization'
  }
}

type SettingsSection = 'general' | 'teams' | 'members' | 'billing'

export function OrganizationSettingsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuthStore()
  const { logEvent } = useDebugStore()
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [openingPortal, setOpeningPortal] = useState(false)
  const sectionParam = searchParams.get('section') as SettingsSection | null
  const [activeSection, setActiveSection] = useState<SettingsSection>(sectionParam || 'general')

  // Form state
  const [orgName, setOrgName] = useState("")
  const [orgDescription, setOrgDescription] = useState("")
  const [billingEmail, setBillingEmail] = useState("")

  // Update active section when URL parameter changes
  useEffect(() => {
    if (sectionParam && ['general', 'teams', 'members', 'billing'].includes(sectionParam)) {
      setActiveSection(sectionParam)
    }
  }, [sectionParam])

  // Fetch current organization
  useEffect(() => {
    if (user) {
      const orgIdFromUrl = searchParams.get('org')
      const orgId = orgIdFromUrl || localStorage.getItem('current_workspace_id')

      if (orgId) {
        fetchOrganization(orgId)
      }
    }
  }, [user, searchParams])

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

  const fetchOrganization = async (orgId: string) => {
    try {
      setLoading(true)
      logEvent('info', 'OrgSettings', 'Fetching organization...', { orgId })

      const response = await fetch(`/api/organizations/${orgId}`)
      if (!response.ok) throw new Error('Failed to fetch organization')

      const data = await response.json()
      const org = Array.isArray(data) ? data[0] : data

      // Debug logging to Admin Debug Panel
      logEvent('info', 'OrgSettings', 'Organization data received', {
        name: org.name,
        hasBilling: !!org.billing,
        billingPlan: org.billing?.plan,
        billingCredits: org.billing?.credits,
        billingSource: org.billing?.billing_source
      })

      setOrganization(org)

      // Populate form
      setOrgName(org.name || "")
      setOrgDescription(org.description || "")
      setBillingEmail(org.billing_email || "")
    } catch (error) {
      logEvent('error', 'OrgSettings', 'Failed to fetch organization', { error })
      toast.error('Failed to load organization')
    } finally {
      setLoading(false)
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
      localStorage.removeItem('current_workspace_id')

      // Redirect to home or refresh
      router.push('/workflows')
      router.refresh()
    } catch (error: any) {
      console.error('Error deleting organization:', error)
      toast.error(error.message || 'Failed to delete organization')
    }
  }

  const handleOpenBillingPortal = async () => {
    try {
      setOpeningPortal(true)
      const response = await fetch('/api/billing/portal', {
        method: 'POST',
      })

      if (!response.ok) {
        const error = await response.json()

        // If no subscription exists, redirect to billing page to upgrade
        if (error.error === 'No subscription found') {
          toast.error('Please upgrade to a paid plan first')
          router.push('/settings?section=billing')
          return
        }

        throw new Error(error.error || 'Failed to open billing portal')
      }

      const { url } = await response.json()
      if (url) {
        window.location.href = url
      }
    } catch (error: any) {
      console.error('Error opening billing portal:', error)
      toast.error(error.message || 'Failed to open billing portal')
    } finally {
      setOpeningPortal(false)
    }
  }

  const isOwner = organization?.owner_id === user?.id
  const isAdmin = organization?.user_role === 'admin' || isOwner

  // Check if current selection is a personal workspace
  const isPersonalWorkspace = organization?.is_workspace || (organization?.team_count === 0 && organization?.member_count === 1)

  // Navigation items
  const navigationItems = [
    { id: 'general' as const, label: 'General', icon: Settings, description: 'Organization details and settings' },
    { id: 'teams' as const, label: 'Teams', icon: Users, description: 'Manage organization teams' },
    { id: 'members' as const, label: 'Members', icon: Crown, description: 'Manage team members' },
    { id: 'billing' as const, label: 'Billing', icon: CreditCard, description: 'Manage subscription' },
  ]

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

  // Show special UI for personal workspaces
  if (isPersonalWorkspace) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <Card className="max-w-2xl w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Building2 className="w-6 h-6 text-muted-foreground" />
            </div>
            <CardTitle>No Organization</CardTitle>
            <CardDescription>
              You're currently in your personal workspace. Create an organization to collaborate with teams.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              size="lg"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('create-organization'))
              }}
            >
              <Building2 className="w-4 h-4 mr-2" />
              Create Organization
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex gap-8 max-w-7xl mx-auto">
      {/* Sidebar Navigation */}
      <aside className="w-64 shrink-0">
        <div className="sticky top-6 space-y-1">
          {navigationItems.map((item) => {
            const Icon = item.icon
            const isActive = activeSection === item.id

            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveSection(item.id)
                  const orgParam = organization?.id ? `&org=${organization.id}` : ''
                  router.push(`/organization-settings?section=${item.id}${orgParam}`)
                }}
                className={cn(
                  "w-full text-left px-4 py-3 rounded-xl transition-all duration-200 group",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "hover:bg-accent text-muted-foreground hover:text-foreground"
                )}
              >
                <div className="flex items-center gap-3">
                  <Icon className={cn(
                    "w-5 h-5 transition-transform group-hover:scale-110",
                    isActive ? "text-primary-foreground" : ""
                  )} />
                  <div className="flex-1">
                    <div className={cn(
                      "font-semibold text-sm",
                      isActive ? "text-primary-foreground" : ""
                    )}>
                      {item.label}
                    </div>
                    {!isActive && (
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {item.description}
                      </div>
                    )}
                  </div>
                  {isActive && (
                    <ChevronRight className="w-4 h-4 text-primary-foreground" />
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0">
        {/* General Settings */}
        {activeSection === 'general' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">General Settings</h2>
              <p className="text-muted-foreground mt-2">Update your organization's basic information</p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Organization Details</CardTitle>
                <CardDescription>Update your organization's basic information</CardDescription>
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

            {/* Danger Zone */}
            {isOwner && (
              <Card className="border-destructive">
                <CardHeader>
                  <CardTitle className="text-destructive">Danger Zone</CardTitle>
                  <CardDescription>
                    Irreversible and destructive actions
                  </CardDescription>
                </CardHeader>
                <CardContent>
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
            )}
          </div>
        )}

        {/* Teams Section */}
        {activeSection === 'teams' && (
          <TeamContent organizationId={organization.id} />
        )}

        {/* Members Section */}
        {activeSection === 'members' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Members</h2>
              <p className="text-muted-foreground mt-2">Manage organization members and their permissions</p>
            </div>
            <OrganizationMembersManager
              organizationId={organization.id}
              currentUserRole={organization.user_role as any}
            />
          </div>
        )}

        {/* Billing Section */}
        {activeSection === 'billing' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Billing & Subscription</h2>
              <p className="text-muted-foreground mt-2">Manage your organization's subscription through Stripe</p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Current Plan</CardTitle>
                <CardDescription>
                  {organization?.billing?.billing_source === 'owner'
                    ? 'Organization inherits billing from the owner\'s personal account'
                    : 'Your organization\'s subscription is managed through Stripe'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-6 border rounded-lg bg-muted/50">
                  <div>
                    <h3 className="font-semibold text-lg">
                      {organization?.billing?.plan
                        ? `${organization.billing.plan.charAt(0).toUpperCase() + organization.billing.plan.slice(1)} Plan`
                        : 'Free Plan'}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {organization?.billing?.billing_source === 'owner'
                        ? 'Managed by organization owner'
                        : organization?.billing?.plan === 'pro'
                        ? 'Advanced features for growing teams'
                        : organization?.billing?.plan === 'enterprise'
                        ? 'Full platform access with premium support'
                        : organization?.billing?.plan === 'beta'
                        ? 'Beta access with early features'
                        : 'Basic features for small teams'}
                    </p>
                    {organization?.billing?.credits !== undefined && organization?.billing?.credits !== null && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {organization.billing.credits.toLocaleString()} credits remaining
                      </p>
                    )}
                  </div>
                  <Button
                    onClick={() => router.push('/settings?section=billing')}
                    className="gap-2"
                  >
                    <CreditCard className="w-4 h-4" />
                    {organization?.billing?.plan === 'free' || !organization?.billing?.plan ? 'Upgrade Plan' : 'Manage Plan'}
                  </Button>
                </div>

                <div className="pt-4 border-t">
                  <h4 className="font-semibold mb-3">Plan Includes</h4>
                  <div className="grid gap-2">
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-2 h-2 rounded-full bg-green-500"></div>
                      <span>Unlimited workflows</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-2 h-2 rounded-full bg-green-500"></div>
                      <span>{organization?.billing?.plan === 'enterprise' ? 'Unlimited' : organization?.billing?.plan === 'pro' ? 'Up to 25' : 'Up to 5'} team members</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-2 h-2 rounded-full bg-green-500"></div>
                      <span>{organization?.billing?.plan === 'enterprise' ? 'Priority support' : organization?.billing?.plan === 'pro' ? 'Email support' : 'Community support'}</span>
                    </div>
                  </div>
                </div>

                {organization?.billing?.billing_source === 'owner' && (
                  <div className="p-4 border rounded-lg bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
                    <p className="text-sm text-blue-900 dark:text-blue-200">
                      <strong>Note:</strong> This organization uses the owner's personal plan and quota.
                      To upgrade, the organization owner should manage their plan in personal settings.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Billing Management</CardTitle>
                <CardDescription>
                  All billing information is securely managed through Stripe
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  To view invoices, update payment methods, or manage your subscription, use the Stripe Customer Portal.
                </p>
                <Button
                  variant="outline"
                  className="w-full sm:w-auto gap-2"
                  onClick={handleOpenBillingPortal}
                  disabled={openingPortal}
                >
                  {openingPortal ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Opening Portal...
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4" />
                      Open Billing Portal
                    </>
                  )}
                </Button>

                <div className="pt-4 border-t space-y-2">
                  <h4 className="font-semibold text-sm">What you can do in the portal:</h4>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Update payment methods</li>
                    <li>View billing history and invoices</li>
                    <li>Update billing address</li>
                    <li>Cancel or modify your subscription</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Billing Contact</CardTitle>
                <CardDescription>
                  Email address for billing-related communications
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
          </div>
        )}
      </main>

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
