"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  MessageSquare,
  FileSpreadsheet,
  Cloud,
  Users,
  ShoppingCart,
  BarChart3,
  Sparkles,
  Zap,
  Globe,
  Layers,
} from "lucide-react"

export interface AppCategory {
  id: string
  name: string
  icon: React.ElementType
  color: string
}

export const APP_CATEGORIES: AppCategory[] = [
  { id: "all", name: "All Apps", icon: Layers, color: "bg-slate-500" },
  { id: "communication", name: "Communication", icon: MessageSquare, color: "bg-blue-500" },
  { id: "productivity", name: "Productivity", icon: FileSpreadsheet, color: "bg-green-500" },
  { id: "storage", name: "Storage", icon: Cloud, color: "bg-purple-500" },
  { id: "crm", name: "CRM", icon: Users, color: "bg-pink-500" },
  { id: "e-commerce", name: "E-Commerce", icon: ShoppingCart, color: "bg-orange-500" },
  { id: "social", name: "Social", icon: Globe, color: "bg-cyan-500" },
  { id: "analytics", name: "Analytics", icon: BarChart3, color: "bg-yellow-500" },
  { id: "ai", name: "AI", icon: Sparkles, color: "bg-violet-500" },
  { id: "logic", name: "Logic", icon: Zap, color: "bg-rose-500" },
]

interface AppCategoryFilterProps {
  selectedCategory: string
  onSelectCategory: (category: string) => void
  categoryCounts?: Record<string, number>
  className?: string
}

/**
 * Category filter chips for the apps page
 * Shows all categories with counts of apps in each
 */
export function AppCategoryFilter({
  selectedCategory,
  onSelectCategory,
  categoryCounts = {},
  className
}: AppCategoryFilterProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {APP_CATEGORIES.map((category) => {
        const Icon = category.icon
        const count = category.id === "all"
          ? Object.values(categoryCounts).reduce((sum, c) => sum + c, 0)
          : categoryCounts[category.id] || 0
        const isSelected = selectedCategory === category.id

        // Don't show categories with no apps (except "all")
        if (category.id !== "all" && count === 0) {
          return null
        }

        return (
          <Button
            key={category.id}
            variant={isSelected ? "default" : "outline"}
            size="sm"
            onClick={() => onSelectCategory(category.id)}
            className={cn(
              "h-8 gap-1.5 transition-all",
              isSelected && "shadow-md"
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{category.name}</span>
            <Badge
              variant="secondary"
              className={cn(
                "ml-0.5 h-5 min-w-5 text-xs font-medium rounded-full",
                isSelected ? "bg-white/20 text-white" : "bg-muted"
              )}
            >
              {count}
            </Badge>
          </Button>
        )
      })}
    </div>
  )
}

/**
 * Get category display info by ID
 */
export function getCategoryInfo(categoryId: string): AppCategory | undefined {
  return APP_CATEGORIES.find(c => c.id === categoryId)
}

/**
 * Get the category badge for an app
 */
interface CategoryBadgeProps {
  category: string
  className?: string
}

export function CategoryBadge({ category, className }: CategoryBadgeProps) {
  const info = getCategoryInfo(category)
  if (!info) return null

  const Icon = info.icon

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs px-1.5 py-0.5 flex items-center gap-1",
        className
      )}
    >
      <Icon className="w-3 h-3" />
      {info.name}
    </Badge>
  )
}
