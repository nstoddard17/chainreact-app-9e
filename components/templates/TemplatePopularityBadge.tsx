"use client"

import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  TrendingUp,
  Flame,
  Star,
  Sparkles,
  Heart,
  Award,
  Zap,
  Target,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  PopularityBadge,
  PopularityInfo,
  getPopularityInfo,
  getDifficultyConfig,
} from "@/lib/templates/popularity"

interface TemplateForBadge {
  id: string
  downloads: number
  rating: number
  created_at: string
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced'
}

interface TemplatePopularityBadgeProps {
  template: TemplateForBadge
  allTemplates: TemplateForBadge[]
  showDifficulty?: boolean
  compact?: boolean
  className?: string
}

const badgeIcons: Record<NonNullable<PopularityBadge>, React.ElementType> = {
  'most-used': Flame,
  'popular': TrendingUp,
  'trending': Sparkles,
  'new': Star,
  'community-pick': Heart,
}

/**
 * Template Popularity Badge Component
 *
 * Displays popularity indicators like "Most Used", "Trending", etc.
 * Also can show difficulty badges.
 */
export function TemplatePopularityBadge({
  template,
  allTemplates,
  showDifficulty = true,
  compact = false,
  className,
}: TemplatePopularityBadgeProps) {
  const popularityInfo = getPopularityInfo(template, allTemplates)
  const difficultyConfig = getDifficultyConfig(template.difficulty)

  const PopularityIcon = popularityInfo.badge ? badgeIcons[popularityInfo.badge] : null

  return (
    <TooltipProvider>
      <div className={cn("flex flex-wrap gap-1.5", className)}>
        {/* Popularity Badge */}
        {popularityInfo.badge && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className={cn(
                  "flex items-center gap-1 font-medium border",
                  popularityInfo.badgeBgColor,
                  popularityInfo.badgeDarkBgColor,
                  popularityInfo.badgeColor,
                  compact && "text-xs px-1.5 py-0"
                )}
              >
                {PopularityIcon && (
                  <PopularityIcon className={cn("flex-shrink-0", compact ? "w-3 h-3" : "w-3.5 h-3.5")} />
                )}
                {!compact && popularityInfo.badgeLabel}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-medium">{popularityInfo.badgeLabel}</p>
              <p className="text-xs text-muted-foreground">
                Popularity score: {popularityInfo.popularityScore}/100
              </p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Difficulty Badge */}
        {showDifficulty && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className={cn(
                  "flex items-center gap-1",
                  difficultyConfig.bgColor,
                  difficultyConfig.darkBgColor,
                  difficultyConfig.color,
                  difficultyConfig.borderColor,
                  compact && "text-xs px-1.5 py-0"
                )}
              >
                <DifficultyIcon difficulty={template.difficulty} compact={compact} />
                {!compact && difficultyConfig.label}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p className="font-medium">{difficultyConfig.label} Level</p>
              <p className="text-xs text-muted-foreground">
                {getDifficultyDescription(template.difficulty)}
              </p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  )
}

function DifficultyIcon({ difficulty, compact }: { difficulty: string; compact: boolean }) {
  const size = compact ? "w-3 h-3" : "w-3.5 h-3.5"

  switch (difficulty) {
    case 'Beginner':
      return <Target className={size} />
    case 'Intermediate':
      return <Zap className={size} />
    case 'Advanced':
      return <Award className={size} />
    default:
      return null
  }
}

function getDifficultyDescription(difficulty: string): string {
  switch (difficulty) {
    case 'Beginner':
      return 'Easy to set up, minimal configuration needed'
    case 'Intermediate':
      return 'Some experience with automations helpful'
    case 'Advanced':
      return 'Complex setup, best for experienced users'
    default:
      return ''
  }
}

/**
 * Standalone Difficulty Badge
 */
interface DifficultyBadgeProps {
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced'
  compact?: boolean
  className?: string
}

export function DifficultyBadge({
  difficulty,
  compact = false,
  className,
}: DifficultyBadgeProps) {
  const config = getDifficultyConfig(difficulty)

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              "flex items-center gap-1",
              config.bgColor,
              config.darkBgColor,
              config.color,
              config.borderColor,
              compact && "text-xs px-1.5 py-0",
              className
            )}
          >
            <DifficultyIcon difficulty={difficulty} compact={compact} />
            {!compact && config.label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-medium">{config.label} Level</p>
          <p className="text-xs text-muted-foreground">
            {getDifficultyDescription(difficulty)}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/**
 * Popularity Score Indicator
 */
interface PopularityScoreProps {
  score: number
  showLabel?: boolean
  className?: string
}

export function PopularityScore({
  score,
  showLabel = true,
  className,
}: PopularityScoreProps) {
  const getScoreColor = () => {
    if (score >= 80) return 'text-green-600 dark:text-green-400'
    if (score >= 60) return 'text-blue-600 dark:text-blue-400'
    if (score >= 40) return 'text-amber-600 dark:text-amber-400'
    return 'text-gray-600 dark:text-gray-400'
  }

  const getScoreLabel = () => {
    if (score >= 80) return 'Excellent'
    if (score >= 60) return 'Good'
    if (score >= 40) return 'Fair'
    return 'New'
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            score >= 80 ? "bg-green-500" :
            score >= 60 ? "bg-blue-500" :
            score >= 40 ? "bg-amber-500" :
            "bg-gray-400"
          )}
          style={{ width: `${score}%` }}
        />
      </div>
      {showLabel && (
        <span className={cn("text-xs font-medium", getScoreColor())}>
          {getScoreLabel()}
        </span>
      )}
    </div>
  )
}
