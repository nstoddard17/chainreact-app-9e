import React from 'react'

export const WorkflowsIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {/* Left node */}
    <circle cx="6" cy="12" r="3" />
    {/* Top right node */}
    <circle cx="18" cy="6" r="3" />
    {/* Bottom right node */}
    <circle cx="18" cy="18" r="3" />
    {/* Connecting lines */}
    <path d="M9 12h3" />
    <path d="M12 12v-4.5l3-1.5" />
    <path d="M12 12v4.5l3 1.5" />
  </svg>
)