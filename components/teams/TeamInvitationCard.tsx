"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Check, X, Loader2, Users, Calendar, User } from "lucide-react"
import { toast } from "sonner"
import { logger } from '@/lib/utils/logger'

interface TeamInvitation {
  id: string
  team_id: string
  role: string
  status: string
  invited_at: string
  expires_at: string
  team: {
    id: string
    name: string
    description?: string
  }
  inviter: {
    id: string
    email: string
    full_name?: string
  }
}

interface TeamInvitationCardProps {
  invitation: TeamInvitation
  onUpdate?: () => void
}

export function TeamInvitationCard({ invitation, onUpdate }: TeamInvitationCardProps) {
  const router = useRouter()
  const [accepting, setAccepting] = useState(false)
  const [rejecting, setRejecting] = useState(false)

  const handleAccept = async () => {
    try {
      setAccepting(true)
      const response = await fetch(`/api/teams/invitations/${invitation.id}`, {
        method: 'POST'
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to accept invitation')
      }

      const { team } = await response.json()
      toast.success(`Welcome to ${team.name}!`)

      // Redirect to team page
      router.push(`/teams/${team.id}`)
      onUpdate?.()
    } catch (error) {
      logger.error('Error accepting invitation:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to accept invitation')
    } finally {
      setAccepting(false)
    }
  }

  const handleReject = async () => {
    try {
      setRejecting(true)
      const response = await fetch(`/api/teams/invitations/${invitation.id}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to reject invitation')
      }

      toast.success('Invitation rejected')
      onUpdate?.()
    } catch (error) {
      logger.error('Error rejecting invitation:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to reject invitation')
    } finally {
      setRejecting(false)
    }
  }

  const isExpired = new Date(invitation.expires_at) < new Date()
  const isPending = invitation.status === 'pending' && !isExpired

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return <Badge variant="secondary">Admin</Badge>
      case 'manager':
        return <Badge className="bg-purple-500">Manager</Badge>
      case 'member':
        return <Badge variant="outline">Member</Badge>
      default:
        return <Badge variant="outline">Viewer</Badge>
    }
  }

  return (
    <Card className={isPending ? 'border-blue-200 bg-blue-50/30' : ''}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              {invitation.team.name}
            </CardTitle>
            <CardDescription>
              {invitation.team.description || 'Join this team to collaborate'}
            </CardDescription>
          </div>
          {getRoleBadge(invitation.role)}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <User className="h-4 w-4" />
          <span>
            Invited by {invitation.inviter?.full_name || invitation.inviter?.email || 'Unknown'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="h-4 w-4" />
          <span>
            {isExpired ? 'Expired' : `Expires ${new Date(invitation.expires_at).toLocaleDateString()}`}
          </span>
        </div>
        {!isPending && (
          <Badge variant={invitation.status === 'accepted' ? 'default' : 'secondary'}>
            {invitation.status.charAt(0).toUpperCase() + invitation.status.slice(1)}
          </Badge>
        )}
      </CardContent>
      {isPending && (
        <CardFooter className="flex gap-2">
          <Button
            onClick={handleAccept}
            disabled={accepting || rejecting}
            className="flex-1"
          >
            {accepting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Accepting...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Accept
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={handleReject}
            disabled={accepting || rejecting}
            className="flex-1"
          >
            {rejecting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Rejecting...
              </>
            ) : (
              <>
                <X className="h-4 w-4 mr-2" />
                Decline
              </>
            )}
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}
