"use client"

import { useState } from "react"
import { X, Crown, Star, Building2, Shield, Check, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { type UserRole, getRoleInfo, ROLES } from "@/lib/utils/roles"

interface UpgradeOverlayProps {
  requiredRole: UserRole
  currentRole: UserRole
  featureName: string
  onClose: () => void
}

const roleIcons = {
  free: null,
  pro: Star,
  'beta-pro': Star,
  business: Building2,
  enterprise: Shield,
  admin: Crown
}

const roleColors = {
  free: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
  pro: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
  'beta-pro': 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
  business: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-300',
  enterprise: 'bg-pink-100 text-pink-800 dark:bg-pink-900/50 dark:text-pink-300',
  admin: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300'
}

const roleGradients = {
  free: 'from-green-500 to-green-600',
  pro: 'from-blue-500 to-blue-600',
  'beta-pro': 'from-blue-500 to-blue-600',
  business: 'from-indigo-500 to-purple-600',
  enterprise: 'from-pink-500 to-rose-600',
  admin: 'from-red-500 to-orange-600'
}

export function UpgradeOverlay({ requiredRole, currentRole, featureName, onClose }: UpgradeOverlayProps) {
  const [selectedPlan, setSelectedPlan] = useState<UserRole | null>(null)
  const [expandedPlans, setExpandedPlans] = useState<Set<UserRole>>(new Set())
  
  const currentRoleInfo = getRoleInfo(currentRole)
  
  // Get all plans including free, excluding admin
  // Show secret roles only to admins
  const availablePlans = Object.entries(ROLES).filter(([role, info]) => {
    if (role === 'admin') return false // Don't show admin as a purchasable plan
    if (info.isSecret && currentRole !== 'admin') return false // Don't show secret roles to non-admins
    return true
  })

  const togglePlanExpansion = (planRole: UserRole) => {
    const newExpanded = new Set(expandedPlans)
    if (newExpanded.has(planRole)) {
      newExpanded.delete(planRole)
    } else {
      newExpanded.add(planRole)
    }
    setExpandedPlans(newExpanded)
  }

  const handlePlanSelect = (planRole: UserRole) => {
    setSelectedPlan(planRole)
    if (!expandedPlans.has(planRole)) {
      setExpandedPlans(new Set([planRole]))
    }
  }

  const isUpgrade = (planRole: UserRole) => {
    const roleHierarchy = ['free', 'pro', 'beta-pro', 'business', 'enterprise', 'admin']
    const currentIndex = roleHierarchy.indexOf(currentRole)
    const planIndex = roleHierarchy.indexOf(planRole)
    return planIndex > currentIndex
  }

  const getActionText = (planRole: UserRole) => {
    if (planRole === currentRole) return 'Current Plan'
    return isUpgrade(planRole) ? `Upgrade to ${getRoleInfo(planRole).displayName}` : `Downgrade to ${getRoleInfo(planRole).displayName}`
  }

  const getActionButtonStyle = (planRole: UserRole) => {
    if (planRole === currentRole) return "bg-muted text-muted-foreground cursor-not-allowed"
    if (isUpgrade(planRole)) {
      return `bg-gradient-to-r ${roleGradients[planRole as keyof typeof roleGradients]}`
    }
    return "bg-orange-500 hover:bg-orange-600"
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-background border border-border rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-border relative">
          <Button
            variant="ghost"
            size="icon"
            className="absolute top-4 right-4 h-8 w-8"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
          
          <div className="text-center">
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Upgrade to Access {featureName}
            </h2>
            <p className="text-muted-foreground">
              Choose a plan that fits your needs
            </p>
          </div>
        </div>

        {/* Plans Grid */}
        <div className="p-6 space-y-4">
          {availablePlans.map(([role, planInfo]) => {
            const RoleIcon = roleIcons[role as keyof typeof roleIcons]
            const isExpanded = expandedPlans.has(role as UserRole)
            const isSelected = selectedPlan === role
            const isCurrentPlan = currentRole === role
            const isRecommended = role === requiredRole
            
            return (
              <div
                key={role}
                className={cn(
                  "border rounded-lg p-4 transition-all duration-200 cursor-pointer",
                  isSelected 
                    ? "border-primary bg-primary/5" 
                    : "border-border hover:border-primary/50 hover:bg-muted/50",
                  isCurrentPlan ? "opacity-50 cursor-not-allowed" : ""
                )}
                onClick={() => !isCurrentPlan && handlePlanSelect(role as UserRole)}
              >
                {/* Plan Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    {RoleIcon && <RoleIcon className="w-6 h-6" />}
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="font-semibold text-foreground">{planInfo.displayName}</h3>
                        {isRecommended && (
                          <Badge className="bg-primary text-primary-foreground text-xs">
                            Recommended
                          </Badge>
                        )}
                        {isCurrentPlan && (
                          <Badge variant="outline" className="text-xs">
                            Current Plan
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{planInfo.description}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    {!isCurrentPlan && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          togglePlanExpansion(role as UserRole)
                        }}
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Expanded Features */}
                {isExpanded && (
                  <div className="mt-4 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h4 className="font-medium text-foreground mb-2">Features</h4>
                        <ul className="space-y-2">
                          {planInfo.features.map((feature, index) => (
                            <li key={index} className="flex items-center text-sm text-muted-foreground">
                              <Check className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                              {feature}
                            </li>
                          ))}
                        </ul>
                      </div>
                      
                      <div>
                        <h4 className="font-medium text-foreground mb-2">Limits</h4>
                        <div className="space-y-2">
                          {Object.entries(planInfo.limits).map(([limitType, limit]) => (
                            <div key={limitType} className="flex justify-between text-sm">
                              <span className="text-muted-foreground capitalize">
                                {limitType.replace(/([A-Z])/g, ' $1').trim()}:
                              </span>
                              <span className="font-medium">
                                {limit === -1 ? 'Unlimited' : limit.toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    
                    {!isCurrentPlan && (
                      <div className="pt-4 border-t border-border">
                        <Button 
                          className={cn(
                            "w-full",
                            getActionButtonStyle(role as UserRole)
                          )}
                        >
                          {getActionText(role as UserRole)}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border bg-muted/30">
          <div className="flex justify-between items-center">
            <Button variant="outline" onClick={onClose}>
              Maybe Later
            </Button>
            <p className="text-sm text-muted-foreground">
              Need help choosing? <Button variant="link" className="p-0 h-auto">Contact support</Button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function cn(...classes: (string | undefined)[]) {
  return classes.filter(Boolean).join(' ')
} 