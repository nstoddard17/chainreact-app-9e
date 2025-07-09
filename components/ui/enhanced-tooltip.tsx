"use client"

import * as React from "react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { HelpCircle, ExternalLink, Maximize2 } from "lucide-react"
import { cn } from "@/lib/utils"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"

interface EnhancedTooltipProps {
  description: string
  title?: string
  className?: string
  buttonClassName?: string
  showExpandButton?: boolean
  maxLength?: number
  delayDuration?: number
  disabled?: boolean
}

export function EnhancedTooltip({
  description,
  title = "Field Information",
  className,
  buttonClassName,
  showExpandButton = true,
  maxLength = 200,
  delayDuration = 1000,
  disabled = false
}: EnhancedTooltipProps) {
  const isLongDescription = description.length > maxLength
  const shouldShowExpandButton = showExpandButton && isLongDescription

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <TooltipProvider>
        <Tooltip delayDuration={delayDuration} disableHoverableContent={true} open={disabled ? false : undefined}>
          <TooltipTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm" 
              className={cn("h-6 w-6 p-0", buttonClassName)}
              onMouseEnter={(e) => {
                // Prevent any auto-focus or auto-hover behavior
                e.currentTarget.blur()
              }}
            >
              <HelpCircle className="h-4 w-4 text-muted-foreground" />
            </Button>
          </TooltipTrigger>
          <TooltipPrimitive.Portal>
            <TooltipContent 
              side="top" 
              className="max-w-md whitespace-normal z-[9999]"
              sideOffset={8}
              align="start"
              avoidCollisions={true}
              collisionPadding={20}
              sticky="partial"
              hideWhenDetached={false}
            >
              <p className="text-sm leading-relaxed">
                {isLongDescription ? `${description.substring(0, maxLength)}...` : description}
              </p>
              {shouldShowExpandButton && (
                <div className="mt-2 pt-2 border-t border-border/50">
                  <p className="text-xs text-muted-foreground">
                    Click the expand button for full details
                  </p>
                </div>
              )}
            </TooltipContent>
          </TooltipPrimitive.Portal>
        </Tooltip>
      </TooltipProvider>

      {shouldShowExpandButton && (
        <Dialog>
          <DialogTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
              title="View full description"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5" />
                {title}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="prose prose-sm max-w-none">
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {description}
                </p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
} 