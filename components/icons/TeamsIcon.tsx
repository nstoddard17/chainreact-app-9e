import React from 'react'

export const TeamsIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {/* Top center person */}
    <circle cx="12" cy="7" r="2.5" />
    {/* Bottom left person */}
    <circle cx="8" cy="15" r="2.5" />
    {/* Bottom right person */}
    <circle cx="16" cy="15" r="2.5" />
    {/* Top person body */}
    <path d="M9 12v-1a3 3 0 0 1 6 0v1" />
    {/* Bottom left person body */}
    <path d="M5 20v-1a3 3 0 0 1 6 0v1" />
    {/* Bottom right person body */}
    <path d="M13 20v-1a3 3 0 0 1 6 0v1" />
  </svg>
)