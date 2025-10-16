# Logo Display in Light/Dark Mode Fix

## Problem
Users reported that several integration logos were not displaying correctly in light mode:
- Notion appeared as just a black square box
- Google Docs appeared as a black and white piece of paper
- Outlook showed as a simple envelope icon
- OneNote displayed incorrectly
- X (Twitter) logo was blank

## Root Cause Analysis

### Investigation Process
1. Initially tried using Tailwind CSS classes for inversion (`filter invert dark:invert-0`)
2. When that didn't work, switched to inline styles with JavaScript control
3. Discovered that applying `brightness(0)` filter to all "white" logos was too simplistic

### Actual Issues Found

1. **Multi-color logos (Notion)**: The Notion SVG contains both white (#fff) and black (#000) fill colors. When `brightness(0)` was applied, both colors became black, making it appear as just a black box.

2. **Monochrome white logos (Google Docs)**: The original Google Docs SVG was entirely white. While `brightness(0)` correctly made it black for light mode, it looked wrong as just a black document shape.

3. **Placeholder icons (Outlook, OneNote)**: These were using simple placeholder SVGs instead of proper brand logos:
   - Outlook: Simple envelope icon
   - OneNote: Basic notebook icon

## Solution

### 1. Categorize Logo Types
We identified three categories of logos:
- **Pure white monochrome logos**: Need inversion in light mode (Airtable, GitHub, X)
- **Multi-color logos**: Should never be inverted (Notion)
- **Colored logos**: Already have proper colors, no inversion needed (Google services, Microsoft services)

### 2. Update Inversion Logic
```typescript
const needsInvert = (providerId: string) => {
  // Only invert truly monochrome white logos
  const whiteLogs = ['airtable', 'github', 'x']
  return whiteLogs.includes(providerId)
}
```

### 3. Create Proper Colored Logos
Instead of relying on filters, we created properly colored SVG logos:

**Google Docs** - Blue document with white text lines:
```svg
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6z" fill="#4285F4"/>
  <path d="M14 2v6h6" fill="#A1C2FA"/>
  <path d="M8 13h8M8 17h5" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>
</svg>
```

**Microsoft Outlook** - Blue circular logo:
```svg
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10h8c1.1 0 2-.9 2-2V12c0-5.52-4.48-10-10-10z" fill="#0078D4"/>
  <!-- Additional paths for detail -->
</svg>
```

**Microsoft OneNote** - Purple notebook with white lines:
```svg
<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" fill="#7719AA"/>
  <path d="M7 7h10v2H7zm0 3h10v2H7zm0 3h7v2H7z" fill="#fff"/>
</svg>
```

## Key Learnings

1. **Don't apply blanket filters**: CSS filters like `brightness(0)` affect all colors in an SVG, which breaks multi-color logos.

2. **Inspect SVG structure**: Always check the actual SVG content to understand its color structure before applying transformations.

3. **Prefer colored logos**: Instead of relying on CSS filters to transform white logos, use properly colored SVG files that work in both light and dark modes.

4. **Test in both themes**: Always verify logo appearance in both light and dark modes after making changes.

## Files Changed
- `/components/homepage/IntegrationsShowcase.tsx` - Updated inversion logic
- `/lib/integrations/logoStyles.ts` - Updated LIGHT_MODE_INVERT set
- `/public/integrations/google-docs.svg` - Created proper colored logo
- `/public/integrations/microsoft-outlook.svg` - Created proper colored logo
- `/public/integrations/microsoft-onenote.svg` - Created proper colored logo

## Future Considerations
- Consider maintaining separate light/dark logo versions for complex brands
- Use SVGs with CSS variables for theme-aware colors
- Document which logos need special handling in the codebase

## Additional UI Improvements (Integration Cards)

### Problem
- Integration cards appeared too blocky and didn't blend well with the page
- Animation had visible stops/restarts instead of being seamless

### Solution Implemented

1. **Softer Card Appearance**:
   - Changed from `bg-white dark:bg-slate-900/50` to `bg-white/60 dark:bg-slate-900/20` for more transparency
   - Reduced border opacity: `border-gray-200/30 dark:border-white/5`
   - Changed from `rounded-xl` to `rounded-2xl` for softer corners
   - Removed shadow, using `backdrop-blur-sm` for modern glass effect

2. **Better Edge Blending**:
   - Increased fade gradient width from `w-32` to `w-40`
   - Added intermediate opacity steps in gradient for smoother fade

3. **Seamless Animation**:
   - Changed from percentage-based movement with loop restart to continuous flow
   - First row: Moves from 0 to -33.33% (exactly 1/3 since we have 3 copies)
   - Second row: Moves from -33.33% to 0 for opposite direction
   - Removed `repeatType: 'loop'` to prevent jump on restart
   - Increased duration for smoother motion (60s and 65s)