/**
 * Template Popularity Utilities
 *
 * Calculates popularity scores and badges for templates
 * based on downloads, ratings, and age.
 */

export type PopularityBadge =
  | 'most-used'      // Top 3 by downloads
  | 'popular'        // High engagement
  | 'trending'       // Recent high growth
  | 'new'            // Created within last 7 days
  | 'community-pick' // High rating + downloads
  | null

export interface PopularityInfo {
  badge: PopularityBadge
  badgeLabel: string
  badgeColor: string
  badgeBgColor: string
  badgeDarkBgColor: string
  popularityScore: number
  trend: 'up' | 'down' | 'stable'
}

interface TemplateForPopularity {
  id: string
  downloads: number
  rating: number
  created_at: string
  updated_at?: string
}

/**
 * Calculate popularity score (0-100)
 */
export function calculatePopularityScore(
  downloads: number,
  rating: number,
  ageInDays: number
): number {
  // Weights
  const downloadWeight = 0.5
  const ratingWeight = 0.3
  const freshnessWeight = 0.2

  // Normalize downloads (log scale, max around 10000)
  const normalizedDownloads = Math.min(Math.log10(downloads + 1) / 4, 1) * 100

  // Normalize rating (0-5 scale)
  const normalizedRating = (rating / 5) * 100

  // Freshness bonus (newer is better, decay over 90 days)
  const freshnessScore = Math.max(0, 100 - (ageInDays / 90) * 100)

  return Math.round(
    normalizedDownloads * downloadWeight +
    normalizedRating * ratingWeight +
    freshnessScore * freshnessWeight
  )
}

/**
 * Get days since a date
 */
function getDaysSince(dateStr: string): number {
  const date = new Date(dateStr)
  const now = new Date()
  const diffTime = Math.abs(now.getTime() - date.getTime())
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

/**
 * Determine the popularity badge for a template
 */
export function getPopularityBadge(
  template: TemplateForPopularity,
  allTemplates: TemplateForPopularity[]
): PopularityBadge {
  const ageInDays = getDaysSince(template.created_at)

  // Sort all templates by downloads to find top ones
  const sortedByDownloads = [...allTemplates].sort((a, b) => b.downloads - a.downloads)
  const rank = sortedByDownloads.findIndex(t => t.id === template.id) + 1

  // New badge: created within last 7 days
  if (ageInDays <= 7) {
    return 'new'
  }

  // Most Used: Top 3 by downloads
  if (rank <= 3 && template.downloads >= 500) {
    return 'most-used'
  }

  // Community Pick: High rating + decent downloads
  if (template.rating >= 4.8 && template.downloads >= 1000) {
    return 'community-pick'
  }

  // Popular: High engagement (top 20%)
  const topPercentile = Math.ceil(allTemplates.length * 0.2)
  if (rank <= topPercentile && template.downloads >= 500) {
    return 'popular'
  }

  // Trending: Recent and growing (created < 30 days, good downloads)
  if (ageInDays <= 30 && template.downloads >= 200) {
    return 'trending'
  }

  return null
}

/**
 * Get full popularity info for a template
 */
export function getPopularityInfo(
  template: TemplateForPopularity,
  allTemplates: TemplateForPopularity[]
): PopularityInfo {
  const badge = getPopularityBadge(template, allTemplates)
  const ageInDays = getDaysSince(template.created_at)
  const popularityScore = calculatePopularityScore(
    template.downloads,
    template.rating,
    ageInDays
  )

  // Determine trend based on score
  const trend: 'up' | 'down' | 'stable' =
    popularityScore >= 70 ? 'up' :
    popularityScore <= 30 ? 'down' :
    'stable'

  const badgeConfig = getBadgeConfig(badge)

  return {
    badge,
    ...badgeConfig,
    popularityScore,
    trend,
  }
}

/**
 * Get badge display configuration
 */
function getBadgeConfig(badge: PopularityBadge): {
  badgeLabel: string
  badgeColor: string
  badgeBgColor: string
  badgeDarkBgColor: string
} {
  switch (badge) {
    case 'most-used':
      return {
        badgeLabel: 'Most Used',
        badgeColor: 'text-amber-700 dark:text-amber-300',
        badgeBgColor: 'bg-amber-100',
        badgeDarkBgColor: 'dark:bg-amber-900/30',
      }
    case 'popular':
      return {
        badgeLabel: 'Popular',
        badgeColor: 'text-blue-700 dark:text-blue-300',
        badgeBgColor: 'bg-blue-100',
        badgeDarkBgColor: 'dark:bg-blue-900/30',
      }
    case 'trending':
      return {
        badgeLabel: 'Trending',
        badgeColor: 'text-purple-700 dark:text-purple-300',
        badgeBgColor: 'bg-purple-100',
        badgeDarkBgColor: 'dark:bg-purple-900/30',
      }
    case 'new':
      return {
        badgeLabel: 'New',
        badgeColor: 'text-green-700 dark:text-green-300',
        badgeBgColor: 'bg-green-100',
        badgeDarkBgColor: 'dark:bg-green-900/30',
      }
    case 'community-pick':
      return {
        badgeLabel: 'Community Pick',
        badgeColor: 'text-rose-700 dark:text-rose-300',
        badgeBgColor: 'bg-rose-100',
        badgeDarkBgColor: 'dark:bg-rose-900/30',
      }
    default:
      return {
        badgeLabel: '',
        badgeColor: '',
        badgeBgColor: '',
        badgeDarkBgColor: '',
      }
  }
}

/**
 * Get difficulty badge configuration
 */
export function getDifficultyConfig(difficulty: 'Beginner' | 'Intermediate' | 'Advanced'): {
  label: string
  color: string
  bgColor: string
  darkBgColor: string
  borderColor: string
  icon: 'easy' | 'medium' | 'hard'
} {
  switch (difficulty) {
    case 'Beginner':
      return {
        label: 'Beginner',
        color: 'text-green-700 dark:text-green-300',
        bgColor: 'bg-green-50',
        darkBgColor: 'dark:bg-green-900/20',
        borderColor: 'border-green-200 dark:border-green-800',
        icon: 'easy',
      }
    case 'Intermediate':
      return {
        label: 'Intermediate',
        color: 'text-amber-700 dark:text-amber-300',
        bgColor: 'bg-amber-50',
        darkBgColor: 'dark:bg-amber-900/20',
        borderColor: 'border-amber-200 dark:border-amber-800',
        icon: 'medium',
      }
    case 'Advanced':
      return {
        label: 'Advanced',
        color: 'text-red-700 dark:text-red-300',
        bgColor: 'bg-red-50',
        darkBgColor: 'dark:bg-red-900/20',
        borderColor: 'border-red-200 dark:border-red-800',
        icon: 'hard',
      }
  }
}

/**
 * Sort templates by popularity
 */
export function sortByPopularity<T extends TemplateForPopularity>(
  templates: T[],
  order: 'desc' | 'asc' = 'desc'
): T[] {
  return [...templates].sort((a, b) => {
    const ageA = getDaysSince(a.created_at)
    const ageB = getDaysSince(b.created_at)
    const scoreA = calculatePopularityScore(a.downloads, a.rating, ageA)
    const scoreB = calculatePopularityScore(b.downloads, b.rating, ageB)
    return order === 'desc' ? scoreB - scoreA : scoreA - scoreB
  })
}
