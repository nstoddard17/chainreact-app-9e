# PageAccessGuard Implementation Guide

## Overview

The `PageAccessGuard` component provides plan-based access control for protected pages. When a user doesn't have the required plan, it shows an upgrade modal overlay that:

1. **Blurs the page content** - Shows a preview of what the user would see
2. **Displays a centered upgrade card** - Within the main content area only
3. **Keeps navigation functional** - Sidebar, header, and footer remain visible and usable

## Visual Behavior

```
┌─────────────────────────────────────────────────────────────┐
│                        HEADER                               │  ← NOT blurred, fully functional
├──────────┬──────────────────────────────────────────────────┤
│          │                                                  │
│          │     ┌─────────────────────────────┐              │
│          │     │                             │              │
│ SIDEBAR  │     │    UPGRADE MODAL CARD       │              │  ← Modal centered in main area
│          │     │                             │              │
│  (not    │     └─────────────────────────────┘              │
│ blurred) │                                                  │
│          │        (blurred content behind)                  │  ← Only main content is blurred
│          │                                                  │
├──────────┴──────────────────────────────────────────────────┤
│                        FOOTER                               │  ← NOT blurred, fully functional
└─────────────────────────────────────────────────────────────┘
```

## Implementation Details

### PageAccessGuard Component

Location: `components/common/PageAccessGuard.tsx`

The component wraps protected page content and checks:
1. User's plan tier (free, pro, business, enterprise)
2. Admin status (admins bypass all restrictions)
3. Beta plan mapping (beta/beta-pro → pro)

When access is denied, it renders:
```tsx
<div className="relative h-full w-full">
  {/* Blurred content */}
  <div className="h-full w-full blur-sm pointer-events-none select-none">
    {children}
  </div>

  {/* Modal overlay - ONLY covers main content area */}
  <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[2px] z-10">
    {/* Upgrade card */}
  </div>
</div>
```

### Critical CSS Requirements

**The parent `<main>` element MUST have `position: relative`** for the absolute positioning to work correctly.

Without `relative` on the parent, `absolute inset-0` will escape to a higher positioned ancestor, causing the modal to cover the entire screen.

### Layout Integration

#### For NewAppLayout (most pages)

Location: `components/new-design/layout/NewAppLayout.tsx`

```tsx
<main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950 relative">
  {children}
</main>
```

#### For Custom Layouts (e.g., AI Assistant)

Any page with a custom layout must ensure the `<main>` element has `relative`:

```tsx
<main className="flex-1 overflow-hidden relative">
  <PageAccessGuard page="ai-assistant">
    {/* content */}
  </PageAccessGuard>
</main>
```

## Page Configuration

### Plan Requirements

Defined in `lib/utils/plan-restrictions.ts`:

| Page | Required Plan | Price |
|------|---------------|-------|
| AI Assistant | Pro | $19/mo |
| Analytics | Pro | $19/mo |
| Teams | Business | $99/mo |
| Organization | Enterprise | Custom |

### Middleware Configuration

The middleware (`middleware.ts`) must allow free users to reach these pages so they can see the upgrade modal:

```typescript
const pageAccessRules = {
  '/analytics': ['free', 'pro', 'beta-pro', 'business', 'enterprise', 'admin'],
  '/teams': ['free', 'pro', 'beta-pro', 'business', 'enterprise', 'admin'],
  '/organization': ['free', 'pro', 'beta-pro', 'business', 'enterprise', 'admin'],
  '/ai-assistant': ['free', 'pro', 'beta-pro', 'business', 'enterprise', 'admin'],
  // ...
}
```

**Important:** If middleware redirects users away, they'll never see the PageAccessGuard upgrade modal.

## Testing

Add `?forceUpgradeModal=true` to any protected page URL to force the upgrade modal to appear, even for admins or users with access:

```
http://localhost:3000/analytics?forceUpgradeModal=true
http://localhost:3000/teams?forceUpgradeModal=true
```

## Usage Example

```tsx
// app/analytics/page.tsx
import { NewAppLayout } from "@/components/new-design/layout/NewAppLayout"
import { PageAccessGuard } from "@/components/common/PageAccessGuard"
import { AnalyticsContent } from "@/components/new-design/AnalyticsContent"

export default function AnalyticsPage() {
  return (
    <NewAppLayout title="Analytics" subtitle="Monitor your workflow performance">
      <PageAccessGuard page="analytics">
        <AnalyticsContent />
      </PageAccessGuard>
    </NewAppLayout>
  )
}
```

## Common Issues

### Modal covers entire screen
**Cause:** Parent `<main>` element missing `position: relative`
**Fix:** Add `relative` class to the `<main>` element

### Modal not showing for free users
**Cause:** Middleware redirecting users away before PageAccessGuard renders
**Fix:** Update middleware to allow 'free' plan to access the page

### Double upgrade modals
**Cause:** Both PageAccessGuard and a component-level LockedPage wrapper
**Fix:** Remove the inner LockedPage wrapper; let PageAccessGuard handle page-level access

## Files Modified

- `components/common/PageAccessGuard.tsx` - Main access guard component
- `components/new-design/layout/NewAppLayout.tsx` - Added `relative` to `<main>`
- `app/ai-assistant/page.tsx` - Added `relative` to custom layout's `<main>`
- `middleware.ts` - Allow free users to reach protected pages
- `lib/utils/plan-restrictions.ts` - Plan requirements configuration

## Related Documentation

- `/learning/docs/modal-column-overflow-solution.md` - Modal styling patterns
- `/learning/docs/pricing-strategy-analysis.md` - Plan tier information
