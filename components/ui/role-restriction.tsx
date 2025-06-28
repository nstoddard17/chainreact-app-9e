"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { RoleBadge } from "@/components/ui/role-badge"
import { Lock, Crown, Star, Building, Shield } from "lucide-react"
import { useRolePermissions } from "@/hooks/use-role-permissions"
import { type UserRole, ROLES } from "@/lib/utils/roles"
import Link from "next/link"

interface RoleRestrictionProps {
  requiredRole: UserRole
  feature: string
  description?: string
  children?: React.ReactNode
  showUpgradeButton?: boolean
  className?: string
}

const roleIcons = {
  free: null,
  pro: Star,
  business: Building,
  enterprise: Shield,
  admin: Crown
}

export function RoleRestriction({ 
  requiredRole, 
  feature, 
  description, 
  children, 
  showUpgradeButton = true,
  className = "" 
}: RoleRestrictionProps) {
  const { userRole, hasPermission } = useRolePermissions()
  const Icon = roleIcons[requiredRole]
  
  if (hasPermission(requiredRole)) {
    return <div className={className}>{children}</div>
  }

  return (
    <Card className={`bg-muted/50 border-dashed border-2 ${className}`}>
      <CardHeader className="text-center pb-4">
        <div className="flex items-center justify-center space-x-2 mb-2">
          <Lock className="w-5 h-5 text-muted-foreground" />
          {Icon && <Icon className="w-5 h-5 text-muted-foreground" />}
        </div>
        <CardTitle className="text-lg">{feature}</CardTitle>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </CardHeader>
      <CardContent className="text-center space-y-4">
        <div className="flex items-center justify-center space-x-2">
          <span className="text-sm text-muted-foreground">Requires:</span>
          <RoleBadge role={requiredRole} />
        </div>
        <div className="flex items-center justify-center space-x-2">
          <span className="text-sm text-muted-foreground">Your plan:</span>
          <RoleBadge role={userRole} />
        </div>
        
        {showUpgradeButton && (
          <div className="pt-2">
            <Link href="/settings/billing">
              <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
                <Crown className="w-4 h-4 mr-2" />
                Upgrade Plan
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function RoleUpgradePrompt({ 
  currentRole, 
  targetRole, 
  feature, 
  description,
  className = "" 
}: {
  currentRole: UserRole
  targetRole: UserRole
  feature: string
  description?: string
  className?: string
}) {
  const currentRoleInfo = ROLES[currentRole]
  const targetRoleInfo = ROLES[targetRole]

  return (
    <Card className={`bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200 ${className}`}>
      <CardHeader className="text-center">
        <div className="flex items-center justify-center space-x-4 mb-4">
          <div className="flex items-center space-x-2">
            <span className="text-sm text-muted-foreground">Current:</span>
            <RoleBadge role={currentRole} />
          </div>
          <div className="text-muted-foreground">→</div>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-muted-foreground">Upgrade to:</span>
            <RoleBadge role={targetRole} />
          </div>
        </div>
        <CardTitle className="text-lg">{feature}</CardTitle>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </CardHeader>
      <CardContent className="text-center space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
          <div>
            <h4 className="font-medium mb-2">Current Plan Features:</h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              {currentRoleInfo.features.slice(0, 3).map((feature, index) => (
                <li key={index} className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full" />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-medium mb-2">Upgraded Plan Features:</h4>
            <ul className="text-sm space-y-1">
              {targetRoleInfo.features.slice(0, 3).map((feature, index) => (
                <li key={index} className="flex items-center space-x-2">
                  <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                  <span className="text-green-700">{feature}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        
        <Link href="/settings/billing">
          <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 w-full">
            <Crown className="w-4 h-4 mr-2" />
            Upgrade to {targetRoleInfo.displayName}
          </Button>
        </Link>
      </CardContent>
    </Card>
  )
} 