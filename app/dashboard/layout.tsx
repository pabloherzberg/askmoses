import type React from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { AppHeader } from "@/components/layout/AppHeader"
import {
  LayoutDashboard,
  Upload,
  History,
  BarChart3,
  Brain,
  Wand2,
  Settings,
  HelpCircle,
} from "lucide-react"
import Link from "next/link"

const pageTitles: Record<string, string> = {
  "/dashboard":                "Dashboard",
  "/dashboard/upload":         "Upload Call",
  "/dashboard/history":        "Call History",
  "/dashboard/analytics":      "Analytics",
  "/dashboard/insights":       "Insights",
  "/dashboard/script-builder": "Script Builder",
  "/dashboard/settings":       "Rubric Settings",
  "/dashboard/guide":          "How to Use",
}

const navigation = [
  { name: "Dashboard",      href: "/dashboard",                icon: LayoutDashboard },
  { name: "Upload Call",    href: "/dashboard/upload",         icon: Upload },
  { name: "History",        href: "/dashboard/history",        icon: History },
  { name: "Analytics",      href: "/dashboard/analytics",      icon: BarChart3 },
  { name: "Insights",       href: "/dashboard/insights",       icon: Brain },
  { name: "Script Builder", href: "/dashboard/script-builder", icon: Wand2 },
  { name: "Rubric",         href: "/dashboard/settings",       icon: Settings },
  { name: "How to Use",     href: "/dashboard/guide",          icon: HelpCircle },
]

function DashboardMobileNav() {
  return (
    <nav className="flex flex-col gap-1">
      {navigation.map(({ name, href, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-opacity hover:opacity-80"
          style={{ color: 'var(--am-muted)' }}
        >
          <Icon size={16} />
          {name}
        </Link>
      ))}
    </nav>
  )
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background">
      <DashboardSidebar />
      <div className="lg:pl-64 pt-[61px]">
        <AppHeader
          mobileSidebar={<DashboardMobileNav />}
          pageTitle={pageTitles}
        />
        <main className="p-6">{children}</main>
      </div>
    </div>
  )
}
