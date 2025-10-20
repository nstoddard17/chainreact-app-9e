"use client"

import React from "react"
import { Mail, Paperclip, User, Calendar, ExternalLink } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface Email {
  id?: string
  subject: string
  from: string
  to: string | string[]
  cc?: string | string[]
  bcc?: string | string[]
  date: string
  snippet?: string
  body?: string
  bodyPreview?: string
  hasAttachments?: boolean
  attachments?: Array<{
    id?: string
    filename: string
    mimeType?: string
    size?: number
  }>
  labels?: string[]
  isRead?: boolean
  isStarred?: boolean
  webLink?: string
}

interface EmailRendererProps {
  emails: Email[]
  maxDisplay?: number
  showBody?: boolean
  className?: string
}

export function EmailRenderer({ emails, maxDisplay = 10, showBody = false, className }: EmailRendererProps) {
  const displayEmails = emails.slice(0, maxDisplay)
  const hasMore = emails.length > maxDisplay

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
    })
  }

  const formatRecipients = (recipients: string | string[]) => {
    const arr = Array.isArray(recipients) ? recipients : [recipients]
    if (arr.length === 0) return ''
    if (arr.length === 1) return arr[0]
    if (arr.length === 2) return `${arr[0]}, ${arr[1]}`
    return `${arr[0]}, ${arr[1]} +${arr.length - 2} more`
  }

  const truncateText = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text
    return text.substring(0, maxLength) + '...'
  }

  if (emails.length === 0) {
    return (
      <div className={cn("mt-3 p-4 bg-muted/50 rounded-lg border text-center", className)}>
        <Mail className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No emails found</p>
      </div>
    )
  }

  return (
    <div className={cn("mt-3 space-y-3", className)}>
      <div className="flex items-center gap-2 mb-2">
        <Mail className="w-5 h-5 text-primary" />
        <span className="font-medium text-lg">Email Messages</span>
        <Badge variant="secondary" className="ml-auto">{emails.length}</Badge>
      </div>

      <div className="space-y-2">
        {displayEmails.map((email, index) => (
          <Card
            key={email.id || index}
            className={cn(
              "p-4 hover:bg-muted/50 transition-colors",
              !email.isRead && "border-l-4 border-l-blue-500"
            )}
          >
            {/* Header */}
            <div className="flex items-start gap-3 mb-2">
              <div className="flex-shrink-0 w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                <User className="w-4 h-4 text-primary" />
              </div>

              <div className="flex-1 min-w-0">
                {/* Subject */}
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h4 className={cn(
                    "font-semibold text-sm line-clamp-1",
                    !email.isRead && "text-primary"
                  )}>
                    {email.subject || "(No Subject)"}
                  </h4>
                  <span className="flex-shrink-0 text-xs text-muted-foreground">
                    {formatDate(email.date)}
                  </span>
                </div>

                {/* From */}
                <div className="text-xs text-muted-foreground mb-1">
                  <span className="font-medium">From:</span> {email.from}
                </div>

                {/* To */}
                <div className="text-xs text-muted-foreground mb-2">
                  <span className="font-medium">To:</span> {formatRecipients(email.to)}
                </div>

                {/* CC/BCC */}
                {(email.cc || email.bcc) && (
                  <div className="text-xs text-muted-foreground mb-2 flex gap-3">
                    {email.cc && (
                      <span>
                        <span className="font-medium">Cc:</span> {formatRecipients(email.cc)}
                      </span>
                    )}
                    {email.bcc && (
                      <span>
                        <span className="font-medium">Bcc:</span> {formatRecipients(email.bcc)}
                      </span>
                    )}
                  </div>
                )}

                {/* Body Preview */}
                {(showBody && (email.body || email.snippet || email.bodyPreview)) && (
                  <div className="mt-2 p-2 bg-muted/30 rounded text-xs text-muted-foreground">
                    {truncateText(email.body || email.snippet || email.bodyPreview || "", 200)}
                  </div>
                )}

                {/* Footer */}
                <div className="flex items-center gap-3 mt-2">
                  {/* Attachments */}
                  {email.hasAttachments && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Paperclip className="w-3 h-3" />
                      <span>
                        {email.attachments?.length || "Has"} attachment{email.attachments?.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  )}

                  {/* Labels */}
                  {email.labels && email.labels.length > 0 && (
                    <div className="flex items-center gap-1">
                      {email.labels.slice(0, 3).map((label, i) => (
                        <Badge key={i} variant="outline" className="text-xs px-1.5 py-0">
                          {label}
                        </Badge>
                      ))}
                      {email.labels.length > 3 && (
                        <span className="text-xs text-muted-foreground">
                          +{email.labels.length - 3} more
                        </span>
                      )}
                    </div>
                  )}

                  {/* Web Link */}
                  {email.webLink && (
                    <a
                      href={email.webLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      <span>Open</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>

                {/* Attachments List */}
                {email.attachments && email.attachments.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {email.attachments.map((attachment, i) => (
                      <div
                        key={attachment.id || i}
                        className="flex items-center gap-2 p-1.5 bg-muted/30 rounded text-xs"
                      >
                        <Paperclip className="w-3 h-3 text-muted-foreground" />
                        <span className="flex-1 truncate">{attachment.filename}</span>
                        {attachment.size && (
                          <span className="text-muted-foreground">
                            {(attachment.size / 1024).toFixed(1)} KB
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {hasMore && (
        <div className="text-center py-2">
          <p className="text-sm text-muted-foreground">
            Showing {maxDisplay} of {emails.length} emails
          </p>
        </div>
      )}
    </div>
  )
}
