"use client"

import { useState, useEffect } from "react"
import { ChevronDown, ChevronUp } from "lucide-react"

interface CollapsibleFooterSectionProps {
  title: string
  children: React.ReactNode
  className?: string
}

export function CollapsibleFooterSection({ title, children, className = "" }: CollapsibleFooterSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    
    // Check on mount
    checkMobile()
    
    // Add resize listener
    window.addEventListener('resize', checkMobile)
    
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const handleToggle = () => {
    if (isMobile) {
      setIsExpanded(!isExpanded)
    }
  }

  return (
    <div className={className}>
      {/* Header - Always visible */}
      <div 
        className="flex items-center justify-between cursor-pointer md:cursor-default"
        onClick={handleToggle}
      >
        <h4 className="font-semibold mb-4 text-blue-300">{title}</h4>
        {/* Chevron icon - only visible on mobile */}
        <div className="md:hidden">
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-blue-300" />
          ) : (
            <ChevronDown className="h-5 w-5 text-blue-300" />
          )}
        </div>
      </div>

      {/* Content - Collapsible on mobile, always visible on desktop */}
      <div className={`md:block ${isExpanded ? 'block' : 'hidden'}`}>
        {children}
      </div>
    </div>
  )
} 