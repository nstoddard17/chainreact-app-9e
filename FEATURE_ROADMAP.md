# ChainReact Feature Roadmap

This document tracks all planned improvements to make ChainReact a world-class workflow automation platform.

**Last Updated:** 2025-02-10

---

## Status Legend
- ✅ **Done** - Implemented and tested
- 🚧 **In Progress** - Currently being worked on
- 📋 **Planned** - Approved, ready to build
- 💡 **Idea** - Under consideration

---

## 🔥 HIGH PRIORITY - Quick Wins

| # | Feature | Description | Status | Notes |
|---|---------|-------------|--------|-------|
| 1 | **Command Palette (Cmd+K)** | Global search for workflows, templates, apps, actions | ✅ Done | Accessible via Cmd+K or search button |
| 2 | **Onboarding Checklist** | Dashboard widget showing setup progress | ✅ Done | Connect app → Create workflow → Test → Activate |
| 3 | **Workflow Status Badges** | Visual indicators (🟢 Active / 🟡 Warning / 🔴 Error) | ✅ Done | WorkflowStatusBadge component |
| 4 | **First-Action Celebrations** | Toast notifications for milestones | ✅ Done | useCelebrations hook with confetti |
| 5 | **Bulk Action Bar** | Floating toolbar when items selected | ✅ Done | FloatingActionBar component at bottom of screen |
| 6 | **Enhanced Empty States** | Illustrations + CTAs for empty views | ✅ Done | EnhancedEmptyState component with variants |
| 7 | **Save Workflow as Template** | One-click convert workflow to reusable template | ✅ Done | In workflow builder dropdown menu |
| 8 | **Template/Workflow Team Sharing** | Share templates with teams/orgs | ✅ Done | Tab-based sharing dialog |

---

## ⭐ MEDIUM PRIORITY - Core Improvements

| # | Feature | Description | Status | Notes |
|---|---------|-------------|--------|-------|
| 9 | **Advanced Workflow Filters** | Filter by status, date, owner + saved presets | ✅ Done | AdvancedFilters component with saved presets |
| 10 | **Keyboard Shortcuts** | `d` duplicate, `delete` delete, `e` edit, `n` new | ✅ Done | useKeyboardShortcuts hook + help dialog |
| 11 | **App Categories** | Group integrations by type | ✅ Done | AppCategoryFilter component with filter chips |
| 12 | **Recent/Favorites** | Pin workflows, "Recently Opened" section | ✅ Done | useWorkflowFavorites hook + RecentFavorites component |
| 13 | **Notification Bell** | In-app notifications | ✅ Done | NotificationDropdown component with API |
| 14 | **API Keys Page** | Personal access token management | ✅ Done | ApiKeysSection component with API |
| 15 | **Workflow Execution History** | Per-workflow execution log with details | ✅ Done | ExecutionHistory + ExecutionHistoryWidget |
| 16 | **Integration Health Dashboard** | Status overview for all connected apps | ✅ Done | IntegrationHealthDashboard + widget |

---

## ✨ POLISH - Nice to Have

| # | Feature | Description | Status | Notes |
|---|---------|-------------|--------|-------|
| 17 | **Collapsible Sidebar** | Collapse to icons for more workspace | ✅ Done | useSidebarState hook + toggle button |
| 18 | **Template Popularity** | Show "Most Used", difficulty badges | ✅ Done | TemplatePopularityBadge component + sorting |
| 19 | **Interactive Onboarding Tour** | Step-by-step product walkthrough | ✅ Done | OnboardingTour component + WelcomeBanner |
| 20 | **Workflow Tags/Labels** | Custom tags beyond folders | ✅ Done | WorkflowTagBadge + TagFilter components |
| 21 | **Session Management** | View/revoke active sessions | ✅ Done | SessionManagement component in security settings |
| 22 | **Better Error Recovery** | Retry buttons, specific guidance | ✅ Done | ErrorRecovery + InlineError components |
| 23 | **Workflow Versioning** | Save/restore workflow versions | 💡 Idea | Like git for workflows |
| 24 | **Workflow Comments** | Add notes to nodes/workflows | 💡 Idea | Team collaboration |
| 25 | **Scheduled Reports** | Email weekly/monthly analytics | 💡 Idea | Pro feature |

---

## 🔒 TIER-RESTRICTED PAGES

Pages that require higher plan tiers use the `LockedPage` component:

| Page | Required Tier | Status |
|------|---------------|--------|
| Analytics | Team+ | ✅ Done |
| (Add more as needed) | | |

---

## 📊 Already Implemented (Strong Foundations)

These features are already working well:

- ✅ Folder organization for workflows
- ✅ List/Grid view toggle
- ✅ Dark mode support
- ✅ PagePreloader pattern (loading states)
- ✅ EmptyStateCard component
- ✅ Plan restrictions system (`LockedPage`, `LockedFeature`)
- ✅ Route prefetching for performance
- ✅ Bulk actions (delete, move, duplicate)
- ✅ Workflow sharing (individual)
- ✅ Team invitations
- ✅ Multi-workspace support
- ✅ AI Agent for workflow building

---

## 🛠️ Implementation Notes

### Save as Template Feature
- Add "Save as Template" button to workflow builder
- Allow user to set: name, description, category, visibility (private/team/public)
- Strip user-specific data (integration IDs, personal info)
- Store in `workflow_templates` table with `created_by` reference

### Template/Workflow Team Sharing
- Add workspace selector when sharing templates
- Allow sharing with: Personal, Teams, Organizations
- Add "Shared with me" section to templates page
- Respect plan restrictions (team sharing requires Team+ plan)

### Command Palette
- Trigger: `Cmd+K` / `Ctrl+K`
- Search: Workflows, Templates, Apps, Settings, Actions
- Recent items shown by default
- Keyboard navigation (arrow keys, enter)

---

## 📅 Suggested Build Order

### Phase 1 (Current Sprint)
1. ✅ Analytics page tier restriction
2. ✅ Save Workflow as Template
3. ✅ Template/Workflow Team Sharing
4. ✅ Command Palette (Cmd+K)

### Phase 2 (Current Sprint)
5. ✅ Onboarding Checklist
6. ✅ Workflow Status Badges
7. ✅ Keyboard Shortcuts
8. ✅ Bulk Action Bar

### Phase 3 (Completed)
9. ✅ Advanced Filters
10. ✅ Recent/Favorites
11. ✅ App Categories
12. ✅ Notification Bell (already existed)

---

## 📝 Changelog

### 2026-02-10
- Created feature roadmap document
- Implemented `LockedPage` component for tier restrictions
- Added tier restriction to Analytics page
- Implemented Save as Template feature (SaveAsTemplateDialog.tsx)
- Added team sharing to ShareWorkflowDialog with tabs
- Command Palette already existed and is fully functional
- Implemented Onboarding Checklist component for dashboard sidebar
- Created WorkflowStatusBadge component with validation
- Added useKeyboardShortcuts hook + KeyboardShortcutsHelp dialog
- Created FloatingActionBar for bulk actions on workflows
- Created AdvancedFilters component with saved filter presets
- Implemented Recent/Favorites feature (useWorkflowFavorites hook + RecentFavorites component)
- Added FavoriteButton to workflow list/grid views
- Added RecentFavorites to dashboard sidebar
- Created AppCategoryFilter component for apps page
- Added category filtering to Connect New App dialog
- Notification Bell was already implemented (NotificationDropdown component)
- Created IntegrationHealthDashboard component with widget for dashboard sidebar
- Integration health shows health score, warnings, errors, and proactive issue detection
- Implemented Collapsible Sidebar with useSidebarState hook (Zustand + persist to localStorage)
- Sidebar collapse shows icons only with tooltips for navigation
- Created TemplatePopularityBadge component with "Most Used", "Popular", "Trending", "New" badges
- Added popularity scoring system and sorting options to templates page
- Created Interactive Onboarding Tour with spotlight highlighting and step-by-step walkthrough
- Added WelcomeBanner component for new users with tour start option
- Implemented Workflow Tags/Labels with WorkflowTagBadge, TagManager, and TagFilter components
- Added migration for workflow tags column and tag settings table
- Created useWorkflowTags hook with 18 color options and full CRUD operations
- Implemented Session Management with device info parsing and session revocation
- Added SessionManagement component to Settings > Security page
- Created ErrorRecovery and InlineError components with 8 error types and retry functionality
- Added getErrorType helper for automatic error classification
