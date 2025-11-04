"use client"

import React from 'react'
import { Plug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ConnectButtonProps {
  isConnected: boolean
  onClick: () => void
  disabled?: boolean
  className?: string
}

/**
 * ConnectButton - Toggle button for switching between text input and variable dropdown
 * - Not highlighted: Text input mode
 * - Highlighted: Variable dropdown mode
 */
export function ConnectButton({
  isConnected,
  onClick,
  disabled = false,
  className
}: ConnectButtonProps) {
  return (
    <Button
      type="button"
      variant={isConnected ? "default" : "outline"}
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-7 text-xs gap-1.5",
        className
      )}
    >
      <Plug className="h-3.5 w-3.5" />
      Connect
    </Button>
  )
}
