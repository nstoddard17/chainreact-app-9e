"use client"

import React from "react"
import { HelpCircle, Briefcase, User, Folder, List, Mail, Inbox, Calendar, Star, CheckCircle, Users, CheckSquare } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface QuestionOption {
  id: string
  label: string
  value: any
  description?: string
  icon?: string
}

interface QuestionRendererProps {
  question: string
  options: QuestionOption[]
  onSelect: (optionId: string) => void
  className?: string
}

export function QuestionRenderer({ question, options, onSelect, className }: QuestionRendererProps) {
  const getIcon = (iconName?: string) => {
    const iconClass = "w-5 h-5"

    switch (iconName) {
      case 'briefcase':
        return <Briefcase className={iconClass} />
      case 'user':
        return <User className={iconClass} />
      case 'folder':
        return <Folder className={iconClass} />
      case 'list':
        return <List className={iconClass} />
      case 'mail':
        return <Mail className={iconClass} />
      case 'inbox':
        return <Inbox className={iconClass} />
      case 'calendar':
        return <Calendar className={iconClass} />
      case 'star':
        return <Star className={iconClass} />
      case 'check-circle':
        return <CheckCircle className={iconClass} />
      case 'users':
        return <Users className={iconClass} />
      case 'check-square':
        return <CheckSquare className={iconClass} />
      default:
        return <HelpCircle className={iconClass} />
    }
  }

  return (
    <div className={cn("mt-3 space-y-3", className)}>
      {/* Question Header */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-950/20 border-l-4 border-l-blue-500 rounded-r-lg">
        <div className="flex-shrink-0 mt-0.5">
          <HelpCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1">
          <p className="font-medium text-blue-900 dark:text-blue-100">
            {question}
          </p>
          <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
            Please select an option below:
          </p>
        </div>
      </div>

      {/* Options Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {options.map((option) => (
          <Card
            key={option.id}
            className={cn(
              "group cursor-pointer transition-all hover:shadow-md hover:border-primary",
              "hover:bg-primary/5"
            )}
            onClick={() => onSelect(option.id)}
          >
            <div className="p-4">
              <div className="flex items-start gap-3">
                {/* Icon */}
                <div className={cn(
                  "flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center",
                  "bg-primary/10 group-hover:bg-primary/20 transition-colors"
                )}>
                  <div className="text-primary">
                    {getIcon(option.icon)}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Label */}
                  <h4 className="font-semibold text-sm mb-1 group-hover:text-primary transition-colors">
                    {option.label}
                  </h4>

                  {/* Description */}
                  {option.description && (
                    <p className="text-xs text-muted-foreground">
                      {option.description}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Helper Text */}
      <p className="text-xs text-center text-muted-foreground">
        Click an option to continue
      </p>
    </div>
  )
}
