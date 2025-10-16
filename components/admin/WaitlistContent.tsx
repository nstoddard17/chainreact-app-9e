"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { useToast } from "@/hooks/use-toast"
import {
  Users,
  Clock,
  TrendingUp,
  Mail,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Download,
  Send,
  Trash2,
  Edit,
  ListChecks,
  Sparkles,
  Bot
} from "lucide-react"
import { format } from "date-fns"
import { logger } from '@/lib/utils/logger'

interface WaitlistMember {
  id: string
  name: string
  email: string
  selected_integrations: string[]
  custom_integrations: string[]
  wants_ai_assistant: boolean
  wants_ai_actions: boolean
  ai_actions_importance: 'not-important' | 'somewhat-important' | 'very-important' | 'critical'
  status: 'pending' | 'invited' | 'converted'
  invitation_sent_at: string | null
  signup_token: string | null
  converted_at: string | null
  welcome_email_sent: boolean
  created_at: string
  updated_at: string
}

export default function WaitlistContent() {
  const [waitlistMembers, setWaitlistMembers] = useState<WaitlistMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showSendAllDialog, setShowSendAllDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showMassInviteDialog, setShowMassInviteDialog] = useState(false)
  const [selectedMember, setSelectedMember] = useState<WaitlistMember | null>(null)
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set())
  const [sendingInvite, setSendingInvite] = useState<string | null>(null)
  const [sendingMassInvites, setSendingMassInvites] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    fetchWaitlistMembers()
  }, [])

  const fetchWaitlistMembers = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/admin/waitlist/list", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        }
      })

      const result = await response.json()

      if (!response.ok) {
        logger.error("Error fetching waitlist members:", result.error)
        if (response.status !== 404) {
          toast({
            title: "Error",
            description: result.error || "Failed to fetch waitlist members",
            variant: "destructive"
          })
        }
        setWaitlistMembers([])
      } else {
        logger.debug(`Fetched ${result.data?.length || 0} waitlist members`)
        setWaitlistMembers(result.data || [])
      }
    } catch (err) {
      logger.error("Unexpected error fetching waitlist members:", err)
      setWaitlistMembers([])
    } finally {
      setLoading(false)
    }
  }

  const handleSendInvite = async (member: WaitlistMember, isResend: boolean = false) => {
    setSendingInvite(member.id)
    try {
      const response = await fetch("/api/admin/waitlist/send-invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          memberIds: [member.id],
          sendToAll: false
        })
      })

      const data = await response.json()

      if (response.ok) {
        toast({
          title: isResend ? "Invitation Resent" : "Invitation Sent",
          description: `Invitation ${isResend ? 'resent' : 'sent'} to ${member.email}`,
        })
        await new Promise(resolve => setTimeout(resolve, 500))
        await fetchWaitlistMembers()
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to send invitation",
          variant: "destructive"
        })
      }
    } catch (error) {
      logger.error("Error sending invitation:", error)
      toast({
        title: "Error",
        description: "Failed to send invitation",
        variant: "destructive"
      })
    } finally {
      setSendingInvite(null)
    }
  }

  const handleDeleteMember = async (member: WaitlistMember) => {
    try {
      const response = await fetch(`/api/admin/waitlist/delete?id=${member.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        }
      })

      const result = await response.json()

      if (!response.ok) {
        toast({
          title: "Error",
          description: result.error || "Failed to delete waitlist member",
          variant: "destructive"
        })
      } else {
        setShowDeleteDialog(false)
        setSelectedMember(null)
        setWaitlistMembers(prev => prev.filter(m => m.id !== member.id))
        toast({
          title: "Success",
          description: result.message || `Waitlist member ${member.email} has been deleted`,
        })
        await fetchWaitlistMembers()
      }
    } catch (error) {
      logger.error("Error deleting waitlist member:", error)
      toast({
        title: "Error",
        description: "Failed to delete waitlist member. Please try again.",
        variant: "destructive"
      })
    }
  }

  const handleSendInvitesToAll = async () => {
    try {
      const eligibleMembers = waitlistMembers.filter(m => m.status === 'pending' && !m.invitation_sent_at)

      if (eligibleMembers.length === 0) {
        toast({
          title: "No Eligible Members",
          description: "All pending members have already received invitations",
          variant: "default"
        })
        return
      }

      const response = await fetch("/api/admin/waitlist/send-invite", {
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
          title: "Invitations Sent",
          description: data.message || `Sent ${data.count} invitations`,
        })
        await new Promise(resolve => setTimeout(resolve, 500))
        await fetchWaitlistMembers()
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to send invitations",
          variant: "destructive"
        })
      }
    } catch (error) {
      logger.error("Error sending invitations to all:", error)
      toast({
        title: "Error",
        description: "Failed to send invitations",
        variant: "destructive"
      })
    }
  }

  const handleSendMassInvites = async () => {
    setSendingMassInvites(true)
    try {
      const memberIds = Array.from(selectedMembers)

      const response = await fetch("/api/admin/waitlist/send-invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          memberIds,
          sendToAll: false
        })
      })

      const data = await response.json()

      if (response.ok) {
        toast({
          title: "Invitations Sent",
          description: `Successfully sent ${memberIds.length} invitation${memberIds.length === 1 ? '' : 's'}`,
        })
        setSelectedMembers(new Set())
        setShowMassInviteDialog(false)
        await new Promise(resolve => setTimeout(resolve, 500))
        await fetchWaitlistMembers()
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to send invitations",
          variant: "destructive"
        })
      }
    } catch (error) {
      logger.error("Error sending mass invitations:", error)
      toast({
        title: "Error",
        description: "Failed to send invitations",
        variant: "destructive"
      })
    } finally {
      setSendingMassInvites(false)
    }
  }

  const toggleSelectAll = () => {
    if (selectedMembers.size === waitlistMembers.filter(m => m.status === 'pending').length) {
      setSelectedMembers(new Set())
    } else {
      const pendingIds = waitlistMembers
        .filter(m => m.status === 'pending')
        .map(m => m.id)
      setSelectedMembers(new Set(pendingIds))
    }
  }

  const toggleSelectMember = (memberId: string) => {
    const newSelected = new Set(selectedMembers)
    if (newSelected.has(memberId)) {
      newSelected.delete(memberId)
    } else {
      newSelected.add(memberId)
    }
    setSelectedMembers(newSelected)
  }

  const handleExportData = () => {
    const csvContent = [
      ["Name", "Email", "Status", "Integrations", "AI Assistant", "AI Actions", "AI Actions Importance", "Created", "Invited"],
      ...waitlistMembers.map(m => [
        m.name,
        m.email,
        m.status,
        [...m.selected_integrations, ...m.custom_integrations].join("; "),
        m.wants_ai_assistant ? "Yes" : "No",
        m.wants_ai_actions ? "Yes" : "No",
        m.ai_actions_importance,
        format(new Date(m.created_at), "yyyy-MM-dd"),
        m.invitation_sent_at ? format(new Date(m.invitation_sent_at), "yyyy-MM-dd") : "Not sent"
      ])
    ].map(row => row.join(",")).join("\n")

    const blob = new Blob([csvContent], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `waitlist-${format(new Date(), "yyyy-MM-dd")}.csv`
    a.click()
  }

  const stats = {
    total: waitlistMembers.length,
    pending: waitlistMembers.filter(m => m.status === 'pending').length,
    invited: waitlistMembers.filter(m => m.status === 'invited').length,
    converted: waitlistMembers.filter(m => m.status === 'converted').length,
    aiAssistantInterest: waitlistMembers.filter(m => m.wants_ai_assistant).length,
    aiActionsInterest: waitlistMembers.filter(m => m.wants_ai_actions).length,
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { color: "default" | "secondary" | "destructive" | "outline", icon: any }> = {
      pending: { color: "secondary", icon: Clock },
      invited: { color: "default", icon: Mail },
      converted: { color: "default", icon: TrendingUp },
    }
    const variant = variants[status] || variants.pending
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
                <p className="text-xs sm:text-sm text-muted-foreground truncate">Total Members</p>
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
                <p className="text-xs sm:text-sm text-muted-foreground truncate">Pending</p>
                <p className="text-xl sm:text-2xl font-bold text-yellow-600">{stats.pending}</p>
              </div>
              <Clock className="w-6 h-6 sm:w-8 sm:h-8 text-yellow-600 flex-shrink-0" />
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground truncate">Invited</p>
                <p className="text-xl sm:text-2xl font-bold text-blue-600">{stats.invited}</p>
              </div>
              <Mail className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600 flex-shrink-0" />
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground truncate">Converted</p>
                <p className="text-xl sm:text-2xl font-bold text-green-600">{stats.converted}</p>
              </div>
              <TrendingUp className="w-6 h-6 sm:w-8 sm:h-8 text-green-600 flex-shrink-0" />
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground truncate">AI Assistant</p>
                <p className="text-xl sm:text-2xl font-bold text-purple-600">{stats.aiAssistantInterest}</p>
              </div>
              <Sparkles className="w-6 h-6 sm:w-8 sm:h-8 text-purple-600 flex-shrink-0" />
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground truncate">AI Actions</p>
                <p className="text-xl sm:text-2xl font-bold text-indigo-600">{stats.aiActionsInterest}</p>
              </div>
              <Bot className="w-6 h-6 sm:w-8 sm:h-8 text-indigo-600 flex-shrink-0" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        {selectedMembers.size > 0 && (
          <Button
            onClick={() => setShowMassInviteDialog(true)}
            className="flex-shrink-0"
          >
            <Send className="w-4 h-4 mr-2" />
            <span>Send Invites ({selectedMembers.size})</span>
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => setShowSendAllDialog(true)}
          className="flex-shrink-0"
          disabled={waitlistMembers.filter(m => m.status === 'pending' && !m.invitation_sent_at).length === 0}
        >
          <Mail className="w-4 h-4 mr-2" />
          <span className="hidden sm:inline">Send to All Pending</span>
          <span className="sm:hidden">Send All</span>
        </Button>
        <Button variant="outline" onClick={handleExportData} className="flex-shrink-0">
          <Download className="w-4 h-4 mr-2" />
          <span className="hidden sm:inline">Export CSV</span>
          <span className="sm:hidden">Export</span>
        </Button>
        <Button variant="outline" onClick={fetchWaitlistMembers} className="flex-shrink-0">
          <RefreshCw className="w-4 h-4 mr-2" />
          <span className="hidden sm:inline">Refresh</span>
          <span className="sm:hidden">Refresh</span>
        </Button>
      </div>

      {/* Waitlist Members Table */}
      {loading ? (
        <Card>
          <CardContent className="p-8 text-center">
            <RefreshCw className="w-8 h-8 mx-auto mb-4 animate-spin" />
            <p>Loading waitlist members...</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Waitlist Members</CardTitle>
            <CardDescription>Manage waitlist signups and send invitations</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="text-left p-4 font-medium w-12">
                      <Checkbox
                        checked={selectedMembers.size === waitlistMembers.filter(m => m.status === 'pending').length && waitlistMembers.filter(m => m.status === 'pending').length > 0}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all pending members"
                      />
                    </th>
                    <th className="text-left p-4 font-medium">Name</th>
                    <th className="text-left p-4 font-medium">Email</th>
                    <th className="text-left p-4 font-medium">Status</th>
                    <th className="text-left p-4 font-medium">AI Preferences</th>
                    <th className="text-left p-4 font-medium">Integrations</th>
                    <th className="text-left p-4 font-medium">Created</th>
                    <th className="text-right p-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {waitlistMembers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="text-center p-8 text-muted-foreground">
                        No waitlist members found. They will appear here when users sign up on the waitlist page.
                      </td>
                    </tr>
                  ) : (
                    waitlistMembers.map((member) => {
                      const isPending = member.status === 'pending'
                      const totalIntegrations = member.selected_integrations.length + member.custom_integrations.length
                      return (
                        <tr key={member.id} className="border-b hover:bg-muted/50 transition-colors">
                          <td className="p-4">
                            <Checkbox
                              checked={selectedMembers.has(member.id)}
                              onCheckedChange={() => toggleSelectMember(member.id)}
                              disabled={!isPending}
                              aria-label={`Select ${member.name}`}
                            />
                          </td>
                          <td className="p-4">
                            <p className="font-medium">{member.name}</p>
                          </td>
                          <td className="p-4">
                            <p className="text-sm">{member.email}</p>
                          </td>
                          <td className="p-4">
                            {getStatusBadge(member.status)}
                          </td>
                          <td className="p-4">
                            <div className="text-xs space-y-1">
                              {member.wants_ai_assistant && (
                                <Badge variant="outline" className="text-xs">
                                  <Sparkles className="w-3 h-3 mr-1" />
                                  AI Assistant
                                </Badge>
                              )}
                              {member.wants_ai_actions && (
                                <div className="flex flex-col gap-1">
                                  <Badge variant="outline" className="text-xs">
                                    <Bot className="w-3 h-3 mr-1" />
                                    AI Actions
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    ({member.ai_actions_importance.replace(/-/g, ' ')})
                                  </span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-1">
                              <ListChecks className="w-4 h-4 text-muted-foreground" />
                              <span className="text-sm">{totalIntegrations} selected</span>
                            </div>
                          </td>
                          <td className="p-4 text-sm">
                            {format(new Date(member.created_at), "MMM d, yyyy")}
                          </td>
                          <td className="p-4">
                            <div className="flex gap-1 justify-end flex-wrap">
                              {member.status === 'pending' && (
                                member.invitation_sent_at ? (
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
                                      onClick={() => handleSendInvite(member, true)}
                                      disabled={sendingInvite === member.id}
                                    >
                                      {sendingInvite === member.id ? (
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
                                    onClick={() => handleSendInvite(member, false)}
                                    disabled={sendingInvite === member.id}
                                  >
                                    {sendingInvite === member.id ? (
                                      <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                                    ) : (
                                      <Mail className="w-4 h-4 mr-1" />
                                    )}
                                    Send
                                  </Button>
                                )
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedMember(member)
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
                                  setSelectedMember(member)
                                  setShowDeleteDialog(true)
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Edit Member Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Waitlist Member</DialogTitle>
            <DialogDescription>
              Update waitlist member information and preferences
            </DialogDescription>
          </DialogHeader>
          {selectedMember && (
            <div className="space-y-4">
              <div>
                <Label>Name</Label>
                <Input
                  type="text"
                  value={selectedMember.name}
                  onChange={(e) => setSelectedMember({...selectedMember, name: e.target.value})}
                />
              </div>
              <div>
                <Label>Email Address</Label>
                <Input
                  type="email"
                  value={selectedMember.email}
                  onChange={(e) => setSelectedMember({...selectedMember, email: e.target.value})}
                />
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  value={selectedMember.status}
                  onValueChange={(value) => setSelectedMember({...selectedMember, status: value as any})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="invited">Invited</SelectItem>
                    <SelectItem value="converted">Converted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="border-t pt-4">
                <h4 className="text-sm font-semibold mb-3">Integration Preferences</h4>
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs">Selected Integrations</Label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedMember.selected_integrations.map((integration, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs">
                          {integration}
                        </Badge>
                      ))}
                      {selectedMember.selected_integrations.length === 0 && (
                        <span className="text-xs text-muted-foreground">None selected</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Custom Integrations</Label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedMember.custom_integrations.map((integration, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {integration}
                        </Badge>
                      ))}
                      {selectedMember.custom_integrations.length === 0 && (
                        <span className="text-xs text-muted-foreground">None added</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="border-t pt-4">
                <h4 className="text-sm font-semibold mb-3">AI Preferences</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="ai-assistant">Wants AI Assistant</Label>
                    <Checkbox
                      id="ai-assistant"
                      checked={selectedMember.wants_ai_assistant}
                      onCheckedChange={(checked) => setSelectedMember({...selectedMember, wants_ai_assistant: checked as boolean})}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="ai-actions">Wants AI Actions</Label>
                    <Checkbox
                      id="ai-actions"
                      checked={selectedMember.wants_ai_actions}
                      onCheckedChange={(checked) => setSelectedMember({...selectedMember, wants_ai_actions: checked as boolean})}
                    />
                  </div>
                  {selectedMember.wants_ai_actions && (
                    <div>
                      <Label className="text-xs">AI Actions Importance</Label>
                      <Select
                        value={selectedMember.ai_actions_importance}
                        onValueChange={(value) => setSelectedMember({...selectedMember, ai_actions_importance: value as any})}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="not-important">Not Important</SelectItem>
                          <SelectItem value="somewhat-important">Somewhat Important</SelectItem>
                          <SelectItem value="very-important">Very Important</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowEditDialog(false)
              setSelectedMember(null)
            }}>
              Cancel
            </Button>
            <Button onClick={async () => {
              if (!selectedMember) return

              try {
                const response = await fetch("/api/admin/waitlist/update", {
                  method: "PATCH",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    id: selectedMember.id,
                    name: selectedMember.name,
                    email: selectedMember.email,
                    status: selectedMember.status,
                    wants_ai_assistant: selectedMember.wants_ai_assistant,
                    wants_ai_actions: selectedMember.wants_ai_actions,
                    ai_actions_importance: selectedMember.ai_actions_importance
                  })
                })

                const result = await response.json()

                if (!response.ok) {
                  toast({
                    title: "Error",
                    description: result.error || "Failed to update waitlist member",
                    variant: "destructive"
                  })
                } else {
                  toast({
                    title: "Success",
                    description: result.message || "Waitlist member updated successfully"
                  })
                  setShowEditDialog(false)
                  setSelectedMember(null)
                  fetchWaitlistMembers()
                }
              } catch (error) {
                logger.error("Error updating waitlist member:", error)
                toast({
                  title: "Error",
                  description: "Failed to update waitlist member. Please try again.",
                  variant: "destructive"
                })
              }
            }}>
              <CheckCircle className="w-4 h-4 mr-2" />
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Invitations to All Dialog */}
      <Dialog open={showSendAllDialog} onOpenChange={setShowSendAllDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Invitations to All Pending</DialogTitle>
            <DialogDescription>
              Send invitations to all pending members who haven't received one yet
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="flex items-start gap-2">
                <Mail className="w-5 h-5 text-blue-600 dark:text-blue-500 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-blue-900 dark:text-blue-100">This will send invitations to:</p>
                  <ul className="mt-2 space-y-1 text-blue-800 dark:text-blue-200">
                    <li>• All pending waitlist members</li>
                    <li>• Who haven't received an invitation yet</li>
                    <li>• Total: {waitlistMembers.filter(m => m.status === 'pending' && !m.invitation_sent_at).length} members</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="text-sm text-muted-foreground">
              <p>Each member will receive:</p>
              <ul className="mt-1 space-y-1 ml-4">
                <li>• A personalized invitation email</li>
                <li>• A unique signup link to create their account</li>
                <li>• Instant access upon signup</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSendAllDialog(false)}>
              Cancel
            </Button>
            <Button onClick={async () => {
              setShowSendAllDialog(false)
              await handleSendInvitesToAll()
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
            <DialogTitle>Delete Waitlist Member</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this waitlist member?
            </DialogDescription>
          </DialogHeader>
          {selectedMember && (
            <div className="space-y-4">
              <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-500 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-red-900 dark:text-red-100">This action cannot be undone!</p>
                    <p className="mt-1 text-red-800 dark:text-red-200">
                      You are about to delete:
                    </p>
                    <p className="mt-2 font-mono text-red-900 dark:text-red-100">
                      {selectedMember.name} ({selectedMember.email})
                    </p>
                  </div>
                </div>
              </div>

              <div className="text-sm text-muted-foreground">
                <p>This will remove the waitlist member from the database permanently.</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowDeleteDialog(false)
                setSelectedMember(null)
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedMember && handleDeleteMember(selectedMember)}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mass Invite Dialog */}
      <Dialog open={showMassInviteDialog} onOpenChange={setShowMassInviteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Invitations</DialogTitle>
            <DialogDescription>
              Send invitations to selected waitlist members
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <div className="flex items-start gap-2">
                <Mail className="w-5 h-5 text-blue-600 dark:text-blue-500 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-blue-900 dark:text-blue-100">Ready to send invitations to:</p>
                  <ul className="mt-2 space-y-1 text-blue-800 dark:text-blue-200">
                    <li>• {selectedMembers.size} selected member{selectedMembers.size === 1 ? '' : 's'}</li>
                    <li>• All will receive personalized invitation emails</li>
                    <li>• Each gets a unique signup link</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="max-h-48 overflow-y-auto border rounded-lg p-3">
              <div className="text-sm space-y-1">
                {Array.from(selectedMembers).map(memberId => {
                  const member = waitlistMembers.find(m => m.id === memberId)
                  return member ? (
                    <div key={memberId} className="flex items-center gap-2">
                      <CheckCircle className="w-3 h-3 text-green-600" />
                      <span>{member.name} ({member.email})</span>
                    </div>
                  ) : null
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMassInviteDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSendMassInvites}
              disabled={sendingMassInvites}
            >
              {sendingMassInvites ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Send {selectedMembers.size} Invitation{selectedMembers.size === 1 ? '' : 's'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
