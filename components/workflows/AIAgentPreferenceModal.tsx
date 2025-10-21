"use client"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Sparkles, Zap, Clock } from "lucide-react"

interface AIAgentPreferenceModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectPreference: (preference: 'always_skip' | 'always_show' | 'ask_later') => void
}

export function AIAgentPreferenceModal({
  open,
  onOpenChange,
  onSelectPreference,
}: AIAgentPreferenceModalProps) {
  const handleSelect = (preference: 'always_skip' | 'always_show' | 'ask_later') => {
    onSelectPreference(preference)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Workflow Creation Preference
          </DialogTitle>
          <DialogDescription className="pt-2">
            You've skipped the AI agent 3 times. How would you like to create workflows going forward?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {/* Always Skip AI */}
          <button
            onClick={() => handleSelect('always_skip')}
            className="w-full text-left p-4 rounded-lg border-2 border-border hover:border-primary hover:bg-accent transition-all group"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-muted group-hover:bg-primary/10 transition-colors">
                <Zap className="w-5 h-5 text-muted-foreground group-hover:text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1">Always Skip AI</h3>
                <p className="text-sm text-muted-foreground">
                  Go straight to the manual builder every time. You can change this in settings later.
                </p>
              </div>
            </div>
          </button>

          {/* Remind Me Later */}
          <button
            onClick={() => handleSelect('ask_later')}
            className="w-full text-left p-4 rounded-lg border-2 border-border hover:border-primary hover:bg-accent transition-all group"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-muted group-hover:bg-primary/10 transition-colors">
                <Clock className="w-5 h-5 text-muted-foreground group-hover:text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1">Remind Me Later</h3>
                <p className="text-sm text-muted-foreground">
                  Continue showing the AI agent page. I'll let you know if I change my mind.
                </p>
              </div>
            </div>
          </button>

          {/* Use AI */}
          <button
            onClick={() => handleSelect('always_show')}
            className="w-full text-left p-4 rounded-lg border-2 border-primary bg-primary/5 hover:bg-primary/10 transition-all group"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/20">
                <Sparkles className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold mb-1 flex items-center gap-2">
                  Use AI
                  <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-primary/20 text-primary">
                    Recommended
                  </span>
                </h3>
                <p className="text-sm text-muted-foreground">
                  Continue showing the AI agent to help build workflows faster. We'll ask again if you skip 3 more times.
                </p>
              </div>
            </div>
          </button>
        </div>

        <DialogFooter className="flex-col sm:flex-col gap-2">
          <p className="text-xs text-muted-foreground text-center">
            You can always change this preference in your settings
          </p>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
