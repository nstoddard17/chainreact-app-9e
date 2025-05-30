"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import AppLayout from "@/components/layout/AppLayout"
import { useOrganizationStore } from "@/stores/organizationStore"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus, Users, Settings, Crown, Loader2 } from "lucide-react"
import CreateOrganizationDialog from "./CreateOrganizationDialog"

export default function TeamsContent() {
  const { organizations, loading, fetchOrganizations } = useOrganizationStore()
  const [showCreateDialog, setShowCreateDialog] = useState(false)

  useEffect(() => {
    fetchOrganizations()
  }, [fetchOrganizations])

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Teams</h1>
            <p className="text-slate-600 mt-1">Manage your organizations and team collaboration</p>
          </div>
          <Button
            onClick={() => setShowCreateDialog(true)}
            className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Organization
          </Button>
        </div>

        {organizations.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 mb-2">No organizations yet</h3>
            <p className="text-slate-500 mb-6">Create your first organization to start collaborating with your team</p>
            <Button
              onClick={() => setShowCreateDialog(true)}
              className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Organization
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {organizations.map((org) => (
              <Card
                key={org.id}
                className="bg-white rounded-2xl shadow-lg border border-slate-200 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1"
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-semibold text-slate-900">{org.name}</CardTitle>
                    <div className="flex items-center space-x-2">
                      {org.role === "admin" && (
                        <Badge variant="secondary" className="bg-yellow-100 text-yellow-700">
                          <Crown className="w-3 h-3 mr-1" />
                          Admin
                        </Badge>
                      )}
                      <Badge variant="outline">{org.role}</Badge>
                    </div>
                  </div>
                  {org.description && <p className="text-sm text-slate-600">{org.description}</p>}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between text-sm text-slate-600">
                    <div className="flex items-center space-x-1">
                      <Users className="w-4 h-4" />
                      <span>{org.member_count || 1} members</span>
                    </div>
                    <span>Created: {new Date(org.created_at).toLocaleDateString()}</span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Link href={`/teams/${org.slug}`} className="flex-1">
                      <Button variant="outline" className="w-full">
                        View Organization
                      </Button>
                    </Link>
                    {org.role === "admin" && (
                      <Link href={`/teams/${org.slug}/settings`}>
                        <Button size="sm" variant="outline">
                          <Settings className="w-4 h-4" />
                        </Button>
                      </Link>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <CreateOrganizationDialog open={showCreateDialog} onOpenChange={setShowCreateDialog} />
      </div>
    </AppLayout>
  )
}
