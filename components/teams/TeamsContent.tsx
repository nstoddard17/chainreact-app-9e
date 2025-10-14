"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import AppLayout from "@/components/layout/AppLayout"
import { useOrganizationStore } from "@/stores/organizationStore"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Plus, Users, Settings, Crown, Loader2, Trash2 } from "lucide-react"
import CreateOrganizationDialog from "./CreateOrganizationDialog"
import { RoleGuard } from "@/components/ui/role-guard"
import { useAuthStore } from "@/stores/authStore"
import { toast } from "sonner"

import { logger } from '@/lib/utils/logger'

export default function TeamsContent() {
  const { organizations, loading, fetchOrganizations } = useOrganizationStore()
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [deletingOrg, setDeletingOrg] = useState<string | null>(null)

  useEffect(() => {
    fetchOrganizations()
  }, [fetchOrganizations])

  const handleDeleteOrganization = async (organizationId: string) => {
    try {
      setDeletingOrg(organizationId)
      
      const response = await fetch(`/api/organizations/${organizationId}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete organization')
      }

      const result = await response.json()
      toast.success(result.message)
      
      // Refresh the organizations list
      await fetchOrganizations()
    } catch (error) {
      logger.error('Error deleting organization:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to delete organization')
    } finally {
      setDeletingOrg(null)
    }
  }

  if (loading) {
    return (
      <AppLayout title="Teams">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout title="Teams" subtitle="Manage your organizations and team collaboration">
      <div className="space-y-6">
        <RoleGuard requiredRole="business">
          <div className="flex justify-end">
            <Button
              onClick={() => setShowCreateDialog(true)}
              className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Organization
            </Button>
          </div>
        </RoleGuard>

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
                      <>
                        <Link href={`/teams/${org.slug}?tab=settings`}>
                          <Button size="sm" variant="outline">
                            <Settings className="w-4 h-4" />
                          </Button>
                        </Link>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              disabled={deletingOrg === org.id}
                            >
                              {deletingOrg === org.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Organization</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete <strong>{org.name}</strong>? This action cannot be undone and will permanently remove:
                              </AlertDialogDescription>
                              <div className="mt-2 space-y-1">
                                <ul className="list-disc list-inside text-sm text-muted-foreground">
                                  <li>All organization members</li>
                                  <li>All organization workflows</li>
                                  <li>All organization data and settings</li>
                                  <li>All audit logs and history</li>
                                </ul>
                              </div>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteOrganization(org.id)}
                                className="bg-red-600 hover:bg-red-700"
                              >
                                Delete Organization
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
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
