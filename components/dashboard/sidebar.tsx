"use client"

import Link from "next/link"
import { LogoSVG } from "@/components/shared/LogoSVG"
import { UpsellBadge } from "@/components/shared/UpsellBadge"
import { useCurrentClient } from "@/lib/hooks/use-current-client"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import type { PlanCode } from "@/lib/types"
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

interface NavItem {
  name: string
  href: string
  icon: typeof LayoutDashboard
  /** Plan code required to use this item. Items above the user's plan show an upsell badge. */
  requires?: PlanCode
  /** Override the upsell label (e.g. "Twilio") — defaults to "Upgrade to <Plan>". */
  upsellLabel?: string
  /** If true, locked clicks redirect to /#pricing (use when no real page yet). */
  stubOnly?: boolean
}

const navigation: NavItem[] = [
  { name: "Dashboard",      href: "/dashboard",                icon: LayoutDashboard },
  { name: "Upload Call",    href: "/dashboard/upload",         icon: Upload },
  { name: "Auto-ingestion", href: "/dashboard/upload?source=twilio", icon: Upload, requires: "pro",     upsellLabel: "Pro · Twilio", stubOnly: true },
  { name: "History",        href: "/dashboard/history",        icon: History },
  { name: "Analytics",      href: "/dashboard/analytics",      icon: BarChart3 },
  { name: "Insights",       href: "/dashboard/insights",       icon: Brain },
  { name: "Knowledge Base", href: "/dashboard/insights?rag=1", icon: Brain,  requires: "pro_rag", upsellLabel: "Pro + RAG", stubOnly: true },
  { name: "Script Builder", href: "/dashboard/script-builder", icon: Wand2,  requires: "pro",     upsellLabel: "Pro" },
  { name: "Rubric",         href: "/dashboard/settings",       icon: Settings },
  { name: "How to Use",     href: "/dashboard/guide",          icon: HelpCircle },
]

const PLAN_RANK: Record<PlanCode, number> = { starter: 0, pro: 1, pro_rag: 2 }

function isLocked(currentPlan: PlanCode | undefined, requires: PlanCode | undefined): boolean {
  if (!requires) return false
  if (!currentPlan) return true
  return PLAN_RANK[currentPlan] < PLAN_RANK[requires]
}

export function DashboardSidebar() {
  const pathname = usePathname()
  const { client } = useCurrentClient()
  const currentPlan = client?.plan.code
  const planLabel = client?.plan.name ?? "Starter"

  // Skip mobile nav items that are plan-locked (avoid clutter on small screens)
  const mobileItems = navigation.filter((item) => !isLocked(currentPlan, item.requires))

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
                    const locked = isLocked(currentPlan, item.requires)
                    // Locked + stubOnly → redirect to pricing. Locked but a
                    // real page exists (e.g. Script Builder) → still navigate
                    // so the page can render its own upsell card.
                    const linkHref = locked && item.stubOnly ? "/#pricing" : item.href
                    const isActive =
                      !locked &&
                      (pathname === item.href ||
                        (item.href !== "/dashboard" &&
                          pathname.startsWith(item.href.split("?")[0])))
                    return (
                      <li key={item.name}>
                        <Link
                          href={linkHref}
                          aria-disabled={locked && item.stubOnly}
                          title={locked ? `Requires ${item.requires === 'pro_rag' ? 'Pro + RAG' : 'Pro'}` : undefined}
                          className={cn(
                            "group flex items-center justify-between gap-x-3 rounded-md p-2 text-sm font-medium leading-6 transition-colors",
                            isActive
                              ? "bg-primary text-primary-foreground"
                              : locked
                              ? "text-muted-foreground/70 hover:bg-secondary/50"
                              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                          )}
                        >
                          <span className="flex items-center gap-x-3 min-w-0">
                            <item.icon
                              className={cn(
                                "h-5 w-5 shrink-0",
                                isActive
                                  ? "text-primary-foreground"
                                  : "text-muted-foreground group-hover:text-foreground"
                              )}
                            />
                            <span className="truncate">{item.name}</span>
                          </span>
                          {locked && item.requires && (
                            <UpsellBadge requires={item.requires} label={item.upsellLabel} compact />
                          )}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </li>
              <li className="mt-auto">
                <div className="rounded-md border border-border bg-secondary/50 p-3">
                  <p className="text-xs text-muted-foreground">Current plan</p>
                  <p className="text-sm font-medium">{planLabel}</p>
                  {currentPlan !== "pro_rag" && (
                    <Link
                      href="/#pricing"
                      className="mt-2 inline-block text-[11px] font-medium text-primary hover:underline"
                    >
                      Upgrade →
                    </Link>
                  )}
                </div>
              </li>
            </ul>
          </nav>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card lg:hidden">
        <nav className="flex justify-around p-2">
          {mobileItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/dashboard" && pathname.startsWith(item.href.split("?")[0]))
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
