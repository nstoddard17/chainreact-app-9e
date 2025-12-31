"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuthStore } from "@/stores/authStore"
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
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { AlertDialog } from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Users,
  Loader2,
  User as UserIcon,
  Shield,
  Trash2,
  Save,
  Settings,
  CreditCard,
  ChevronRight,
  ArrowLeft
} from "lucide-react"
import { toast } from "sonner"
import { CreateTeamDialog } from "./CreateTeamDialog"

interface Team {
  id: string
  name: string
  slug: string
  description?: string
  organization_id?: string
  member_count: number
  user_role?: string
  billing?: {
    plan?: string
    credits?: number
    billing_source?: 'owner' | 'organization'
  }
}

type SettingsSection = 'general' | 'billing'

export function TeamSettingsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuthStore()
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [currentTeam, setCurrentTeam] = useState<Team | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [createTeamDialogOpen, setCreateTeamDialogOpen] = useState(false)
  const sectionParam = searchParams.get('section') as SettingsSection | null
  const [activeSection, setActiveSection] = useState<SettingsSection>(sectionParam || 'general')

  // Form state
  const [teamName, setTeamName] = useState("")
  const [teamDescription, setTeamDescription] = useState("")
  const [openingPortal, setOpeningPortal] = useState(false)

  useEffect(() => {
    if (user) {
      fetchTeams()
    }
  }, [user])

  // Update active section when URL parameter changes
  useEffect(() => {
    if (sectionParam && ['general', 'billing'].includes(sectionParam)) {
      setActiveSection(sectionParam)
    }
  }, [sectionParam])

  // Handle team parameter from URL
  useEffect(() => {
    const teamId = searchParams.get('team')
    if (teamId && teams.length > 0) {
      setSelectedTeamId(teamId)
      fetchTeam(teamId)
    } else if (teams.length > 0 && !selectedTeamId) {
      // Select first team by default (any management role)
      const firstTeam = teams[0] // Already filtered to management roles in fetchTeams
      if (firstTeam) {
        setSelectedTeamId(firstTeam.id)
        fetchTeam(firstTeam.id)
      }
    }
  }, [searchParams, teams])

  const fetchTeams = async () => {
    try {
      setLoading(true)

      // Fetch all teams where user is a member with management roles
      const response = await fetch('/api/teams/my-teams')
      if (!response.ok) throw new Error('Failed to fetch teams')

      const data = await response.json()
      // Filter to only teams where user has management roles
      const managementTeams = (data.teams || []).filter(
        (t: Team) => t.user_role && ['owner', 'admin', 'manager', 'hr', 'finance'].includes(t.user_role)
      )
      setTeams(managementTeams)
    } catch (error) {
      console.error('Error fetching teams:', error)
      toast.error('Failed to load teams')
    } finally {
      setLoading(false)
    }
  }

  const fetchTeam = async (teamId: string) => {
    try {
      const response = await fetch(`/api/teams/${teamId}`)
      if (!response.ok) throw new Error('Failed to fetch team')

      const data = await response.json()
      setCurrentTeam(data)
      setTeamName(data.name || "")
      setTeamDescription(data.description || "")
    } catch (error) {
      console.error('Error fetching team:', error)
      toast.error('Failed to load team details')
    }
  }

  const handleSaveSettings = async () => {
    if (!currentTeam) return

    if (!teamName.trim()) {
      toast.error('Team name is required')
      return
    }

    try {
      setSaving(true)
      const response = await fetch(`/api/teams/${currentTeam.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: teamName.trim(),
          description: teamDescription.trim() || null,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update team')
      }

      toast.success('Team updated successfully')
      fetchTeam(currentTeam.id)
      fetchTeams()
    } catch (error: any) {
      console.error('Error updating team:', error)
      toast.error(error.message || 'Failed to update team')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteTeam = async () => {
    if (!currentTeam) return

    try {
      const response = await fetch(`/api/teams/${currentTeam.id}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete team')
      }

      toast.success('Team deleted successfully')
      setDeleteDialogOpen(false)
      router.push('/teams')
    } catch (error: any) {
      console.error('Error deleting team:', error)
      toast.error(error.message || 'Failed to delete team')
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

  const isOwner = currentTeam?.user_role === 'owner'
  // Management roles that can edit: owner, admin, manager, hr, finance
  const canManage = currentTeam?.user_role && ['owner', 'admin', 'manager', 'hr', 'finance'].includes(currentTeam.user_role)

  if (loading && teams.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (teams.length === 0) {
    return (
      <>
        <div className="h-full w-full flex items-center justify-center p-6">
          <Card className="max-w-2xl w-full border-2">
            <CardHeader className="text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-muted-foreground" />
              </div>
              <CardTitle className="text-2xl">No Teams</CardTitle>
              <CardDescription className="text-base mt-2">
                You're currently not part of any team. Join a team or create an organization to collaborate with teams.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Feature Benefits */}
              <div className="space-y-4">
                <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
                  <Users className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-sm mb-1">Collaborate with Teams</h3>
                    <p className="text-sm text-muted-foreground">
                      Work together with team members and share workflows
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
                  <Shield className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-sm mb-1">Manage Permissions</h3>
                    <p className="text-sm text-muted-foreground">
                      Control access levels and manage team member permissions
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
                  <UserIcon className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-sm mb-1">Organized Workflows</h3>
                    <p className="text-sm text-muted-foreground">
                      Keep workflows organized by team and department
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="flex justify-center pt-2">
                <Button
                  size="lg"
                  onClick={() => setCreateTeamDialogOpen(true)}
                >
                  <Users className="w-4 h-4 mr-2" />
                  Create Team
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Create Team Dialog */}
        <CreateTeamDialog
          open={createTeamDialogOpen}
          onOpenChange={setCreateTeamDialogOpen}
          onTeamCreated={fetchTeams}
        />
      </>
    )
  }

  if (!currentTeam) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Check if team is standalone (not attached to an organization)
  const isStandaloneTeam = !currentTeam?.organization_id

  // Navigation items - include billing only for standalone teams
  const navigationItems = [
    { id: 'general' as const, label: 'General', icon: Settings, description: 'Team details and settings' },
    ...(isStandaloneTeam ? [{ id: 'billing' as const, label: 'Billing', icon: CreditCard, description: 'Manage team subscription' }] : []),
  ]

  return (
    <div className="flex gap-8 max-w-7xl mx-auto">
      {/* Sidebar Navigation */}
      <aside className="w-64 shrink-0">
        <div className="sticky top-6 space-y-6">
          {/* Team Selector */}
          {teams.length > 1 && (
            <div className="space-y-2">
              <Label htmlFor="team-select" className="text-sm font-medium">
                Select Team
              </Label>
              <Select
                value={selectedTeamId || ''}
                onValueChange={(value) => {
                  setSelectedTeamId(value)
                  router.push(`/team-settings?team=${value}`)
                }}
              >
                <SelectTrigger id="team-select">
                  <SelectValue placeholder="Select a team" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Navigation Menu */}
          <div className="space-y-1">
            {navigationItems.map((item) => {
              const Icon = item.icon
              const isActive = activeSection === item.id

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveSection(item.id)
                    const teamParam = selectedTeamId ? `&team=${selectedTeamId}` : ''
                    router.push(`/team-settings?section=${item.id}${teamParam}`)
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
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0">
        {/* Back Button */}
        {currentTeam && (
          <Button
            variant="ghost"
            onClick={() => router.push(`/teams/${currentTeam.slug}`)}
            className="gap-2 mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to {currentTeam.name}
          </Button>
        )}

        {activeSection === 'general' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">General Settings</h2>
              <p className="text-muted-foreground mt-2">Update your team's basic information</p>
            </div>

            {/* Team Details */}
            <Card>
        <CardHeader>
          <CardTitle>Team Details</CardTitle>
          <CardDescription>Update your team's basic information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="team-name">Team Name *</Label>
            <Input
              id="team-name"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              disabled={!canManage}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="team-slug">URL Slug</Label>
            <Input
              id="team-slug"
              value={currentTeam.slug}
              disabled
              className="bg-muted"
            />
            <p className="text-xs text-muted-foreground">
              The URL slug cannot be changed
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="team-description">Description</Label>
            <Textarea
              id="team-description"
              value={teamDescription}
              onChange={(e) => setTeamDescription(e.target.value)}
              rows={3}
              disabled={!canManage}
              placeholder="What does your team work on?"
            />
          </div>

          {canManage && (
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
                      <h4 className="font-semibold">Delete Team</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        Permanently delete this team. This action cannot be undone.
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

        {/* Billing Section */}
        {activeSection === 'billing' && isStandaloneTeam && (
          <div className="space-y-6">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Billing & Subscription</h2>
              <p className="text-muted-foreground mt-2">Manage your team's subscription through Stripe</p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Current Plan</CardTitle>
                <CardDescription>
                  {currentTeam?.billing?.billing_source === 'owner'
                    ? 'Team inherits billing from the owner\'s personal account'
                    : 'Your team\'s subscription is managed through Stripe'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-6 border rounded-lg bg-muted/50">
                  <div>
                    <h3 className="font-semibold text-lg">
                      {currentTeam?.billing?.plan
                        ? `${currentTeam.billing.plan.charAt(0).toUpperCase() + currentTeam.billing.plan.slice(1)} Plan`
                        : 'Free Plan'}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {currentTeam?.billing?.billing_source === 'owner'
                        ? 'Managed by team owner'
                        : currentTeam?.billing?.plan === 'pro'
                        ? 'Advanced features for growing teams'
                        : currentTeam?.billing?.plan === 'enterprise'
                        ? 'Full platform access with premium support'
                        : 'Basic features for small teams'}
                    </p>
                    {currentTeam?.billing?.credits !== undefined && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {currentTeam.billing.credits.toLocaleString()} credits remaining
                      </p>
                    )}
                  </div>
                  <Button
                    onClick={() => {
                      // Route to appropriate billing page
                      if (currentTeam?.billing?.billing_source === 'owner') {
                        // For standalone teams, route to personal settings
                        router.push('/settings?section=billing')
                      } else if (currentTeam?.organization_id) {
                        // For org teams, route to org settings
                        router.push('/organization-settings?section=billing')
                      } else {
                        // Fallback to personal settings
                        router.push('/settings?section=billing')
                      }
                    }}
                    className="gap-2"
                  >
                    <CreditCard className="w-4 h-4" />
                    {currentTeam?.billing?.plan === 'free' || !currentTeam?.billing?.plan ? 'Upgrade Plan' : 'Manage Plan'}
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
                      <span>{currentTeam?.billing?.plan === 'enterprise' ? 'Unlimited' : currentTeam?.billing?.plan === 'pro' ? 'Up to 25' : 'Up to 5'} team members</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-2 h-2 rounded-full bg-green-500"></div>
                      <span>{currentTeam?.billing?.plan === 'enterprise' ? 'Priority support' : currentTeam?.billing?.plan === 'pro' ? 'Email support' : 'Community support'}</span>
                    </div>
                  </div>
                </div>

                {currentTeam?.billing?.billing_source === 'owner' && (
                  <div className="p-4 border rounded-lg bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900">
                    <p className="text-sm text-orange-900 dark:text-orange-200">
                      <strong>Note:</strong> This team uses the owner's personal plan and quota.
                      To upgrade, the team owner should manage their plan in personal settings.
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
          </div>
        )}
      </main>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{currentTeam.name}</strong> and remove all
              member access. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTeam}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Team
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
