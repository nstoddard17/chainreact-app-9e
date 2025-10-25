"use client"

import { useState, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Users, Workflow, Settings, Activity, Crown, Building2, ArrowLeft } from "lucide-react"
import MemberManagement from "./MemberManagement"
import OrganizationWorkflows from "./OrganizationWorkflows"
import OrganizationSettings from "./OrganizationSettings"
import AuditLog from "./AuditLog"
import TeamManagement from "./TeamManagement"

interface Props {
  organization: any
}

export default function OrganizationContent({ organization }: Props) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState("overview")
  const [currentOrganization, setCurrentOrganization] = useState(organization)
  const userRole = currentOrganization.members?.[0]?.role || "viewer"

  // Handle tab parameter from URL
  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam && ['overview', 'workflows', 'members', 'teams', 'settings'].includes(tabParam)) {
      setActiveTab(tabParam)
    }
  }, [searchParams])

  const handleOrganizationUpdate = (updatedOrg: any) => {
    setCurrentOrganization(updatedOrg)
  }

  return (
    <NewAppLayout title="Organization">
      <div className="space-y-6">
        {/* Organization Header */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push('/teams')}
                className="flex items-center space-x-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Teams</span>
              </Button>
              <div className="flex items-center space-x-3">
                <h1 className="text-3xl font-bold text-slate-900">{currentOrganization.name}</h1>
                <Badge variant="outline" className="flex items-center space-x-1">
                  {userRole === "admin" && <Crown className="w-3 h-3" />}
                  <span>{userRole}</span>
                </Badge>
              </div>
            </div>
          </div>
          {currentOrganization.description && <p className="text-slate-600 mt-2">{currentOrganization.description}</p>}
        </div>

        {/* Organization Tabs */}
        <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab}>
          <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
            <CardContent className="p-0">
              <TabsList className="w-full justify-start rounded-none border-b border-slate-200 bg-transparent p-0">
                <TabsTrigger
                  value="overview"
                  className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-blue-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  <Activity className="w-4 h-4 mr-2" />
                  Overview
                </TabsTrigger>
                <TabsTrigger
                  value="teams"
                  className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-blue-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  <Building2 className="w-4 h-4 mr-2" />
                  Teams
                </TabsTrigger>
                <TabsTrigger
                  value="workflows"
                  className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-blue-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  <Workflow className="w-4 h-4 mr-2" />
                  Workflows
                </TabsTrigger>
                <TabsTrigger
                  value="members"
                  className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-blue-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                >
                  <Users className="w-4 h-4 mr-2" />
                  Members
                </TabsTrigger>
                {userRole === "admin" && (
                  <TabsTrigger
                    value="settings"
                    className="rounded-none border-b-2 border-transparent px-4 py-3 data-[state=active]:border-blue-500 data-[state=active]:bg-transparent data-[state=active]:shadow-none"
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Settings
                  </TabsTrigger>
                )}
              </TabsList>
            </CardContent>
          </Card>

          <TabsContent value="overview" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-slate-900">Team Members</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-blue-600">{currentOrganization.member_count || 1}</div>
                  <p className="text-sm text-slate-500">Active members</p>
                </CardContent>
              </Card>

              <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-slate-900">Teams</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-green-600">{currentOrganization.teams?.length || 0}</div>
                  <p className="text-sm text-slate-500">Active teams</p>
                </CardContent>
              </Card>

              <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold text-slate-900">Workflows</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold text-purple-600">{currentOrganization.workflow_count || 0}</div>
                  <p className="text-sm text-slate-500">Organization workflows</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="teams" className="mt-6">
            <TeamManagement organizationId={currentOrganization.id} userRole={userRole} />
          </TabsContent>

          <TabsContent value="workflows" className="mt-6">
            <OrganizationWorkflows organizationId={currentOrganization.id} userRole={userRole} />
          </TabsContent>

          <TabsContent value="members" className="mt-6">
            <MemberManagement organizationId={currentOrganization.id} userRole={userRole} />
          </TabsContent>

          {userRole === "admin" && (
            <TabsContent value="settings" className="mt-6">
              <OrganizationSettings 
                organization={currentOrganization} 
                onUpdate={handleOrganizationUpdate}
              />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </NewAppLayout>
  )
}
