"use client"

import { usePathname } from "next/navigation"
import Link from "next/link"
import { ChevronRight, Home } from "lucide-react"
import { cn } from "@/lib/utils"

interface BreadcrumbItem {
  label: string
  href?: string
  icon?: React.ReactNode
}

interface BreadcrumbsProps {
  /** Override automatic breadcrumbs with custom items */
  items?: BreadcrumbItem[]
  /** Additional class name */
  className?: string
  /** Show home icon as first item */
  showHome?: boolean
  /** Custom separator */
  separator?: React.ReactNode
}

// Route label mappings for automatic breadcrumb generation
const ROUTE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  workflows: "Workflows",
  templates: "Templates",
  integrations: "Integrations",
  settings: "Settings",
  analytics: "Analytics",
  builder: "Builder",
  new: "New",
  edit: "Edit",
  billing: "Billing",
  profile: "Profile",
  security: "Security",
  notifications: "Notifications",
  "api-keys": "API Keys",
  "ai-assistant": "AI Assistant",
  team: "Team",
}

/**
 * Breadcrumb navigation component
 *
 * Automatically generates breadcrumbs from the current path,
 * or accepts custom items for more control.
 *
 * Features:
 * - Automatic path parsing
 * - Custom item support
 * - Keyboard accessible
 * - Screen reader friendly
 */
export function Breadcrumbs({
  items,
  className,
  showHome = true,
  separator,
}: BreadcrumbsProps) {
  const pathname = usePathname()

  // Generate breadcrumbs from pathname if no custom items provided
  const breadcrumbs: BreadcrumbItem[] = items || generateBreadcrumbs(pathname)

  // Add home if requested
  const allItems = showHome
    ? [{ label: "Home", href: "/dashboard", icon: <Home className="w-4 h-4" /> }, ...breadcrumbs]
    : breadcrumbs

  if (allItems.length <= 1) {
    return null // Don't show breadcrumbs for single-level pages
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn("flex items-center text-sm", className)}
    >
      <ol className="flex items-center gap-1.5">
        {allItems.map((item, index) => {
          const isLast = index === allItems.length - 1

          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
              {/* Separator */}
              {index > 0 && (
                <span className="text-muted-foreground" aria-hidden="true">
                  {separator || <ChevronRight className="w-4 h-4" />}
                </span>
              )}

              {/* Breadcrumb Item */}
              {isLast ? (
                <span
                  className="flex items-center gap-1.5 font-medium text-foreground"
                  aria-current="page"
                >
                  {item.icon}
                  {item.label}
                </span>
              ) : item.href ? (
                <Link
                  href={item.href}
                  className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {item.icon}
                  {item.label}
                </Link>
              ) : (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  {item.icon}
                  {item.label}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/**
 * Generate breadcrumb items from a pathname
 */
function generateBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const segments = pathname.split("/").filter(Boolean)
  const items: BreadcrumbItem[] = []

  let currentPath = ""

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    currentPath += `/${segment}`

    // Skip UUIDs (workflow IDs, etc.)
    if (isUUID(segment)) {
      continue
    }

    // Get label from mapping or capitalize segment
    const label = ROUTE_LABELS[segment] || capitalizeWords(segment.replace(/-/g, " "))

    // Don't add link for the last item
    const isLast = i === segments.length - 1 || (i < segments.length - 1 && isUUID(segments[i + 1]))

    items.push({
      label,
      href: isLast ? undefined : currentPath,
    })
  }

  return items
}

/**
 * Check if a string is a UUID
 */
function isUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(str)
}

/**
 * Capitalize each word in a string
 */
function capitalizeWords(str: string): string {
  return str
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
}

/**
 * Compact breadcrumb variant for limited space
 */
export function CompactBreadcrumbs({
  items,
  className,
}: {
  items?: BreadcrumbItem[]
  className?: string
}) {
  const pathname = usePathname()
  const breadcrumbs = items || generateBreadcrumbs(pathname)

  if (breadcrumbs.length <= 1) {
    return null
  }

  // Show only last 2 items for compact view
  const visibleItems = breadcrumbs.slice(-2)
  const hasMore = breadcrumbs.length > 2

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn("flex items-center text-sm", className)}
    >
      <ol className="flex items-center gap-1">
        {hasMore && (
          <>
            <li className="text-muted-foreground">...</li>
            <li className="text-muted-foreground" aria-hidden="true">
              <ChevronRight className="w-3.5 h-3.5" />
            </li>
          </>
        )}
        {visibleItems.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-1">
            {index > 0 && (
              <span className="text-muted-foreground" aria-hidden="true">
                <ChevronRight className="w-3.5 h-3.5" />
              </span>
            )}
            {index === visibleItems.length - 1 ? (
              <span className="font-medium" aria-current="page">
                {item.label}
              </span>
            ) : item.href ? (
              <Link
                href={item.href}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                {item.label}
              </Link>
            ) : (
              <span className="text-muted-foreground">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
