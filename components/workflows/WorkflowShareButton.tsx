'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Share2, UserPlus, Mail, Copy, Check } from 'lucide-react'
import { LockedFeature } from '@/components/plan-restrictions'
import { usePlanRestrictions } from '@/hooks/use-plan-restrictions'
import { logger } from '@/lib/utils/logger'

interface WorkflowShareButtonProps {
  workflowId: string
  workflowName: string
}

export function WorkflowShareButton({ workflowId, workflowName }: WorkflowShareButtonProps) {
  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [copied, setCopied] = useState(false)
  const { checkFeatureAccess } = usePlanRestrictions()

  const teamAccess = checkFeatureAccess('teamSharing')
  const shareUrl = `${window.location.origin}/workflows/shared/${workflowId}`

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleInvite = () => {
    // TODO: Implement invite logic
    logger.debug('Inviting user to workflow', { email: inviteEmail, workflowId })
    setInviteEmail('')
  }

  // Render the share button wrapped in LockedFeature
  return (
    <>
      <LockedFeature
        feature="teamSharing"
        showLockIcon={false}
        fallbackMessage="Team sharing is available on Team plan"
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShareDialogOpen(true)}
          disabled={!teamAccess.allowed}
          className="gap-2"
        >
          <Share2 className="w-4 h-4" />
          Share
        </Button>
      </LockedFeature>

      {/* Share Dialog - Only opens if user has access */}
      {teamAccess.allowed && (
        <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Share Workflow</DialogTitle>
              <DialogDescription>
                Invite team members to collaborate on "{workflowName}"
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* Invite by Email */}
              <div className="space-y-3">
                <Label htmlFor="email">Invite by Email</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="colleague@company.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Button onClick={handleInvite} disabled={!inviteEmail}>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Invite
                  </Button>
                </div>
              </div>

              {/* Share Link */}
              <div className="space-y-3">
                <Label>Share Link</Label>
                <div className="flex gap-2">
                  <Input
                    value={shareUrl}
                    readOnly
                    className="flex-1"
                  />
                  <Button variant="outline" onClick={handleCopyLink}>
                    {copied ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Anyone with this link can view and edit this workflow
                </p>
              </div>

              {/* Current Team Members */}
              <div className="space-y-3">
                <Label>Team Members</Label>
                <div className="text-sm text-muted-foreground">
                  No team members yet. Invite someone to get started!
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}
