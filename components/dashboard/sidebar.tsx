"use client"

import Link from "next/link"
import { LogoSVG } from "@/components/shared/LogoSVG"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Upload,
  History,
  Settings,
  BarChart3,
  HelpCircle,
  Brain,
  Wand2,
} from "lucide-react"

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Upload Call", href: "/dashboard/upload", icon: Upload },
  { name: "History", href: "/dashboard/history", icon: History },
  { name: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { name: "Insights", href: "/dashboard/insights", icon: Brain },
  { name: "Script Builder", href: "/dashboard/script-builder", icon: Wand2 },
  { name: "Rubric", href: "/dashboard/settings", icon: Settings },
  { name: "How to Use", href: "/dashboard/guide", icon: HelpCircle },
]

export function DashboardSidebar() {
  const pathname = usePathname()

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-64 lg:flex-col">
        <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r border-border bg-card px-6 pb-4">
          <div className="flex h-16 shrink-0 items-center justify-center">
            <LogoSVG width={200} height={60} className="h-14 w-auto" />
          </div>
          <nav className="flex flex-1 flex-col">
            <ul role="list" className="flex flex-1 flex-col gap-y-7">
              <li>
                <ul role="list" className="-mx-2 space-y-1">
                  {navigation.map((item) => {
                    const isActive =
                      pathname === item.href ||
                      (item.href !== "/dashboard" &&
                        pathname.startsWith(item.href))
                    return (
                      <li key={item.name}>
                        <Link
                          href={item.href}
                          className={cn(
                            "group flex gap-x-3 rounded-md p-2 text-sm font-medium leading-6 transition-colors",
                            isActive
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                          )}
                        >
                          <item.icon
                            className={cn(
                              "h-5 w-5 shrink-0",
                              isActive
                                ? "text-primary-foreground"
                                : "text-muted-foreground group-hover:text-foreground"
                            )}
                          />
                          {item.name}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </li>
              <li className="mt-auto">
                <div className="rounded-md border border-border bg-secondary/50 p-3">
                  <p className="text-xs text-muted-foreground">Starter Tier</p>
                  <p className="text-sm font-medium">Manual Upload</p>
                </div>
              </li>
            </ul>
          </nav>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card lg:hidden">
        <nav className="flex justify-around p-2">
          {navigation.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href))
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-md p-2 text-xs transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <item.icon className="h-5 w-5" />
                <span>{item.name}</span>
              </Link>
            )
          })}
        </nav>
      </div>
    </>
  )
}
