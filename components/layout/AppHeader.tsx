'use client'

import type React from 'react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogOut, Menu } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { ThemeToggle } from '@/components/shared/ThemeToggle'

interface AppHeaderProps {
  mobileSidebar?: React.ReactNode
}

export function AppHeader({ mobileSidebar }: AppHeaderProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    document.cookie = 'demo-role=; path=/; max-age=0'
    document.cookie = 'demo-trainer-id=; path=/; max-age=0'
    router.push('/login')
  }

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 md:px-8 h-[61px] border-b"
      style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
    >
      {/* Left: hamburger (mobile only) + logo */}
      <div className="flex items-center gap-2.5">
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
              {/* Radix requires a title for accessibility */}
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="pt-6 px-3" onClick={() => setOpen(false)}>
                {mobileSidebar}
              </div>
            </SheetContent>
          </Sheet>
        )}

        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-base font-semibold text-white font-mono"
            style={{ background: 'var(--am-accent)' }}
          >
            M
          </div>
          <span
            className="text-base font-semibold tracking-tight"
            style={{ color: 'var(--am-text)' }}
          >
            Ask<span style={{ color: 'var(--am-accent2)' }}>Moses</span>.AI
          </span>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-3 md:gap-4">
        <span
          className="hidden sm:inline text-xs px-3 py-1 rounded-full font-mono border"
          style={{
            background:  'var(--am-bg4)',
            borderColor: 'var(--am-border2)',
            color:       'var(--am-muted)',
          }}
        >
          Week 6 / 6
        </span>
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          title="Live"
          style={{
            background: 'var(--am-green)',
            boxShadow:  '0 0 8px var(--am-green)',
            animation:  'am-pulse 2s infinite',
          }}
        />
        <ThemeToggle />
        <button
          onClick={handleLogout}
          className="p-1.5 rounded-md transition-opacity hover:opacity-70"
          style={{ color: 'var(--am-muted)' }}
          title="Sign out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  )
}
