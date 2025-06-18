"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard,
  Workflow,
  Puzzle,
  BarChart3,
  Settings,
  Building2,
  Shield,
  Users,
  Code,
  GraduationCap,
  X,
} from "lucide-react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface SidebarProps {
  isMobileMenuOpen: boolean
  onMobileMenuChange: (isOpen: boolean) => void
}

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Workflows", href: "/workflows", icon: Workflow },
  { name: "Integrations", href: "/integrations", icon: Puzzle },
  { name: "Analytics", href: "/analytics", icon: BarChart3 },
  { name: "Teams", href: "/teams", icon: Building2 },
  { name: "Learn", href: "/learn", icon: GraduationCap },
  { name: "Community", href: "/community", icon: Users },
  { name: "Developer", href: "/developer", icon: Code },
  { name: "Enterprise", href: "/enterprise", icon: Shield },
  { name: "Settings", href: "/settings", icon: Settings },
]

export default function Sidebar({ isMobileMenuOpen, onMobileMenuChange }: SidebarProps) {
  const pathname = usePathname()

  return (
    <div
      className={cn(
        "fixed inset-y-0 left-0 w-64 bg-white border-r border-slate-200 flex flex-col transition-transform duration-200 ease-in-out z-50",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}
    >
      {/* Logo */}
      <div className="p-6 border-b border-slate-200 flex items-center justify-between">
        <Link href="/" className="flex items-center space-x-2">
          <Image src="/logo_transparent.png" alt="ChainReact Logo" width={32} height={32} className="w-8 h-8" />
          <span className="text-xl font-bold text-slate-900">ChainReact</span>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => onMobileMenuChange(false)}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => onMobileMenuChange(false)}
              className={cn(
                "flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200",
                isActive
                  ? "bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-lg"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.name}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
