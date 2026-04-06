"use client"

import Image from "next/image"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import type { NavSection } from "@/lib/navigation/nav-config"

interface IconRailProps {
  sections: NavSection[]
  activeSection: string | null
  onSectionClick: (sectionId: string) => void
}

export function IconRail({ sections, activeSection, onSectionClick }: IconRailProps) {
  const router = useRouter()

  const handleSectionClick = (section: NavSection) => {
    onSectionClick(section.id)
    router.push(section.href)
  }

  // Separate admin section for special styling
  const mainSections = sections.filter((s) => s.id !== "admin")
  const adminSection = sections.find((s) => s.id === "admin")

  return (
    <div className="flex flex-col h-full w-[84px] bg-gradient-to-b from-orange-500 via-orange-600 to-orange-800 dark:from-orange-700 dark:via-orange-800 dark:to-orange-950 border-r border-orange-600/30 dark:border-orange-900/50 shrink-0">
      {/* Logo */}
      <div className="flex items-center justify-center h-16 border-b border-white/10">
        <button
          onClick={() => router.push("/workflows")}
          className="hover:opacity-80 transition-opacity"
        >
          <Image
            src="/logo_transparent.png"
            alt="ChainReact"
            width={34}
            height={34}
            className="brightness-0 invert"
          />
        </button>
      </div>

      {/* Section icons with labels */}
      <nav className="flex-1 flex flex-col items-center py-3 gap-1 overflow-y-auto">
        {mainSections.map((section) => {
          const Icon = section.icon
          const isActive = activeSection === section.id

          return (
            <button
              key={section.id}
              onClick={() => handleSectionClick(section)}
              className={cn(
                "relative flex flex-col items-center justify-center w-[72px] py-2 rounded-lg transition-colors gap-1",
                isActive
                  ? "bg-white/20 text-white"
                  : "text-white/70 hover:text-white hover:bg-white/10"
              )}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-6 bg-white rounded-r-full" />
              )}
              <Icon className="h-5 w-5" />
              <span className="text-[11px] font-medium leading-tight">{section.label}</span>
            </button>
          )
        })}

        {/* Admin section */}
        {adminSection && (
          <>
            <div className="w-10 border-t border-white/15 my-1.5" />
            <button
              onClick={() => handleSectionClick(adminSection)}
              className={cn(
                "relative flex flex-col items-center justify-center w-[72px] py-2 rounded-lg transition-colors gap-1",
                activeSection === adminSection.id
                  ? "bg-white/20 text-white"
                  : "text-white/70 hover:text-white hover:bg-white/10"
              )}
            >
              {activeSection === adminSection.id && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-6 bg-white rounded-r-full" />
              )}
              <adminSection.icon className="h-5 w-5" />
              <span className="text-[11px] font-medium leading-tight">{adminSection.label}</span>
            </button>
          </>
        )}
      </nav>
    </div>
  )
}
