/**
 * Image Optimization Utilities
 *
 * Helpers for optimizing images in the application
 */

/**
 * Common image sizes used across the application
 * Using standardized sizes helps with caching and performance
 */
export const IMAGE_SIZES = {
  // Avatars
  avatar: {
    sm: 32,
    md: 40,
    lg: 64,
    xl: 96,
  },
  // Logos
  logo: {
    sm: 24,
    md: 32,
    lg: 48,
    xl: 64,
  },
  // Thumbnails
  thumbnail: {
    sm: 80,
    md: 120,
    lg: 200,
    xl: 300,
  },
  // Full images
  full: {
    sm: 400,
    md: 800,
    lg: 1200,
    xl: 1600,
  },
} as const

/**
 * Generate sizes attribute for responsive images
 */
export function generateSizes(config: {
  mobile?: string
  tablet?: string
  desktop?: string
  default: string
}): string {
  const sizes: string[] = []

  if (config.mobile) {
    sizes.push(`(max-width: 640px) ${config.mobile}`)
  }
  if (config.tablet) {
    sizes.push(`(max-width: 1024px) ${config.tablet}`)
  }
  if (config.desktop) {
    sizes.push(`(min-width: 1025px) ${config.desktop}`)
  }
  sizes.push(config.default)

  return sizes.join(', ')
}

/**
 * Check if image should be lazy loaded
 * Images above the fold should NOT be lazy loaded
 */
export function shouldLazyLoad(priority?: boolean, aboveFold?: boolean): boolean {
  if (priority) return false
  if (aboveFold) return false
  return true
}

/**
 * Get optimal image quality based on use case
 */
export function getImageQuality(useCase: 'avatar' | 'logo' | 'thumbnail' | 'hero' | 'content'): number {
  switch (useCase) {
    case 'avatar':
      return 75 // Avatars can be slightly compressed
    case 'logo':
      return 90 // Logos need to be crisp
    case 'thumbnail':
      return 70 // Thumbnails can be more compressed
    case 'hero':
      return 85 // Hero images should look good
    case 'content':
      return 80 // General content images
    default:
      return 75
  }
}
