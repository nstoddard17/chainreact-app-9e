"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Users } from "lucide-react"
import { toast } from "sonner"

interface CreateTeamDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationId?: string
}

export function CreateTeamDialog({ open, onOpenChange, organizationId }: CreateTeamDialogProps) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const [teamName, setTeamName] = useState("")
  const [teamDescription, setTeamDescription] = useState("")

  const handleCreateTeam = async () => {
    if (!teamName.trim()) {
      toast.error('Team name is required')
      return
    }

    try {
      setCreating(true)
      let targetOrgId = organizationId

      // Create team body
      const teamBody: any = {
        name: teamName.trim(),
        description: teamDescription.trim() || null,
      }

      // Only add organization_id if we're creating within an organization
      if (targetOrgId) {
        teamBody.organization_id = targetOrgId
      }

      // Create the team (standalone if no organization_id)
      const teamResponse = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(teamBody),
      })

      if (!teamResponse.ok) {
        const error = await teamResponse.json()
        throw new Error(error.error || 'Failed to create team')
      }

      const { team } = await teamResponse.json()
      toast.success(`Team "${teamName}" created successfully!`)

      // Reset form and close dialog
      setTeamName("")
      setTeamDescription("")
      onOpenChange(false)

      // Navigate to teams page or team settings
      router.push('/teams')
      router.refresh()
    } catch (error: any) {
      console.error('Error creating team:', error)
      toast.error(error.message || 'Failed to create team')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Create Team
          </DialogTitle>
          <DialogDescription>
            {organizationId
              ? "Create a new team in your organization"
              : "Create a team to collaborate with others"
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="team-name">Team Name *</Label>
            <Input
              id="team-name"
              placeholder="Engineering Team"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateTeam()}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="team-description">Team Description</Label>
            <Textarea
              id="team-description"
              placeholder="What does this team work on?"
              value={teamDescription}
              onChange={(e) => setTeamDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button onClick={handleCreateTeam} disabled={creating}>
            {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Create Team
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
