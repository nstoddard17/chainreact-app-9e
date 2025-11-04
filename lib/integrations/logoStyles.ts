const LIGHT_MODE_INVERT = new Set([
  'airtable', // Pure white logo, needs inverting
  'github', // Pure white logo, needs inverting
  'instagram',
  'tiktok',
  'x', // X logo is white, needs inverting in light mode
  'twitter', // Twitter/X logo is white, needs inverting in light mode
  // Removed: notion (multi-color), google-docs (now colored), microsoft-onenote (now colored)
])

const DARK_MODE_INVERT = new Set([
  // No logos need inverting only in dark mode currently
])

// Providers that have separate SVG files for dark mode
const DARK_MODE_SVG = new Set([
  'notion', // Uses notion-dark.svg in dark mode
])

/**
 * Returns the appropriate SVG path for an integration logo based on theme.
 * Some providers have separate SVG files for dark mode.
 */
export function getIntegrationLogoPath(providerId: string, theme?: string): string {
  // If dark mode and provider has a dark variant, use it
  if (theme === 'dark' && DARK_MODE_SVG.has(providerId)) {
    return `/integrations/${providerId}-dark.svg`
  }

  // Default to the standard logo
  return `/integrations/${providerId}.svg`
}

/**
 * Returns the appropriate utility classes for an integration logo so that
 * monochrome assets remain visible in both light and dark themes.
 */
export function getIntegrationLogoClasses(providerId: string, baseClasses = 'w-6 h-6 object-contain') {
  const classes = [baseClasses.trim()]

  if (LIGHT_MODE_INVERT.has(providerId)) {
    // In light mode, invert the logo (make white logos black)
    // In dark mode, don't invert (keep white logos white)
    classes.push('invert', 'dark:invert-0')
  }

  if (DARK_MODE_INVERT.has(providerId)) {
    // In dark mode, invert the logo (make black logos white)
    classes.push('dark:invert')
  }

  return classes.join(' ')
}
