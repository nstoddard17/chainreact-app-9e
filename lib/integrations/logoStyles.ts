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

/**
 * Returns the appropriate utility classes for an integration logo so that
 * monochrome assets remain visible in both light and dark themes.
 */
export function getIntegrationLogoClasses(providerId: string, baseClasses = 'w-6 h-6 object-contain') {
  const classes = [baseClasses.trim()]

  if (LIGHT_MODE_INVERT.has(providerId)) {
    // In light mode, invert the logo (make white logos black)
    // In dark mode, don't invert (keep white logos white)
    // Using dark:brightness-100 to ensure logos are visible in dark mode
    classes.push('brightness-0', 'dark:brightness-100')
  }

  if (DARK_MODE_INVERT.has(providerId)) {
    // In dark mode, invert the logo (make black logos white)
    classes.push('dark:brightness-0', 'dark:invert')
  }

  return classes.join(' ')
}
