import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MessageCircle, Hash, Link, Image, Video } from 'lucide-react'

interface FacebookCommentPreview {
  postId: string
  comment: string
  attachmentUrl: string | null
  attachmentType: string | null
}

interface FacebookCommentPreviewProps {
  preview: FacebookCommentPreview
}

export function FacebookCommentPreview({ preview }: FacebookCommentPreviewProps) {
  if (!preview) {
    return (
      <div className="text-sm text-muted-foreground bg-muted/30 p-4 rounded border flex flex-col items-center justify-center">
        <div className="mb-2">
          <MessageCircle className="h-8 w-8 text-muted-foreground" />
        </div>
        <p>No comment preview available</p>
      </div>
    )
  }

  const getAttachmentIcon = (type: string | null) => {
    switch (type) {
      case 'photo':
        return <Image className="h-4 w-4" />
      case 'video':
        return <Video className="h-4 w-4" />
      case 'link':
        return <Link className="h-4 w-4" />
      default:
        return <Link className="h-4 w-4" />
    }
  }

  const getAttachmentLabel = (type: string | null) => {
    switch (type) {
      case 'photo':
        return 'Photo'
      case 'video':
        return 'Video'
      case 'link':
        return 'Link'
      default:
        return 'Attachment'
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            Comment Preview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Post ID */}
          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">On Post:</span>
            <Badge variant="outline" className="text-xs">
              {preview.postId}
            </Badge>
          </div>

          {/* Comment */}
          <div className="bg-muted/30 p-3 rounded-lg">
            <p className="text-sm whitespace-pre-wrap">{preview.comment}</p>
          </div>

          {/* Attachment */}
          {preview.attachmentUrl && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {getAttachmentIcon(preview.attachmentType)}
                <span className="text-xs font-medium text-muted-foreground">
                  {getAttachmentLabel(preview.attachmentType)}:
                </span>
              </div>
              <div className="bg-muted/20 p-2 rounded text-xs break-all">
                {preview.attachmentUrl}
              </div>
            </div>
          )}

          {/* Settings */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <MessageCircle className="h-3 w-3" />
              <span>Ready to comment</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
} 