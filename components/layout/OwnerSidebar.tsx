'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Phone } from 'lucide-react'
import { cn } from '@/lib/utils'

const nav = [
  { label: 'Visão do Time', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Calls',         href: '/calls',     icon: Phone },
]

export function OwnerSidebar() {
  const pathname = usePathname()

  return (
    <aside
      className="fixed left-0 top-[61px] bottom-0 w-56 hidden lg:flex flex-col border-r pt-6 px-3"
      style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
    >
      <nav className="flex flex-col gap-1">
        {nav.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link
              key={href}
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
        })}
      </nav>
    </aside>
  )
}
