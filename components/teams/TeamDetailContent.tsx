"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Users,
  Settings,
  ArrowLeft,
  Workflow,
  UserPlus,
  Calendar,
  LogOut,
  Loader2,
} from "lucide-react"
import { useWorkflowStore } from "@/stores/workflowStore"
import { useIntegrationStore } from "@/stores/integrationStore"
import { useAuthStore } from "@/stores/authStore"
import { hasPermission, type TeamRole } from "@/lib/types/roles"
import { TeamActivityFeed } from "@/components/teams/TeamActivityFeed"
import { TransferOwnershipDialog } from "@/components/teams/TransferOwnershipDialog"
import { toast } from "sonner"

interface Team {
  id: string
  name: string
  slug: string
  description?: string
  created_at: string
  team_members?: Array<{
    role: string
    joined_at: string
  }>
}

interface TeamDetailContentProps {
  team: Team
}

export default function TeamDetailContent({ team }: TeamDetailContentProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState("overview")
  const [memberCount, setMemberCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [transferOwnershipOpen, setTransferOwnershipOpen] = useState(false)

  const setWorkspaceContext = useWorkflowStore(state => state.setWorkspaceContext)
  const fetchWorkflows = useWorkflowStore(state => state.fetchWorkflows)
  const workflows = useWorkflowStore(state => state.workflows)
  const fetchIntegrations = useIntegrationStore(state => state.fetchIntegrations)
  const user = useAuthStore(state => state.user)

  const userRole = (team.team_members?.[0]?.role || 'member') as TeamRole

  // Check specific permissions based on role
  const canManageSettings = hasPermission(userRole, 'manage_settings', false)
  const canManageMembers = hasPermission(userRole, 'manage_members', false) ||
                          hasPermission(userRole, 'invite_members', false)
  const canCreateWorkflows = hasPermission(userRole, 'create_workflows', false) ||
                            hasPermission(userRole, 'manage_workflows', false) ||
                            userRole === 'owner' ||
                            userRole === 'admin'

  useEffect(() => {
    const initializeTeamWorkspace = async () => {
      setLoading(true)

      // Switch to this team's workspace
      setWorkspaceContext('team', team.id)

      // Fetch team data (no force needed - workspace context change will trigger fetch)
      await Promise.all([
        fetchWorkflows(false, 'team', team.id), // Don't force - let cache work
        fetchIntegrations(true),
        fetchMemberCount()
      ])

      setLoading(false)
    }

    initializeTeamWorkspace()
  }, [team.id])

  const fetchMemberCount = async () => {
    try {
      const response = await fetch(`/api/teams/${team.id}/members`)
      if (response.ok) {
        const data = await response.json()
        setMemberCount(data.members?.length || 0)
      }
    } catch (error) {
      console.error('Error fetching member count:', error)
    }
  }

  const handleBackToTeams = () => {
    router.push('/teams')
  }

  const handleViewMembers = () => {
    router.push(`/teams/${team.slug}/members`)
  }

  const handleCreateWorkflow = () => {
    router.push('/workflows')
  }

  const handleLeaveTeam = async () => {
    if (!user?.id) {
      toast.error('You must be logged in to leave a team')
      return
    }

    try {
      setLeaving(true)

      const response = await fetch(`/api/teams/${team.id}/members/${user.id}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to leave team')
      }

      toast.success('You have left the team')
      setLeaveDialogOpen(false)

      // Redirect to teams page
      router.push('/teams')
      router.refresh()
    } catch (error: any) {
      console.error('Error leaving team:', error)
      toast.error(error.message || 'Failed to leave team')
    } finally {
      setLeaving(false)
    }
  }

  // Check if user is owner and if there are other members
  const isOwner = userRole === 'owner'
  const canLeaveTeam = !isOwner || memberCount === 1

  return (
    <NewAppLayout
      title={team.name}
      subtitle={team.description || `Team workspace for ${team.name}`}
    >
      <div className="space-y-6">
        {/* Header with back button */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={handleBackToTeams}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Teams
          </Button>

          {canManageSettings && (
            <Button
              variant="outline"
              onClick={() => router.push(`/teams/${team.slug}/settings`)}
            >
              <Settings className="w-4 h-4 mr-2" />
              Team Settings
            </Button>
          )}
        </div>

        {/* Team Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Members</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold">{memberCount}</div>
                <Users className="w-8 h-8 text-slate-400" />
              </div>
              <Button
                variant="link"
                className="p-0 h-auto mt-2"
                onClick={handleViewMembers}
              >
                View all members →
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Workflows</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div className="text-2xl font-bold">{workflows.length}</div>
                <Workflow className="w-8 h-8 text-slate-400" />
              </div>
              <Button
                variant="link"
                className="p-0 h-auto mt-2"
                onClick={handleCreateWorkflow}
              >
                View workflows →
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Your Role</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <Badge
                  variant={userRole === 'owner' ? 'default' : 'secondary'}
                  className="text-sm"
                >
                  {userRole}
                </Badge>
                <UserPlus className="w-8 h-8 text-slate-400" />
              </div>
              <div className="text-xs text-slate-500 mt-2">
                Member since {new Date(team.team_members?.[0]?.joined_at || team.created_at).toLocaleDateString()}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs for different sections */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="activity">Recent Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Team Information</CardTitle>
                <CardDescription>
                  Details about this team
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-sm font-medium text-slate-700">Team Name</div>
                  <div className="text-sm text-slate-600 mt-1">{team.name}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-700">Description</div>
                  <div className="text-sm text-slate-600 mt-1">
                    {team.description || 'No description provided'}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-700">Team Slug</div>
                  <div className="text-sm text-slate-600 mt-1 font-mono">
                    {team.slug}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-slate-700">Created</div>
                  <div className="text-sm text-slate-600 mt-1 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    {new Date(team.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Only show Quick Actions card if user has at least one permission */}
            {(canCreateWorkflows || canManageMembers || canManageSettings) && (
              <Card>
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                  <CardDescription>
                    Common tasks for this team
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {canCreateWorkflows && (
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={handleCreateWorkflow}
                    >
                      <Workflow className="w-4 h-4 mr-2" />
                      Create Team Workflow
                    </Button>
                  )}
                  {canManageMembers && (
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={handleViewMembers}
                    >
                      <Users className="w-4 h-4 mr-2" />
                      Manage Team Members
                    </Button>
                  )}
                  {canManageSettings && (
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => router.push(`/teams/${team.slug}/settings`)}
                    >
                      <Settings className="w-4 h-4 mr-2" />
                      Team Settings
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="activity" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>
                  Team activity and updates
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TeamActivityFeed teamId={team.id} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Leave Team Section */}
        <Card className="border-red-200 dark:border-red-900">
          <CardHeader>
            <CardTitle className="text-red-600 dark:text-red-400">Danger Zone</CardTitle>
            <CardDescription>
              Irreversible actions for this team
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Transfer Ownership (Owner only) */}
            {isOwner && memberCount > 1 && (
              <div className="flex items-center justify-between pb-4 border-b border-red-100 dark:border-red-900">
                <div className="space-y-1">
                  <div className="font-medium">Transfer Ownership</div>
                  <div className="text-sm text-slate-500">
                    Transfer team ownership to another member
                  </div>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setTransferOwnershipOpen(true)}
                >
                  Transfer Ownership
                </Button>
              </div>
            )}

            {/* Leave Team */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="font-medium">Leave Team</div>
                <div className="text-sm text-slate-500">
                  {isOwner && memberCount > 1
                    ? "You must transfer ownership before leaving this team"
                    : isOwner
                    ? "As the last member, leaving will delete this team"
                    : "Remove yourself from this team"}
                </div>
              </div>
              <Button
                variant="destructive"
                onClick={() => setLeaveDialogOpen(true)}
                disabled={!canLeaveTeam}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Leave Team
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Leave Team Confirmation Dialog */}
        <Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Leave {team.name}?</DialogTitle>
              <DialogDescription>
                {isOwner && memberCount === 1 ? (
                  <div className="space-y-2 mt-2">
                    <p className="text-red-600 dark:text-red-400 font-medium">
                      Warning: This will permanently delete the team
                    </p>
                    <p>
                      As the last member and owner, leaving this team will permanently delete it along with:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li>All team workflows</li>
                      <li>All team folders</li>
                      <li>All team activity history</li>
                      <li>All team settings</li>
                    </ul>
                    <p className="mt-2">This action cannot be undone.</p>
                  </div>
                ) : (
                  <div className="space-y-2 mt-2">
                    <p>
                      You will be removed from this team and will lose access to:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li>Team workflows</li>
                      <li>Team folders</li>
                      <li>Team activity</li>
                      <li>Team settings</li>
                    </ul>
                    <p className="mt-2">
                      You can be re-invited by a team admin or owner.
                    </p>
                  </div>
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setLeaveDialogOpen(false)}
                disabled={leaving}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleLeaveTeam}
                disabled={leaving}
              >
                {leaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Leaving...
                  </>
                ) : (
                  <>
                    <LogOut className="w-4 h-4 mr-2" />
                    {isOwner && memberCount === 1 ? "Delete Team" : "Leave Team"}
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Transfer Ownership Dialog */}
        <TransferOwnershipDialog
          open={transferOwnershipOpen}
          onOpenChange={setTransferOwnershipOpen}
          teamId={team.id}
          teamName={team.name}
          currentUserId={user?.id || ''}
          onSuccess={() => {
            // Refresh the page to update ownership status
            router.refresh()
          }}
        />
      </div>
    </NewAppLayout>
  )
}
