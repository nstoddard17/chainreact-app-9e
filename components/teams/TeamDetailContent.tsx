"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Users,
  Settings,
  ArrowLeft,
  Workflow,
  UserPlus,
  Calendar,
} from "lucide-react"
import { useWorkflowStore } from "@/stores/workflowStore"
import { useIntegrationStore } from "@/stores/integrationStore"

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

  const setWorkspaceContext = useWorkflowStore(state => state.setWorkspaceContext)
  const fetchWorkflows = useWorkflowStore(state => state.fetchWorkflows)
  const workflows = useWorkflowStore(state => state.workflows)
  const fetchIntegrations = useIntegrationStore(state => state.fetchIntegrations)

  const userRole = team.team_members?.[0]?.role || 'member'
  const canManageTeam = ['owner', 'admin'].includes(userRole)

  useEffect(() => {
    const initializeTeamWorkspace = async () => {
      setLoading(true)

      // Switch to this team's workspace
      setWorkspaceContext('team', team.id)

      // Fetch team data
      await Promise.all([
        fetchWorkflows(true),
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

          {canManageTeam && (
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

            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>
                  Common tasks for this team
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={handleCreateWorkflow}
                >
                  <Workflow className="w-4 h-4 mr-2" />
                  Create Team Workflow
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={handleViewMembers}
                >
                  <Users className="w-4 h-4 mr-2" />
                  Manage Team Members
                </Button>
                {canManageTeam && (
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
                <div className="text-sm text-slate-500 text-center py-8">
                  Activity feed coming soon
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </NewAppLayout>
  )
}
