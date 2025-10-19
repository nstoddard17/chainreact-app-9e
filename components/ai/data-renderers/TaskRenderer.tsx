"use client"

import React, { useState } from "react"
import { CheckCircle2, Circle, Clock, AlertCircle, User, Calendar, Flag } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface Task {
  id?: string
  title: string
  description?: string
  status?: 'todo' | 'in_progress' | 'completed' | 'blocked' | 'cancelled'
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  dueDate?: string
  assignee?: string
  tags?: string[]
  progress?: number
  url?: string
  subtasks?: Array<{
    title: string
    completed: boolean
  }>
}

interface TaskRendererProps {
  tasks: Task[]
  title?: string
  groupBy?: 'status' | 'priority' | 'assignee' | 'none'
  showProgress?: boolean
  className?: string
}

export function TaskRenderer({
  tasks,
  title,
  groupBy = 'status',
  showProgress = true,
  className
}: TaskRendererProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />
      case 'in_progress':
        return <Clock className="w-5 h-5 text-blue-600" />
      case 'blocked':
        return <AlertCircle className="w-5 h-5 text-red-600" />
      case 'cancelled':
        return <Circle className="w-5 h-5 text-gray-400" />
      default:
        return <Circle className="w-5 h-5 text-muted-foreground" />
    }
  }

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
      case 'high':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
      case 'low':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
    }
  }

  const getStatusLabel = (status?: string) => {
    const labels: Record<string, string> = {
      'todo': 'To Do',
      'in_progress': 'In Progress',
      'completed': 'Completed',
      'blocked': 'Blocked',
      'cancelled': 'Cancelled'
    }
    return labels[status || 'todo'] || status || 'To Do'
  }

  const formatDueDate = (dateStr?: string) => {
    if (!dateStr) return null

    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = date.getTime() - now.getTime()
    const diffDays = Math.ceil(diffMs / 86400000)

    let label = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    })

    let variant: 'default' | 'secondary' | 'destructive' = 'default'
    let icon = <Calendar className="w-3 h-3" />

    if (diffDays < 0) {
      label = `Overdue (${label})`
      variant = 'destructive'
      icon = <AlertCircle className="w-3 h-3" />
    } else if (diffDays === 0) {
      label = 'Due today'
      variant = 'destructive'
    } else if (diffDays === 1) {
      label = 'Due tomorrow'
    } else if (diffDays <= 3) {
      label = `Due in ${diffDays} days`
    }

    return { label, variant, icon }
  }

  const groupTasks = () => {
    if (groupBy === 'none') {
      return { 'All Tasks': tasks }
    }

    const grouped: Record<string, Task[]> = {}

    tasks.forEach(task => {
      let key = 'Other'

      if (groupBy === 'status') {
        key = getStatusLabel(task.status)
      } else if (groupBy === 'priority') {
        key = task.priority ? task.priority.charAt(0).toUpperCase() + task.priority.slice(1) : 'No Priority'
      } else if (groupBy === 'assignee') {
        key = task.assignee || 'Unassigned'
      }

      if (!grouped[key]) {
        grouped[key] = []
      }
      grouped[key].push(task)
    })

    return grouped
  }

  const toggleGroup = (groupName: string) => {
    const newExpanded = new Set(expandedGroups)
    if (newExpanded.has(groupName)) {
      newExpanded.delete(groupName)
    } else {
      newExpanded.add(groupName)
    }
    setExpandedGroups(newExpanded)
  }

  if (tasks.length === 0) {
    return (
      <div className={cn("mt-3 p-4 bg-muted/50 rounded-lg border text-center", className)}>
        <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">No tasks found</p>
      </div>
    )
  }

  const groupedTasks = groupTasks()

  return (
    <div className={cn("mt-3 space-y-3", className)}>
      {/* Header */}
      {title && (
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-primary" />
          <span className="font-medium text-lg">{title}</span>
          <Badge variant="secondary" className="ml-auto">{tasks.length}</Badge>
        </div>
      )}

      {/* Grouped Tasks */}
      {Object.entries(groupedTasks).map(([groupName, groupTasks]) => (
        <div key={groupName} className="space-y-2">
          {/* Group Header */}
          {groupBy !== 'none' && (
            <button
              onClick={() => toggleGroup(groupName)}
              className="flex items-center gap-2 w-full text-left p-2 rounded hover:bg-muted/50 transition-colors"
            >
              <h3 className="font-semibold text-sm">{groupName}</h3>
              <Badge variant="outline" className="text-xs">{groupTasks.length}</Badge>
            </button>
          )}

          {/* Tasks */}
          <div className="space-y-2">
            {groupTasks.map((task, index) => {
              const dueDate = formatDueDate(task.dueDate)

              return (
                <Card
                  key={task.id || index}
                  className={cn(
                    "p-4 transition-all hover:bg-muted/50",
                    task.status === 'completed' && "opacity-60"
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* Status Icon */}
                    <div className="flex-shrink-0 mt-0.5">
                      {getStatusIcon(task.status)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-2">
                      {/* Title & Priority */}
                      <div className="flex items-start justify-between gap-2">
                        <h4 className={cn(
                          "font-medium text-sm",
                          task.status === 'completed' && "line-through text-muted-foreground"
                        )}>
                          {task.url ? (
                            <a
                              href={task.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              {task.title}
                            </a>
                          ) : (
                            task.title
                          )}
                        </h4>

                        {task.priority && (
                          <Badge
                            variant="outline"
                            className={cn("flex-shrink-0 text-xs", getPriorityColor(task.priority))}
                          >
                            <Flag className="w-3 h-3 mr-1" />
                            {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                          </Badge>
                        )}
                      </div>

                      {/* Description */}
                      {task.description && (
                        <div className="text-sm text-muted-foreground">
                          {task.description}
                        </div>
                      )}

                      {/* Metadata Row */}
                      <div className="flex flex-wrap items-center gap-3 text-xs">
                        {/* Assignee */}
                        {task.assignee && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <User className="w-3 h-3" />
                            <span>{task.assignee}</span>
                          </div>
                        )}

                        {/* Due Date */}
                        {dueDate && (
                          <Badge variant={dueDate.variant} className="text-xs">
                            {dueDate.icon}
                            <span className="ml-1">{dueDate.label}</span>
                          </Badge>
                        )}

                        {/* Tags */}
                        {task.tags && task.tags.length > 0 && (
                          <div className="flex gap-1">
                            {task.tags.slice(0, 3).map((tag, i) => (
                              <Badge key={i} variant="outline" className="text-xs px-1.5 py-0">
                                {tag}
                              </Badge>
                            ))}
                            {task.tags.length > 3 && (
                              <span className="text-muted-foreground">+{task.tags.length - 3}</span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Progress */}
                      {showProgress && task.progress !== undefined && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Progress</span>
                            <span className="font-medium">{task.progress}%</span>
                          </div>
                          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all"
                              style={{ width: `${task.progress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Subtasks */}
                      {task.subtasks && task.subtasks.length > 0 && (
                        <div className="space-y-1 pl-4 border-l-2 border-muted">
                          {task.subtasks.map((subtask, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              {subtask.completed ? (
                                <CheckCircle2 className="w-3 h-3 text-green-600" />
                              ) : (
                                <Circle className="w-3 h-3 text-muted-foreground" />
                              )}
                              <span className={cn(
                                subtask.completed && "line-through text-muted-foreground"
                              )}>
                                {subtask.title}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
