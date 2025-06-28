"use client"

import { Badge } from "@/components/ui/badge"
import { getRoleInfo, getRoleDisplayName, type UserRole } from "@/lib/utils/roles"
import { Crown, Star, Zap, Shield, Building } from "lucide-react"

interface RoleBadgeProps {
  role: UserRole
  size?: 'sm' | 'md' | 'lg'
  showIcon?: boolean
  className?: string
}

const roleIcons = {
  free: null,
  pro: Star,
  business: Building,
  enterprise: Shield,
  admin: Crown
}

export function RoleBadge({ role, size = 'md', showIcon = true, className = '' }: RoleBadgeProps) {
  const roleInfo = getRoleInfo(role)
  const Icon = roleIcons[role]
  
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5'
  }

  return (
    <Badge 
      variant="secondary" 
      className={`${roleInfo.badgeColor} ${sizeClasses[size]} ${className} font-medium`}
    >
      {showIcon && Icon && <Icon className={`w-3 h-3 mr-1 ${size === 'sm' ? 'w-2.5 h-2.5' : ''}`} />}
      {getRoleDisplayName(role)}
    </Badge>
  )
}

export function RoleBadgeCompact({ role, className = '' }: { role: UserRole; className?: string }) {
  const roleInfo = getRoleInfo(role)
  const Icon = roleIcons[role]
  
  return (
    <div className={`inline-flex items-center space-x-1 ${roleInfo.color} ${className}`}>
      {Icon && <Icon className="w-3 h-3" />}
      <span className="text-xs font-medium">{getRoleDisplayName(role)}</span>
    </div>
  )
} 