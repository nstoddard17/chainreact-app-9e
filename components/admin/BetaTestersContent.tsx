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
import AppLayout from "@/components/layout/AppLayout"
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
  const [selectedTester, setSelectedTester] = useState<BetaTester | null>(null)
  const { toast } = useToast()

  // Form states
  const [newTesterEmail, setNewTesterEmail] = useState("")
  const [newTesterNotes, setNewTesterNotes] = useState("")
  const [newTesterExpiry, setNewTesterExpiry] = useState("90")
  const [newTesterWorkflows, setNewTesterWorkflows] = useState("50")
  const [newTesterExecutions, setNewTesterExecutions] = useState("5000")

  useEffect(() => {
    fetchBetaTesters()
    fetchActivities()
    fetchFeedback()
  }, [])

  const fetchBetaTesters = async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from("beta_testers")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching beta testers:", error)
      toast({
        title: "Error",
        description: "Failed to fetch beta testers",
        variant: "destructive"
      })
    } else {
      setBetaTesters(data || [])
    }
    setLoading(false)
  }

  const fetchActivities = async () => {
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
    }
  }

  const fetchFeedback = async () => {
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
    }
  }

  const handleAddBetaTester = async () => {
    const supabase = createClient()

    const expiryDays = parseInt(newTesterExpiry)
    const expiresAt = expiryDays > 0
      ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString()
      : null

    const { data: userData } = await supabase.auth.getUser()

    const { error } = await supabase
      .from("beta_testers")
      .insert({
        email: newTesterEmail,
        notes: newTesterNotes,
        expires_at: expiresAt,
        max_workflows: parseInt(newTesterWorkflows) || null,
        max_executions_per_month: parseInt(newTesterExecutions) || null,
        added_by: userData?.user?.id
      })

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      })
    } else {
      toast({
        title: "Success",
        description: "Beta tester added successfully"
      })
      setShowAddDialog(false)
      setNewTesterEmail("")
      setNewTesterNotes("")
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

  const handleSendConversionOffer = async (tester: BetaTester) => {
    // This would integrate with your email service
    const supabase = createClient()
    const { error } = await supabase
      .from("beta_testers")
      .update({
        conversion_offer_sent_at: new Date().toISOString()
      })
      .eq("id", tester.id)

    if (!error) {
      toast({
        title: "Offer Sent",
        description: `Conversion offer sent to ${tester.email}`,
      })
      fetchBetaTesters()
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
    <AppLayout title="Beta Testers Management">
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Testers</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
                <Users className="w-8 h-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active</p>
                  <p className="text-2xl font-bold text-green-600">{stats.active}</p>
                </div>
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Expired</p>
                  <p className="text-2xl font-bold text-yellow-600">{stats.expired}</p>
                </div>
                <Clock className="w-8 h-8 text-yellow-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Converted</p>
                  <p className="text-2xl font-bold text-blue-600">{stats.converted}</p>
                </div>
                <TrendingUp className="w-8 h-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Feedback</p>
                  <p className="text-2xl font-bold">{stats.totalFeedback}</p>
                </div>
                <MessageSquare className="w-8 h-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Weekly Active</p>
                  <p className="text-2xl font-bold">{stats.recentActivity}</p>
                </div>
                <Activity className="w-8 h-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between items-center">
          <div className="flex gap-2">
            <Button onClick={() => setShowAddDialog(true)}>
              <UserPlus className="w-4 h-4 mr-2" />
              Add Beta Tester
            </Button>
            <Button variant="outline" onClick={() => setShowMigrationDialog(true)}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Process Expirations
            </Button>
            <Button variant="outline" onClick={handleExportData}>
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="testers">Beta Testers</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="feedback">Feedback</TabsTrigger>
          </TabsList>

          <TabsContent value="testers" className="space-y-4">
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
                <CardContent>
                  <div className="space-y-4">
                    {betaTesters.map((tester) => (
                      <div key={tester.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex justify-between items-start">
                          <div className="space-y-2">
                            <div className="flex items-center gap-3">
                              <h3 className="font-semibold text-lg">{tester.email}</h3>
                              {getStatusBadge(tester.status)}
                              {tester.last_active_at && (
                                <span className="text-sm text-muted-foreground">
                                  Last active: {format(new Date(tester.last_active_at), "MMM d, yyyy")}
                                </span>
                              )}
                            </div>
                            {tester.notes && (
                              <p className="text-sm text-muted-foreground">{tester.notes}</p>
                            )}
                            <div className="flex gap-4 text-sm">
                              <span>
                                <strong>Workflows:</strong> {tester.total_workflows_created}/{tester.max_workflows || 50}
                              </span>
                              <span>
                                <strong>Executions:</strong> {tester.total_executions}/{tester.max_executions_per_month || 5000}
                              </span>
                              <span>
                                <strong>Feedback:</strong> {tester.feedback_count}
                              </span>
                            </div>
                            <div className="flex gap-4 text-sm text-muted-foreground">
                              <span>Added: {format(new Date(tester.added_at), "MMM d, yyyy")}</span>
                              {tester.expires_at && (
                                <span>Expires: {format(new Date(tester.expires_at), "MMM d, yyyy")}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {tester.status === 'active' && !tester.conversion_offer_sent_at && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleSendConversionOffer(tester)}
                              >
                                <Send className="w-4 h-4 mr-1" />
                                Send Offer
                              </Button>
                            )}
                            {tester.status === 'active' && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleUpdateStatus(tester.id, 'revoked')}
                              >
                                <XCircle className="w-4 h-4 mr-1" />
                                Revoke
                              </Button>
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
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="activity" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Track beta tester engagement</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {activities.map((activity) => (
                    <div key={activity.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <div className="flex items-center gap-3">
                        <Activity className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm">
                            <strong>{activity.user?.email}</strong> {activity.activity_type.replace('_', ' ')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(activity.created_at), "MMM d, yyyy h:mm a")}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="feedback" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Beta Feedback</CardTitle>
                <CardDescription>Feedback submitted by beta testers</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {feedback.map((item) => (
                    <div key={item.id} className="border rounded-lg p-4 space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2">
                            <Badge variant={
                              item.feedback_type === 'bug' ? 'destructive' :
                              item.feedback_type === 'feature_request' ? 'default' :
                              'secondary'
                            }>
                              {item.feedback_type.replace('_', ' ')}
                            </Badge>
                            {item.rating && (
                              <div className="flex gap-1">
                                {[...Array(5)].map((_, i) => (
                                  <span key={i} className={i < item.rating ? "text-yellow-500" : "text-gray-300"}>
                                    ★
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <h4 className="font-semibold mt-2">{item.subject}</h4>
                          <p className="text-sm text-muted-foreground mt-1">{item.message}</p>
                          <p className="text-xs text-muted-foreground mt-2">
                            {item.user?.email} • {format(new Date(item.created_at), "MMM d, yyyy")}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
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
                <Label>Email Address</Label>
                <Input
                  type="email"
                  placeholder="john@example.com"
                  value={newTesterEmail}
                  onChange={(e) => setNewTesterEmail(e.target.value)}
                />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea
                  placeholder="Any special notes about this tester..."
                  value={newTesterNotes}
                  onChange={(e) => setNewTesterNotes(e.target.value)}
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
                    value={newTesterWorkflows}
                    onChange={(e) => setNewTesterWorkflows(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Max Executions/Month</Label>
                  <Input
                    type="number"
                    value={newTesterExecutions}
                    onChange={(e) => setNewTesterExecutions(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddBetaTester}>
                <UserPlus className="w-4 h-4 mr-2" />
                Add Beta Tester
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  )
}