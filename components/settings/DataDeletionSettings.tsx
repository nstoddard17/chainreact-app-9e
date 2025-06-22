"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Trash2, AlertTriangle, Clock, Shield, Database } from "lucide-react"
import { toast } from "@/hooks/use-toast"

interface DeletionRequest {
  id: string
  deletion_type: string
  integration_provider?: string
  reason: string
  status: "pending" | "scheduled" | "completed" | "failed"
  requested_at: string
  scheduled_for?: string
  completed_at?: string
}

export default function DataDeletionSettings() {
  const [showFullDeletionDialog, setShowFullDeletionDialog] = useState(false)
  const [showPartialDeletionDialog, setShowPartialDeletionDialog] = useState(false)
  const [showIntegrationDeletionDialog, setShowIntegrationDeletionDialog] = useState(false)
  const [selectedIntegration, setSelectedIntegration] = useState("")
  const [deleting, setDeleting] = useState(false)
  const [deletionRequests, setDeletionRequests] = useState<DeletionRequest[]>([])

  useEffect(() => {
    fetchDeletionRequests()
  }, [])

  const fetchDeletionRequests = async () => {
    try {
      const response = await fetch("/api/privacy/data-deletion")
      if (response.ok) {
        const data = await response.json()
        setDeletionRequests(data.deletionRequests || [])
      }
    } catch (error) {
      console.error("Failed to fetch deletion requests:", error)
    }
  }

  const handleDeletionRequest = async (deletionType: string, integrationProvider?: string) => {
    setDeleting(true)
    try {
      const response = await fetch("/api/privacy/data-deletion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deletionType,
          integrationProvider,
          reason: "user_request",
          immediate: false
        })
      })

      const data = await response.json()

      if (response.ok) {
        toast({
          title: "Deletion Request Submitted",
          description: data.message,
          variant: "success"
        })
        
        await fetchDeletionRequests()
        
        setShowFullDeletionDialog(false)
        setShowPartialDeletionDialog(false)
        setShowIntegrationDeletionDialog(false)
        setSelectedIntegration("")
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to submit deletion request",
          variant: "destructive"
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to submit deletion request",
        variant: "destructive"
      })
    } finally {
      setDeleting(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline">Pending</Badge>
      case "scheduled":
        return <Badge variant="outline">Scheduled</Badge>
      case "completed":
        return <Badge variant="default">Completed</Badge>
      case "failed":
        return <Badge variant="destructive">Failed</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    })
  }

  return (
    <div className="space-y-6">
      <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Data Deletion & Privacy
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-600 mb-4">
            You have the right to request deletion of your data. Choose the type of deletion that best fits your needs.
          </p>
          
          <Alert className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Important:</strong> Data deletion requests are processed within 30 days as per our privacy policy. 
              Some data may be retained for legal compliance purposes.
            </AlertDescription>
          </Alert>

          <div className="grid gap-4 md:grid-cols-3">
            <Card className="border-2 border-red-200 hover:border-red-300 transition-colors">
              <CardContent className="pt-6">
                <div className="text-center">
                  <Trash2 className="h-8 w-8 text-red-500 mx-auto mb-2" />
                  <h3 className="font-semibold text-slate-900 mb-2">Full Account Deletion</h3>
                  <p className="text-sm text-slate-600 mb-4">
                    Permanently delete your account and all associated data
                  </p>
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={() => setShowFullDeletionDialog(true)}
                  >
                    Request Full Deletion
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 border-orange-200 hover:border-orange-300 transition-colors">
              <CardContent className="pt-6">
                <div className="text-center">
                  <Database className="h-8 w-8 text-orange-500 mx-auto mb-2" />
                  <h3 className="font-semibold text-slate-900 mb-2">Partial Data Deletion</h3>
                  <p className="text-sm text-slate-600 mb-4">
                    Delete sensitive data while keeping your account
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setShowPartialDeletionDialog(true)}
                  >
                    Request Partial Deletion
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-2 border-blue-200 hover:border-blue-300 transition-colors">
              <CardContent className="pt-6">
                <div className="text-center">
                  <Shield className="h-8 w-8 text-blue-500 mx-auto mb-2" />
                  <h3 className="font-semibold text-slate-900 mb-2">Integration Deletion</h3>
                  <p className="text-sm text-slate-600 mb-4">
                    Delete data from specific integrations only
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setShowIntegrationDeletionDialog(true)}
                  >
                    Request Integration Deletion
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white rounded-2xl shadow-lg border border-slate-200">
        <CardHeader>
          <CardTitle className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Your Deletion Requests
          </CardTitle>
        </CardHeader>
        <CardContent>
          {deletionRequests.length === 0 ? (
            <p className="text-slate-500 text-center py-4">No deletion requests found.</p>
          ) : (
            <div className="space-y-3">
              {deletionRequests.map((request) => (
                <div key={request.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">
                        {request.deletion_type === "full" && "Full Account Deletion"}
                        {request.deletion_type === "partial" && "Partial Data Deletion"}
                        {request.deletion_type === "integration_specific" && `${request.integration_provider} Integration Deletion`}
                      </span>
                      {getStatusBadge(request.status)}
                    </div>
                    <p className="text-sm text-slate-500">
                      Requested: {formatDate(request.requested_at)}
                      {request.scheduled_for && ` • Scheduled: ${formatDate(request.scheduled_for)}`}
                      {request.completed_at && ` • Completed: ${formatDate(request.completed_at)}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showFullDeletionDialog} onOpenChange={setShowFullDeletionDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Full Account Deletion
            </DialogTitle>
            <DialogDescription>
              This will permanently delete your account and all associated data including:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <ul className="list-disc pl-5 space-y-1">
              <li>All workflows and configurations</li>
              <li>All integrations and tokens</li>
              <li>All execution history</li>
              <li>Your account profile</li>
              <li>All associated data</li>
            </ul>
            <Alert className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>This action is irreversible.</strong> Once processed, your data cannot be recovered.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFullDeletionDialog(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => handleDeletionRequest("full")}
              disabled={deleting}
            >
              {deleting ? "Requesting..." : "Request Full Deletion"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPartialDeletionDialog} onOpenChange={setShowPartialDeletionDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <Database className="h-5 w-5" />
              Partial Data Deletion
            </DialogTitle>
            <DialogDescription>
              This will delete sensitive data while keeping your account active:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <ul className="list-disc pl-5 space-y-1">
              <li>All integrations and tokens</li>
              <li>Workflow execution history</li>
              <li>Sensitive configuration data</li>
              <li>Personal data in workflows</li>
            </ul>
            <p className="text-slate-600 mt-2">
              Your account and workflow structures will remain, but will be anonymized.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPartialDeletionDialog(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button 
              variant="outline" 
              onClick={() => handleDeletionRequest("partial")}
              disabled={deleting}
            >
              {deleting ? "Requesting..." : "Request Partial Deletion"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showIntegrationDeletionDialog} onOpenChange={setShowIntegrationDeletionDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-600">
              <Shield className="h-5 w-5" />
              Integration-Specific Deletion
            </DialogTitle>
            <DialogDescription>
              Select which integration's data you want to delete:
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {["slack", "gmail", "google-drive", "notion", "github", "discord"].map((provider) => (
                <Button
                  key={provider}
                  variant={selectedIntegration === provider ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedIntegration(provider)}
                >
                  {provider}
                </Button>
              ))}
            </div>
            {selectedIntegration && (
              <Alert>
                <AlertDescription>
                  This will delete all data associated with your {selectedIntegration} integration, 
                  including tokens and related workflow executions.
                </AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowIntegrationDeletionDialog(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button 
              variant="outline" 
              onClick={() => handleDeletionRequest("integration_specific", selectedIntegration)}
              disabled={deleting || !selectedIntegration}
            >
              {deleting ? "Requesting..." : "Request Integration Deletion"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
