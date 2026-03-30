'use client'

// Unified header — used across all authenticated routes
import type React from 'react'
import { useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { LogOut, Menu } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { LogoSVG } from '@/components/shared/LogoSVG'

interface AppHeaderProps {
  /** Nav items rendered inside the mobile Sheet drawer */
  mobileSidebar?: React.ReactNode
  /**
   * When provided, renders a page title in the left slot instead of the
   * AskMoses logo. Also accepts a map of { pathname → title } so the header
   * can resolve the active title automatically (used by /dashboard/*).
   */
  pageTitle?: string | Record<string, string>
}

export function AppHeader({ mobileSidebar, pageTitle }: AppHeaderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    document.cookie = 'demo-role=; path=/; max-age=0'
    document.cookie = 'demo-trainer-id=; path=/; max-age=0'
    router.push('/login')
  }

  // Resolve title — string literal or pathname map
  const resolvedTitle =
    typeof pageTitle === 'string'
      ? pageTitle
      : typeof pageTitle === 'object'
        ? pageTitle[pathname] ?? 'Dashboard'
        : null

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 md:px-8 h-[61px] border-b"
      style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
    >
      {/* ── Left ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2.5">
        {/* Mobile hamburger — only when mobileSidebar is provided */}
        {mobileSidebar && (
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                className="lg:hidden p-1.5 rounded-md transition-opacity hover:opacity-70"
                style={{ color: 'var(--am-muted)' }}
                aria-label="Open menu"
              >
                <Menu size={20} />
              </button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className="w-56 p-0 !bg-[var(--am-bg2)] border-r !border-[var(--am-border)]"
            >
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="pt-6 px-3" onClick={() => setOpen(false)}>
                {mobileSidebar}
              </div>
            </SheetContent>
          </Sheet>
        )}

        {/* Logo — always visible */}
        <LogoSVG className="h-14 w-auto" />

        {/* Page title — shown alongside logo when in dashboard mode */}
        {resolvedTitle && (
          <>
            <span className="w-px h-5 mx-1" style={{ background: 'var(--am-border2)' }} />
            <h1 className="text-sm font-semibold" style={{ color: 'var(--am-text)' }}>
              {resolvedTitle}
            </h1>
          </>
        )}
      </div>

      {/* ── Right ────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 md:gap-4">
        {!resolvedTitle && (
          <>
            <span
              className="hidden sm:inline text-xs px-3 py-1 rounded-full font-mono border"
              style={{
                background: 'var(--am-bg4)',
                borderColor: 'var(--am-border2)',
                color: 'var(--am-muted)',
              }}
            >
              Week 6 / 6
            </span>
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              title="Live"
              style={{
                background: 'var(--am-green)',
                boxShadow: '0 0 8px var(--am-green)',
                animation: 'am-pulse 2s infinite',
              }}
            />
          </>
        )}

        {resolvedTitle && (
          <span className="hidden text-sm sm:block" style={{ color: 'var(--am-muted)' }}>
            Unleashed Consulting
          </span>
        )}

        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <button
            onClick={handleLogout}
            aria-label="Sign out"
            title="Sign out"
            className="am-theme-toggle"
            style={{
              background: 'var(--am-bg3)',
              border: '1px solid var(--am-border2)',
              color: 'var(--am-muted)',
              borderRadius: '8px',
              width: '34px',
              height: '34px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'color 0.2s, background 0.2s',
              flexShrink: 0,
            }}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  )
}
