"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  MessageSquare,
  Send,
  MoreHorizontal,
  Trash2,
  Check,
  CheckCircle,
  RotateCcw,
  Edit2,
  X,
  Reply,
  Loader2,
  User,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { cn } from "@/lib/utils"
import {
  useWorkflowComments,
  WorkflowComment,
} from "@/hooks/useWorkflowComments"

interface WorkflowCommentsPanelProps {
  workflowId: string
  nodeId?: string | null
  nodeName?: string
  className?: string
  onClose?: () => void
}

/**
 * Panel for displaying and managing workflow comments
 */
export function WorkflowCommentsPanel({
  workflowId,
  nodeId,
  nodeName,
  className,
  onClose,
}: WorkflowCommentsPanelProps) {
  const [newComment, setNewComment] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [showResolved, setShowResolved] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const {
    comments,
    loading,
    addComment,
    updateComment,
    deleteComment,
    getUnresolvedCount,
    loadComments,
  } = useWorkflowComments({
    workflowId,
    nodeId,
    includeResolved: showResolved,
  })

  // Reload when showResolved changes
  useEffect(() => {
    loadComments()
  }, [showResolved, loadComments])

  const handleSubmit = async () => {
    if (!newComment.trim() || submitting) return

    setSubmitting(true)
    try {
      await addComment(newComment.trim())
      setNewComment("")
      textareaRef.current?.focus()
    } finally {
      setSubmitting(false)
    }
  }

  const unresolvedCount = getUnresolvedCount()

  return (
    <div className={cn("flex flex-col h-full bg-background", className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-muted-foreground" />
          <div>
            <h3 className="font-semibold">
              {nodeName ? `Comments: ${nodeName}` : "Workflow Comments"}
            </h3>
            {unresolvedCount > 0 && (
              <span className="text-xs text-muted-foreground">
                {unresolvedCount} unresolved
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowResolved(!showResolved)}
            className={cn(showResolved && "bg-muted")}
          >
            {showResolved ? "Hide Resolved" : "Show Resolved"}
          </Button>
          {onClose && (
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Comments List */}
      <ScrollArea className="flex-1 p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No comments yet</p>
            <p className="text-sm mt-1">
              Add a comment to start the conversation
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {comments.map((comment) => (
              <CommentThread
                key={comment.id}
                comment={comment}
                workflowId={workflowId}
                onResolve={(id, resolve) => updateComment(id, { resolve })}
                onEdit={(id, content) => updateComment(id, { content })}
                onDelete={deleteComment}
                onReply={(content, parentId) => addComment(content, nodeId, parentId)}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      {/* New Comment Input */}
      <div className="p-4 border-t">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            placeholder="Add a comment..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handleSubmit()
              }
            }}
            className="min-h-[80px] resize-none"
          />
        </div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-muted-foreground">
            Press Cmd/Ctrl+Enter to send
          </span>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={!newComment.trim() || submitting}
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Comment
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}

interface CommentThreadProps {
  comment: WorkflowComment
  workflowId: string
  onResolve: (id: string, resolve: boolean) => Promise<void>
  onEdit: (id: string, content: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onReply: (content: string, parentId: string) => Promise<void>
  depth?: number
}

function CommentThread({
  comment,
  workflowId,
  onResolve,
  onEdit,
  onDelete,
  onReply,
  depth = 0,
}: CommentThreadProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [isReplying, setIsReplying] = useState(false)
  const [editContent, setEditContent] = useState(comment.content)
  const [replyContent, setReplyContent] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSaveEdit = async () => {
    if (!editContent.trim() || loading) return
    setLoading(true)
    try {
      await onEdit(comment.id, editContent.trim())
      setIsEditing(false)
    } finally {
      setLoading(false)
    }
  }

  const handleReply = async () => {
    if (!replyContent.trim() || loading) return
    setLoading(true)
    try {
      await onReply(replyContent.trim(), comment.id)
      setReplyContent("")
      setIsReplying(false)
    } finally {
      setLoading(false)
    }
  }

  const handleResolve = async () => {
    setLoading(true)
    try {
      await onResolve(comment.id, !comment.resolved_at)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    setLoading(true)
    try {
      await onDelete(comment.id)
    } finally {
      setLoading(false)
    }
  }

  const isResolved = !!comment.resolved_at

  return (
    <div
      className={cn(
        "space-y-2",
        depth > 0 && "ml-6 pl-4 border-l border-muted"
      )}
    >
      <div
        className={cn(
          "p-3 rounded-lg border",
          isResolved
            ? "bg-muted/50 border-muted"
            : "bg-card border-border"
        )}
      >
        {/* Comment Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-4 h-4 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">
                  {comment.user_name || comment.user_email?.split("@")[0] || "User"}
                </span>
                {isResolved && (
                  <Badge
                    variant="outline"
                    className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                  >
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Resolved
                  </Badge>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(comment.created_at), {
                  addSuffix: true,
                })}
                {comment.updated_at !== comment.created_at && " (edited)"}
              </span>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setIsReplying(true)}>
                <Reply className="w-4 h-4 mr-2" />
                Reply
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleResolve}>
                {isResolved ? (
                  <>
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Reopen
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Resolve
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsEditing(true)}>
                <Edit2 className="w-4 h-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={handleDelete}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Comment Content */}
        {isEditing ? (
          <div className="mt-2 space-y-2">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="min-h-[60px] resize-none"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveEdit} disabled={loading}>
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  "Save"
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsEditing(false)
                  setEditContent(comment.content)
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <p
            className={cn(
              "mt-2 text-sm whitespace-pre-wrap",
              isResolved && "text-muted-foreground"
            )}
          >
            {comment.content}
          </p>
        )}
      </div>

      {/* Reply Input */}
      {isReplying && (
        <div className="ml-6 space-y-2">
          <Textarea
            placeholder="Write a reply..."
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            className="min-h-[60px] resize-none"
            autoFocus
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleReply} disabled={loading}>
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Reply"
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setIsReplying(false)
                setReplyContent("")
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Nested Replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="space-y-2">
          {comment.replies.map((reply) => (
            <CommentThread
              key={reply.id}
              comment={reply}
              workflowId={workflowId}
              onResolve={onResolve}
              onEdit={onEdit}
              onDelete={onDelete}
              onReply={onReply}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Compact comment indicator to show on nodes
 */
interface CommentIndicatorProps {
  count: number
  hasUnresolved: boolean
  onClick?: () => void
  className?: string
}

export function CommentIndicator({
  count,
  hasUnresolved,
  onClick,
  className,
}: CommentIndicatorProps) {
  if (count === 0) return null

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors",
        hasUnresolved
          ? "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-300"
          : "bg-muted text-muted-foreground hover:bg-muted/80",
        className
      )}
    >
      <MessageSquare className="w-3 h-3" />
      {count}
    </button>
  )
}
