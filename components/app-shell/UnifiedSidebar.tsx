"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { useAuthStore } from "@/stores/authStore"
import { isProfileAdmin } from "@/lib/types/admin"
import { useSidebarState } from "@/hooks/useSidebarState"
import { getNavSections, getActiveSectionId } from "@/lib/navigation/nav-config"
import { WorkspaceSelectionModal } from "@/components/workflows/WorkspaceSelectionModal"
import { useWorkflowCreation } from "@/hooks/useWorkflowCreation"
import { IconRail } from "./IconRail"
import { NavPanel } from "./NavPanel"

export function UnifiedSidebar() {
  const pathname = usePathname()
  const { profile } = useAuthStore()
  const { isPanelOpen, activeSection, setActiveSection, setPanelOpen } = useSidebarState()
  const [isMounted, setIsMounted] = useState(false)

  const {
    showWorkspaceModal,
    handleWorkspaceSelected,
    handleCancelWorkspaceSelection,
  } = useWorkflowCreation()

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const isAdmin = profile ? isProfileAdmin(profile as any) : false
  const sections = getNavSections(isAdmin)

  // Derive active section from pathname
  useEffect(() => {
    if (!pathname) return
    const derivedSection = getActiveSectionId(pathname, sections)
    if (derivedSection && derivedSection !== activeSection) {
      setActiveSection(derivedSection)
    }
  }, [pathname, sections, activeSection, setActiveSection])

  const currentSection = sections.find((s) => s.id === activeSection) ?? null

  const handleSectionClick = (sectionId: string) => {
    if (sectionId === activeSection) {
      setPanelOpen(!isPanelOpen)
    } else {
      setActiveSection(sectionId)
      setPanelOpen(true)
    }
  }

  // Prevent hydration mismatch
  if (!isMounted) {
    return <div className="flex h-full w-[84px] bg-orange-500 shrink-0" />
  }

  return (
    <>
      <div className="flex h-full shrink-0">
        <IconRail
          sections={sections}
          activeSection={activeSection}
          onSectionClick={handleSectionClick}
        />
        <NavPanel
          section={currentSection}
          isPanelOpen={isPanelOpen}
          onClose={() => setPanelOpen(false)}
        />
      </div>

      <WorkspaceSelectionModal
        open={showWorkspaceModal}
        onOpenChange={(open) => { if (!open) handleCancelWorkspaceSelection() }}
        onWorkspaceSelected={handleWorkspaceSelected}
        onCancel={handleCancelWorkspaceSelection}
      />
    </>
  )
}
