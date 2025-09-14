"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/utils/supabaseClient"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import {
  UserPlus,
  Users,
  Clock,
  Activity,
  MessageSquare,
  TrendingUp,
  Mail,
  Calendar,
  AlertCircle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Download,
  Send,
  Trash2,
  Edit,
  FlaskConical
} from "lucide-react"
import { format } from "date-fns"

interface BetaTester {
  id: string
  email: string
  status: 'active' | 'expired' | 'converted' | 'revoked'
  added_at: string
  expires_at: string
  added_by: string
  notes: string
  max_workflows: number | null
  max_executions_per_month: number | null
  max_integrations: number | null
  conversion_offer_sent_at: string | null
  converted_to_paid_at: string | null
  last_active_at: string | null
  total_workflows_created: number
  total_executions: number
  feedback_count: number
}

interface BetaActivity {
  id: string
  activity_type: string
  activity_data: any
  created_at: string
  user?: {
    email: string
    profiles?: {
      name: string
    }
  }
}

interface BetaFeedback {
  id: string
  feedback_type: string
  subject: string
  message: string
  rating: number
  created_at: string
  user?: {
    email: string
  }
}

export default function BetaTestersContent() {
  const [betaTesters, setBetaTesters] = useState<BetaTester[]>([])
  const [activities, setActivities] = useState<BetaActivity[]>([])
  const [feedback, setFeedback] = useState<BetaFeedback[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("testers")
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showMigrationDialog, setShowMigrationDialog] = useState(false)
  const [showSendAllDialog, setShowSendAllDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [selectedTester, setSelectedTester] = useState<BetaTester | null>(null)
  const [sendingOffer, setSendingOffer] = useState<string | null>(null)
  const { toast } = useToast()

  // Form states
  const [newTesterEmail, setNewTesterEmail] = useState("")
  const [newTesterNotes, setNewTesterNotes] = useState("")
  const [newTesterExpiry, setNewTesterExpiry] = useState("90")
  const [newTesterWorkflows, setNewTesterWorkflows] = useState("50")
  const [newTesterExecutions, setNewTesterExecutions] = useState("5000")

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      await Promise.all([
        fetchBetaTesters(),
        fetchActivities(),
        fetchFeedback()
      ])
      setLoading(false)
    }
    loadData()
  }, [])

  const fetchBetaTesters = async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("beta_testers")
        .select("*")
        .order("created_at", { ascending: false })

      if (error) {
        console.error("Error fetching beta testers:", error.message || error)
        // Only show toast for non-table-missing errors
        if (error.code !== '42P01') {
          toast({
            title: "Error",
            description: error.message || "Failed to fetch beta testers",
            variant: "destructive"
          })
        }
        // Set empty array if table doesn't exist
        setBetaTesters([])
      } else {
        setBetaTesters(data || [])
      }
    } catch (err) {
      console.error("Unexpected error fetching beta testers:", err)
      setBetaTesters([])
    }
  }

  const fetchActivities = async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("beta_tester_activity")
        .select(`
          *,
          user:user_id (
            email,
            profiles (name)
          )
        `)
        .order("created_at", { ascending: false })
        .limit(50)

      if (!error && data) {
        setActivities(data)
      } else {
        setActivities([])
      }
    } catch (err) {
      console.error("Error fetching activities:", err)
      setActivities([])
    }
  }

  const fetchFeedback = async () => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from("beta_tester_feedback")
        .select(`
          *,
          user:user_id (email)
        `)
        .order("created_at", { ascending: false })

      if (!error && data) {
        setFeedback(data)
      } else {
        setFeedback([])
      }
    } catch (err) {
      console.error("Error fetching feedback:", err)
      setFeedback([])
    }
  }

  const handleAddBetaTester = async () => {
    // Validate email
    if (!newTesterEmail || !newTesterEmail.includes('@')) {
      toast({
        title: "Invalid Email",
        description: "Please enter a valid email address",
        variant: "destructive"
      })
      return
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(newTesterEmail)) {
      toast({
        title: "Invalid Email Format",
        description: "Please enter a valid email address",
        variant: "destructive"
      })
      return
    }

    const supabase = createClient()

    const expiryDays = parseInt(newTesterExpiry)
    const expiresAt = expiryDays > 0
      ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString()
      : null

    const { data: userData } = await supabase.auth.getUser()

    const { error } = await supabase
      .from("beta_testers")
      .insert({
        email: newTesterEmail.toLowerCase().trim(),
        notes: newTesterNotes.trim(),
        expires_at: expiresAt,
        max_workflows: parseInt(newTesterWorkflows) || 50,
        max_executions_per_month: parseInt(newTesterExecutions) || 5000,
        max_integrations: 30,
        added_by: userData?.user?.id,
        status: 'active'
      })

    if (error) {
      if (error.code === '23505') {
        toast({
          title: "Email Already Exists",
          description: "This email is already registered as a beta tester",
          variant: "destructive"
        })
      } else {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive"
        })
      }
    } else {
      toast({
        title: "Success",
        description: `Beta tester ${newTesterEmail} added successfully`,
      })
      setShowAddDialog(false)
      // Reset form fields
      setNewTesterEmail("")
      setNewTesterNotes("")
      setNewTesterExpiry("90")
      setNewTesterWorkflows("50")
      setNewTesterExecutions("5000")
      fetchBetaTesters()
    }
  }

  const handleUpdateStatus = async (testerId: string, newStatus: string) => {
    const supabase = createClient()
    const { error } = await supabase
      .from("beta_testers")
      .update({
        status: newStatus,
        updated_at: new Date().toISOString()
      })
      .eq("id", testerId)

    if (error) {
      toast({
        title: "Error",
        description: "Failed to update status",
        variant: "destructive"
      })
    } else {
      toast({
        title: "Success",
        description: "Status updated successfully"
      })
      fetchBetaTesters()
    }
  }

  const handleSendConversionOffer = async (tester: BetaTester, isResend: boolean = false) => {
    setSendingOffer(tester.id)
    try {
      // If resending, clear the previous offer timestamp first
      if (isResend) {
        const supabase = createClient()
        await supabase
          .from("beta_testers")
          .update({
            conversion_offer_sent_at: null,
            signup_token: null
          })
          .eq("id", tester.id)
      }

      const response = await fetch("/api/admin/beta-testers/send-offer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          testerIds: [tester.id],
          sendToAll: false
        })
      })

      const data = await response.json()

      if (response.ok) {
        toast({
          title: isResend ? "Offer Resent" : "Offer Sent",
          description: `Beta invitation ${isResend ? 'resent' : 'sent'} to ${tester.email}`,
        })
        fetchBetaTesters()
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to send offer",
          variant: "destructive"
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send offer",
        variant: "destructive"
      })
    } finally {
      setSendingOffer(null)
    }
  }

  const handleDeleteTester = async (tester: BetaTester) => {
    const supabase = createClient()
    const { error } = await supabase
      .from("beta_testers")
      .delete()
      .eq("id", tester.id)

    if (error) {
      toast({
        title: "Error",
        description: "Failed to delete beta tester",
        variant: "destructive"
      })
    } else {
      toast({
        title: "Success",
        description: `Beta tester ${tester.email} has been deleted`,
      })
      setShowDeleteDialog(false)
      setSelectedTester(null)
      fetchBetaTesters()
    }
  }

  const handleSendOffersToAll = async () => {
    try {
      const response = await fetch("/api/admin/beta-testers/send-offer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sendToAll: true
        })
      })

      const data = await response.json()

      if (response.ok) {
        toast({
          title: "Offers Sent",
          description: data.message || `Sent ${data.count} beta invitations`,
        })
        fetchBetaTesters()
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to send offers",
          variant: "destructive"
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send offers",
        variant: "destructive"
      })
    }
  }

  const handleExportData = () => {
    const csvContent = [
      ["Email", "Status", "Added", "Expires", "Workflows Created", "Executions", "Feedback Count"],
      ...betaTesters.map(t => [
        t.email,
        t.status,
        format(new Date(t.added_at), "yyyy-MM-dd"),
        t.expires_at ? format(new Date(t.expires_at), "yyyy-MM-dd") : "Never",
        t.total_workflows_created,
        t.total_executions,
        t.feedback_count
      ])
    ].map(row => row.join(",")).join("\n")

    const blob = new Blob([csvContent], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `beta-testers-${format(new Date(), "yyyy-MM-dd")}.csv`
    a.click()
  }

  const stats = {
    total: betaTesters.length,
    active: betaTesters.filter(t => t.status === 'active').length,
    expired: betaTesters.filter(t => t.status === 'expired').length,
    converted: betaTesters.filter(t => t.status === 'converted').length,
    totalFeedback: feedback.length,
    recentActivity: activities.filter(a => {
      const date = new Date(a.created_at)
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      return date > weekAgo
    }).length
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { color: "default" | "secondary" | "destructive" | "outline", icon: any }> = {
      active: { color: "default", icon: CheckCircle },
      expired: { color: "secondary", icon: Clock },
      converted: { color: "default", icon: TrendingUp },
      revoked: { color: "destructive", icon: XCircle }
    }
    const variant = variants[status] || variants.active
    const Icon = variant.icon
    return (
      <Badge variant={variant.color} className="flex items-center gap-1">
        <Icon className="w-3 h-3" />
        {status}
      </Badge>
    )
  }

  return (
    <div className="w-full space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-muted-foreground truncate">Total Testers</p>
                  <p className="text-xl sm:text-2xl font-bold">{stats.total}</p>
                </div>
                <Users className="w-6 h-6 sm:w-8 sm:h-8 text-muted-foreground flex-shrink-0" />
              </div>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-muted-foreground truncate">Active</p>
                  <p className="text-xl sm:text-2xl font-bold text-green-600">{stats.active}</p>
                </div>
                <CheckCircle className="w-6 h-6 sm:w-8 sm:h-8 text-green-600 flex-shrink-0" />
              </div>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-muted-foreground truncate">Expired</p>
                  <p className="text-xl sm:text-2xl font-bold text-yellow-600">{stats.expired}</p>
                </div>
                <Clock className="w-6 h-6 sm:w-8 sm:h-8 text-yellow-600 flex-shrink-0" />
              </div>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-muted-foreground truncate">Converted</p>
                  <p className="text-xl sm:text-2xl font-bold text-blue-600">{stats.converted}</p>
                </div>
                <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600 flex-shrink-0" />
              </div>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-muted-foreground truncate">Feedback</p>
                  <p className="text-xl sm:text-2xl font-bold">{stats.totalFeedback}</p>
                </div>
                <MessageSquare className="w-6 h-6 sm:w-8 sm:h-8 text-muted-foreground flex-shrink-0" />
              </div>
            </CardContent>
          </Card>
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-muted-foreground truncate">Weekly Active</p>
                  <p className="text-xl sm:text-2xl font-bold">{stats.recentActivity}</p>
                </div>
                <Activity className="w-6 h-6 sm:w-8 sm:h-8 text-muted-foreground flex-shrink-0" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setShowAddDialog(true)} className="flex-shrink-0">
            <UserPlus className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Add Beta Tester</span>
            <span className="sm:hidden">Add</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowSendAllDialog(true)}
            className="flex-shrink-0"
            disabled={betaTesters.filter(t => t.status === 'active' && !t.conversion_offer_sent_at).length === 0}
          >
            <Mail className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Send Offer to All</span>
            <span className="sm:hidden">Send All</span>
          </Button>
          <Button variant="outline" onClick={() => setShowMigrationDialog(true)} className="flex-shrink-0">
            <RefreshCw className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Process Expirations</span>
            <span className="sm:hidden">Process</span>
          </Button>
          <Button variant="outline" onClick={handleExportData} className="flex-shrink-0">
            <Download className="w-4 h-4 mr-2" />
            <span className="hidden sm:inline">Export CSV</span>
            <span className="sm:hidden">Export</span>
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="testers">Beta Testers</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="feedback">Feedback</TabsTrigger>
          </TabsList>

          <TabsContent value="testers" className="mt-4 space-y-4">
            {loading ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <RefreshCw className="w-8 h-8 mx-auto mb-4 animate-spin" />
                  <p>Loading beta testers...</p>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>Beta Testers</CardTitle>
                  <CardDescription>Manage beta tester access and status</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="border-b bg-muted/50">
                        <tr>
                          <th className="text-left p-4 font-medium">Email</th>
                          <th className="text-left p-4 font-medium">Status</th>
                          <th className="text-left p-4 font-medium">Usage</th>
                          <th className="text-left p-4 font-medium">Added</th>
                          <th className="text-left p-4 font-medium">Expires</th>
                          <th className="text-left p-4 font-medium">Last Active</th>
                          <th className="text-right p-4 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {betaTesters.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="text-center p-8 text-muted-foreground">
                              No beta testers found. Click "Add Beta Tester" to get started.
                            </td>
                          </tr>
                        ) : (
                          betaTesters.map((tester) => (
                            <tr key={tester.id} className="border-b hover:bg-muted/50 transition-colors">
                              <td className="p-4">
                                <div>
                                  <p className="font-medium">{tester.email}</p>
                                  {tester.notes && (
                                    <p className="text-xs text-muted-foreground mt-1">{tester.notes}</p>
                                  )}
                                </div>
                              </td>
                              <td className="p-4">
                                {getStatusBadge(tester.status)}
                              </td>
                              <td className="p-4">
                                <div className="text-sm space-y-1">
                                  <p>Workflows: {tester.total_workflows_created}/{tester.max_workflows || 50}</p>
                                  <p>Executions: {tester.total_executions}/{tester.max_executions_per_month || 5000}</p>
                                  <p>Feedback: {tester.feedback_count}</p>
                                </div>
                              </td>
                              <td className="p-4 text-sm">
                                {format(new Date(tester.added_at), "MMM d, yyyy")}
                              </td>
                              <td className="p-4 text-sm">
                                {tester.expires_at ? format(new Date(tester.expires_at), "MMM d, yyyy") : "Never"}
                              </td>
                              <td className="p-4 text-sm">
                                {tester.last_active_at ? format(new Date(tester.last_active_at), "MMM d, yyyy") : "Never"}
                              </td>
                              <td className="p-4">
                                <div className="flex gap-1 justify-end flex-wrap">
                            {tester.status === 'active' && (
                              tester.conversion_offer_sent_at ? (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled
                                    className="text-green-600"
                                  >
                                    <CheckCircle className="w-4 h-4 mr-1" />
                                    Sent
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleSendConversionOffer(tester, true)}
                                    disabled={sendingOffer === tester.id}
                                  >
                                    {sendingOffer === tester.id ? (
                                      <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                                    ) : (
                                      <Send className="w-4 h-4 mr-1" />
                                    )}
                                    Resend
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleSendConversionOffer(tester, false)}
                                  disabled={sendingOffer === tester.id}
                                >
                                  {sendingOffer === tester.id ? (
                                    <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                                  ) : (
                                    <Mail className="w-4 h-4 mr-1" />
                                  )}
                                  Send
                                </Button>
                              )
                            )}
                            {tester.status === 'expired' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleUpdateStatus(tester.id, 'active')}
                              >
                                <RefreshCw className="w-4 h-4 mr-1" />
                                Reactivate
                              </Button>
                            )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setSelectedTester(tester)
                                      setShowEditDialog(true)
                                    }}
                                  >
                                    <Edit className="w-4 h-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-600 hover:text-red-700"
                                    onClick={() => {
                                      setSelectedTester(tester)
                                      setShowDeleteDialog(true)
                                    }}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="activity" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Track beta tester engagement</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b bg-muted/50">
                      <tr>
                        <th className="text-left p-4 font-medium">User</th>
                        <th className="text-left p-4 font-medium">Activity Type</th>
                        <th className="text-left p-4 font-medium">Details</th>
                        <th className="text-left p-4 font-medium">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activities.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-center p-8 text-muted-foreground">
                            No activity recorded yet.
                          </td>
                        </tr>
                      ) : (
                        activities.map((activity) => (
                          <tr key={activity.id} className="border-b hover:bg-muted/50 transition-colors">
                            <td className="p-4">
                              <p className="text-sm">{activity.user?.email || 'Unknown'}</p>
                            </td>
                            <td className="p-4">
                              <div className="flex items-center gap-2">
                                <Activity className="w-4 h-4 text-muted-foreground" />
                                <span className="text-sm font-medium">{activity.activity_type.replace(/_/g, ' ')}</span>
                              </div>
                            </td>
                            <td className="p-4">
                              <p className="text-sm text-muted-foreground">
                                {activity.activity_data ? JSON.stringify(activity.activity_data).substring(0, 50) + '...' : '-'}
                              </p>
                            </td>
                            <td className="p-4 text-sm text-muted-foreground">
                              {format(new Date(activity.created_at), "MMM d, h:mm a")}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="feedback" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Beta Feedback</CardTitle>
                <CardDescription>Feedback submitted by beta testers</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b bg-muted/50">
                      <tr>
                        <th className="text-left p-4 font-medium">User</th>
                        <th className="text-left p-4 font-medium">Type</th>
                        <th className="text-left p-4 font-medium">Subject</th>
                        <th className="text-left p-4 font-medium">Message</th>
                        <th className="text-left p-4 font-medium">Rating</th>
                        <th className="text-left p-4 font-medium">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {feedback.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center p-8 text-muted-foreground">
                            No feedback submitted yet.
                          </td>
                        </tr>
                      ) : (
                        feedback.map((item) => (
                          <tr key={item.id} className="border-b hover:bg-muted/50 transition-colors">
                            <td className="p-4">
                              <p className="text-sm">{item.user?.email || 'Unknown'}</p>
                            </td>
                            <td className="p-4">
                              <Badge variant={
                                item.feedback_type === 'bug' ? 'destructive' :
                                item.feedback_type === 'feature_request' ? 'default' :
                                'secondary'
                              }>
                                {item.feedback_type.replace(/_/g, ' ')}
                              </Badge>
                            </td>
                            <td className="p-4">
                              <p className="text-sm font-medium">{item.subject || '-'}</p>
                            </td>
                            <td className="p-4">
                              <p className="text-sm text-muted-foreground max-w-xs truncate">{item.message}</p>
                            </td>
                            <td className="p-4">
                              {item.rating ? (
                                <div className="flex gap-1">
                                  {[...Array(5)].map((_, i) => (
                                    <span key={i} className={i < item.rating ? "text-yellow-500" : "text-gray-300"}>
                                      ★
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </td>
                            <td className="p-4 text-sm text-muted-foreground">
                              {format(new Date(item.created_at), "MMM d, yyyy")}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Add Beta Tester Dialog */}
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Beta Tester</DialogTitle>
              <DialogDescription>
                Add a new email to the beta testing program
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Email Address *</Label>
                <Input
                  type="email"
                  placeholder="john@example.com"
                  value={newTesterEmail}
                  onChange={(e) => setNewTesterEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea
                  placeholder="Any special notes about this tester..."
                  value={newTesterNotes}
                  onChange={(e) => setNewTesterNotes(e.target.value)}
                  rows={3}
                />
              </div>
              <div>
                <Label>Access Duration</Label>
                <Select value={newTesterExpiry} onValueChange={setNewTesterExpiry}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="60">60 days</SelectItem>
                    <SelectItem value="90">90 days (default)</SelectItem>
                    <SelectItem value="180">180 days</SelectItem>
                    <SelectItem value="365">1 year</SelectItem>
                    <SelectItem value="0">Never expires</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Max Workflows</Label>
                  <Input
                    type="number"
                    placeholder="50"
                    value={newTesterWorkflows}
                    onChange={(e) => setNewTesterWorkflows(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Max Executions/Month</Label>
                  <Input
                    type="number"
                    placeholder="5000"
                    value={newTesterExecutions}
                    onChange={(e) => setNewTesterExecutions(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setShowAddDialog(false)
                setNewTesterEmail("")
                setNewTesterNotes("")
                setNewTesterExpiry("90")
                setNewTesterWorkflows("50")
                setNewTesterExecutions("5000")
              }}>
                Cancel
              </Button>
              <Button
                onClick={handleAddBetaTester}
                disabled={!newTesterEmail || !newTesterEmail.includes('@')}
              >
                <UserPlus className="w-4 h-4 mr-2" />
                Add Beta Tester
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Beta Tester Dialog */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Beta Tester</DialogTitle>
              <DialogDescription>
                Update beta tester settings and limits
              </DialogDescription>
            </DialogHeader>
            {selectedTester && (
              <div className="space-y-4">
                <div>
                  <Label>Email Address</Label>
                  <Input
                    type="email"
                    value={selectedTester.email}
                    disabled
                    className="bg-muted"
                  />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select
                    value={selectedTester.status}
                    onValueChange={(value) => setSelectedTester({...selectedTester, status: value as any})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                      <SelectItem value="revoked">Revoked</SelectItem>
                      <SelectItem value="converted">Converted to Paid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea
                    placeholder="Any special notes about this tester..."
                    value={selectedTester.notes || ""}
                    onChange={(e) => setSelectedTester({...selectedTester, notes: e.target.value})}
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Max Workflows</Label>
                    <Input
                      type="number"
                      value={selectedTester.max_workflows || ""}
                      onChange={(e) => setSelectedTester({...selectedTester, max_workflows: parseInt(e.target.value) || null})}
                    />
                  </div>
                  <div>
                    <Label>Max Executions/Month</Label>
                    <Input
                      type="number"
                      value={selectedTester.max_executions_per_month || ""}
                      onChange={(e) => setSelectedTester({...selectedTester, max_executions_per_month: parseInt(e.target.value) || null})}
                    />
                  </div>
                </div>
                <div>
                  <Label>Expires At</Label>
                  <Input
                    type="datetime-local"
                    value={selectedTester.expires_at ? new Date(selectedTester.expires_at).toISOString().slice(0, 16) : ""}
                    onChange={(e) => setSelectedTester({...selectedTester, expires_at: e.target.value})}
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setShowEditDialog(false)
                setSelectedTester(null)
              }}>
                Cancel
              </Button>
              <Button onClick={async () => {
                if (!selectedTester) return

                const supabase = createClient()
                const { error } = await supabase
                  .from("beta_testers")
                  .update({
                    status: selectedTester.status,
                    notes: selectedTester.notes,
                    max_workflows: selectedTester.max_workflows,
                    max_executions_per_month: selectedTester.max_executions_per_month,
                    expires_at: selectedTester.expires_at,
                    updated_at: new Date().toISOString()
                  })
                  .eq("id", selectedTester.id)

                if (error) {
                  toast({
                    title: "Error",
                    description: "Failed to update beta tester",
                    variant: "destructive"
                  })
                } else {
                  toast({
                    title: "Success",
                    description: "Beta tester updated successfully"
                  })
                  setShowEditDialog(false)
                  setSelectedTester(null)
                  fetchBetaTesters()
                }
              }}>
                <CheckCircle className="w-4 h-4 mr-2" />
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Process Expirations Dialog */}
        <Dialog open={showMigrationDialog} onOpenChange={setShowMigrationDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Process Expired Beta Testers</DialogTitle>
              <DialogDescription>
                This will check all beta testers and update their status based on expiration dates
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-500 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-yellow-900 dark:text-yellow-100">This action will:</p>
                    <ul className="mt-2 space-y-1 text-yellow-800 dark:text-yellow-200">
                      <li>• Mark expired beta testers as "expired"</li>
                      <li>• Send conversion offers to eligible testers</li>
                      <li>• Update last processed timestamp</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowMigrationDialog(false)}>
                Cancel
              </Button>
              <Button onClick={async () => {
                const supabase = createClient()
                const now = new Date().toISOString()

                // Find all active testers that have expired
                const { data: expiredTesters, error: fetchError } = await supabase
                  .from("beta_testers")
                  .select("*")
                  .eq("status", "active")
                  .lt("expires_at", now)
                  .not("expires_at", "is", null)

                if (fetchError) {
                  toast({
                    title: "Error",
                    description: "Failed to fetch expired testers",
                    variant: "destructive"
                  })
                  return
                }

                if (!expiredTesters || expiredTesters.length === 0) {
                  toast({
                    title: "No Action Needed",
                    description: "No expired beta testers found"
                  })
                  setShowMigrationDialog(false)
                  return
                }

                // Update all expired testers
                const { error: updateError } = await supabase
                  .from("beta_testers")
                  .update({
                    status: "expired",
                    updated_at: now
                  })
                  .eq("status", "active")
                  .lt("expires_at", now)
                  .not("expires_at", "is", null)

                if (updateError) {
                  toast({
                    title: "Error",
                    description: "Failed to update expired testers",
                    variant: "destructive"
                  })
                } else {
                  toast({
                    title: "Success",
                    description: `Processed ${expiredTesters.length} expired beta tester(s)`
                  })
                  setShowMigrationDialog(false)
                  fetchBetaTesters()
                }
              }}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Process Expirations
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Send Offer to All Dialog */}
        <Dialog open={showSendAllDialog} onOpenChange={setShowSendAllDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send Beta Invitations to All</DialogTitle>
              <DialogDescription>
                Send beta invitations to all eligible testers who haven't received one yet
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <div className="flex items-start gap-2">
                  <Mail className="w-5 h-5 text-blue-600 dark:text-blue-500 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-blue-900 dark:text-blue-100">This will send invitations to:</p>
                    <ul className="mt-2 space-y-1 text-blue-800 dark:text-blue-200">
                      <li>• All active beta testers</li>
                      <li>• Who haven't received an offer yet</li>
                      <li>• Total: {betaTesters.filter(t => t.status === 'active' && !t.conversion_offer_sent_at).length} testers</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="text-sm text-muted-foreground">
                <p>Each tester will receive:</p>
                <ul className="mt-1 space-y-1 ml-4">
                  <li>• A personalized invitation email</li>
                  <li>• A unique signup link with their email pre-filled</li>
                  <li>• Automatic beta role assignment upon signup</li>
                </ul>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSendAllDialog(false)}>
                Cancel
              </Button>
              <Button onClick={async () => {
                setShowSendAllDialog(false)
                await handleSendOffersToAll()
              }}>
                <Mail className="w-4 h-4 mr-2" />
                Send All Invitations
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Beta Tester</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this beta tester?
              </DialogDescription>
            </DialogHeader>
            {selectedTester && (
              <div className="space-y-4">
                <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-500 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-red-900 dark:text-red-100">This action cannot be undone!</p>
                      <p className="mt-1 text-red-800 dark:text-red-200">
                        You are about to delete the beta tester:
                      </p>
                      <p className="mt-2 font-mono text-red-900 dark:text-red-100">
                        {selectedTester.email}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="text-sm text-muted-foreground">
                  <p>This will:</p>
                  <ul className="mt-1 space-y-1 ml-4">
                    <li>• Remove the beta tester from the database</li>
                    <li>• Delete all associated activity records</li>
                    <li>• Delete all feedback from this tester</li>
                    <li>• The user account (if created) will remain active</li>
                  </ul>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowDeleteDialog(false)
                  setSelectedTester(null)
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => selectedTester && handleDeleteTester(selectedTester)}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Beta Tester
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  )
}