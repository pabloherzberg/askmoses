'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Phone, Upload, History,
  BarChart3, Brain, Wand2, Settings, HelpCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const mainNav = [
  { label: 'Team Overview', href: '/overview', icon: LayoutDashboard },
  { label: 'Calls', href: '/calls', icon: Phone },
]

const toolsNav = [
  { label: 'Upload Call', href: '/dashboard/upload', icon: Upload },
  { label: 'History', href: '/dashboard/history', icon: History },
  { label: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
  { label: 'Insights', href: '/dashboard/insights', icon: Brain },
  { label: 'Script Builder', href: '/dashboard/script-builder', icon: Wand2 },
  { label: 'Rubric', href: '/dashboard/settings', icon: Settings },
  { label: 'How to Use', href: '/dashboard/guide', icon: HelpCircle },
]

function NavItem({ label, href, icon: Icon }: { label: string; href: string; icon: React.ElementType }) {
  const pathname = usePathname()
  const active =
    pathname === href ||
    (href !== '/overview' && href !== '/dashboard' && pathname.startsWith(href))

  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
        active ? 'text-white' : 'hover:opacity-80'
      )}
      style={
        active
          ? { background: 'var(--am-accent)', color: 'white' }
          : { color: 'var(--am-muted)' }
      }
    >
      <Icon size={16} />
      {label}
    </Link>
  )
}

import type React from 'react'

export function OwnerNavItems() {
  return (
    <nav className="flex flex-col gap-1">
      {mainNav.map((item) => <NavItem key={item.href} {...item} />)}

      <div className="my-2 mx-3 h-px" style={{ background: 'var(--am-border)' }} />

      <p className="px-3 mb-1 text-[10px] font-medium uppercase tracking-widest" style={{ color: 'var(--am-muted)' }}>
        Tools
      </p>

      {toolsNav.map((item) => <NavItem key={item.href} {...item} />)}
    </nav>
  )
}

export function OwnerSidebar() {
  return (
    <aside
      className="fixed left-0 top-[61px] bottom-0 w-56 hidden lg:flex flex-col border-r pt-6 px-3"
      style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
    >
      <OwnerNavItems />
    </aside>
  )
}
