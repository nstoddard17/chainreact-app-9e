import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MessageSquare, User, Send, Clock } from 'lucide-react'

interface FacebookMessagePreview {
  recipient: string
  conversationId?: string
  message: string
  quickReplies: string[]
  typingIndicator: boolean
}

interface FacebookMessagePreviewProps {
  preview: FacebookMessagePreview
}

export function FacebookMessagePreview({ preview }: FacebookMessagePreviewProps) {
  if (!preview) {
    return (
      <div className="text-sm text-muted-foreground bg-muted/30 p-4 rounded border flex flex-col items-center justify-center">
        <div className="mb-2">
          <MessageSquare className="h-8 w-8 text-muted-foreground" />
        </div>
        <p>No message preview available</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            Message Preview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Recipient */}
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">To:</span>
            <Badge variant="outline" className="text-xs">
              {preview.recipient}
            </Badge>
            {preview.conversationId && (
              <span className="text-xs text-muted-foreground">
                (Conversation: {preview.conversationId})
              </span>
            )}
          </div>

          {/* Message */}
          <div className="bg-muted/30 p-3 rounded-lg">
            <p className="text-sm whitespace-pre-wrap">{preview.message}</p>
          </div>

          {/* Quick Replies */}
          {preview.quickReplies && preview.quickReplies.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Quick Reply Options:</p>
              <div className="flex flex-wrap gap-2">
                {preview.quickReplies.map((reply, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    {reply}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Settings */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Send className="h-3 w-3" />
              <span>Ready to send</span>
            </div>
            {preview.typingIndicator && (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>Typing indicator enabled</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 