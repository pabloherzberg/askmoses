import type React from "react"
import { AppHeader } from "@/components/layout/AppHeader"
import { AppSidebar, NavItemsForRole } from "@/components/layout/AppSidebar"
import { PendingScriptBadgeServer } from "@/components/layout/PendingScriptBadgeServer"
import { FeatureGate } from "@/components/shared/FeatureGate"
import { getActiveOrgContext } from "@/lib/auth"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getActiveOrgContext()
  const role = ctx?.role ?? null
  const isImpersonating = ctx?.isImpersonating ?? false

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <AppHeader
        mobileSidebar={<NavItemsForRole role={role} isImpersonating={isImpersonating} />}
        pendingBadge={<PendingScriptBadgeServer />}
      />
      <div className="flex">
        <AppSidebar role={role} isImpersonating={isImpersonating} />
        <main className="flex-1 min-w-0 lg:pl-56 pt-[calc(61px+var(--impersonate-banner-h,0px))]">
          <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-6 md:py-7">
            <FeatureGate>{children}</FeatureGate>
          </div>
        </main>
      </div>
    </div>
  )
}
