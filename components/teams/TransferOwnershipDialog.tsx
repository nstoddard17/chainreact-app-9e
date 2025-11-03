"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { UserCog, Loader2, AlertCircle } from "lucide-react"
import { toast } from "sonner"

interface TeamMember {
  id: string
  user_id: string
  role: string
  joined_at: string
  user?: {
    id: string
    email: string
    full_name?: string
    username?: string
  }
}

interface TransferOwnershipDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  teamId: string
  teamName: string
  currentUserId: string
  onSuccess?: () => void
}

export function TransferOwnershipDialog({
  open,
  onOpenChange,
  teamId,
  teamName,
  currentUserId,
  onSuccess,
}: TransferOwnershipDialogProps) {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [selectedMemberId, setSelectedMemberId] = useState<string>("")
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    if (open) {
      fetchTeamMembers()
    }
  }, [open, teamId])

  const fetchTeamMembers = async () => {
    try {
      setFetching(true)
      const response = await fetch(`/api/teams/${teamId}/members`)

      if (!response.ok) {
        throw new Error('Failed to fetch team members')
      }

      const data = await response.json()

      // Filter out current user (owner) from the list
      const eligibleMembers = data.members?.filter(
        (m: TeamMember) => m.user_id !== currentUserId
      ) || []

      setMembers(eligibleMembers)

      if (eligibleMembers.length === 0) {
        toast.error('No other members available to transfer ownership to')
      }
    } catch (error: any) {
      console.error('Error fetching team members:', error)
      toast.error('Failed to load team members')
    } finally {
      setFetching(false)
    }
  }

  const handleTransfer = async () => {
    if (!selectedMemberId) {
      toast.error('Please select a new owner')
      return
    }

    try {
      setLoading(true)

      const response = await fetch(`/api/teams/${teamId}/transfer-ownership`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          new_owner_id: selectedMemberId,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to transfer ownership')
      }

      toast.success('Ownership transferred successfully')
      onOpenChange(false)

      if (onSuccess) {
        onSuccess()
      }
    } catch (error: any) {
      console.error('Error transferring ownership:', error)
      toast.error(error.message || 'Failed to transfer ownership')
    } finally {
      setLoading(false)
    }
  }

  const getDisplayName = (member: TeamMember) => {
    if (member.user?.full_name) return member.user.full_name
    if (member.user?.username) return member.user.username
    if (member.user?.email) return member.user.email
    return 'Unknown User'
  }

  const getInitials = (member: TeamMember) => {
    const name = getDisplayName(member)
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="w-5 h-5" />
            Transfer Ownership
          </DialogTitle>
          <DialogDescription>
            Transfer ownership of <strong>{teamName}</strong> to another team member.
            You will be downgraded to an admin role.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {fetching ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : members.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AlertCircle className="w-12 h-12 text-slate-300 mb-3" />
              <p className="text-sm text-slate-500">
                No other team members available.
                <br />
                Invite members before transferring ownership.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Select New Owner</label>
                <Select
                  value={selectedMemberId}
                  onValueChange={setSelectedMemberId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a team member" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((member) => (
                      <SelectItem key={member.user_id} value={member.user_id}>
                        <div className="flex items-center gap-2">
                          <Avatar className="w-6 h-6">
                            <AvatarFallback className="text-xs">
                              {getInitials(member)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">
                              {getDisplayName(member)}
                            </span>
                            {member.user?.email && (
                              <span className="text-xs text-slate-500">
                                {member.user.email}
                              </span>
                            )}
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-4">
                <div className="flex gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-500 flex-shrink-0 mt-0.5" />
                  <div className="space-y-2 text-sm">
                    <p className="font-medium text-amber-900 dark:text-amber-200">
                      What happens when you transfer ownership:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-amber-800 dark:text-amber-300">
                      <li>The selected member becomes the team owner</li>
                      <li>You will be downgraded to an admin role</li>
                      <li>The new owner will have full control of the team</li>
                      <li>You can be removed from the team by the new owner</li>
                    </ul>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleTransfer}
            disabled={loading || !selectedMemberId || members.length === 0}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Transferring...
              </>
            ) : (
              'Transfer Ownership'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
