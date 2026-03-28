'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Building2, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

const nav = [
  { label: 'SaaS Panel',     href: '/admin',        icon: Building2 },
  { label: 'Rubric Config',  href: '/admin/rubric', icon: Settings  },
]

export function AdminNavItems() {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-1">
      {nav.map(({ label, href, icon: Icon }) => {
        const active = pathname === href
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
  )
}

export function AdminSidebar() {
  return (
    <aside
      className="fixed left-0 top-[61px] bottom-0 w-56 hidden lg:flex flex-col border-r pt-6 px-3"
      style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
    >
      <AdminNavItems />
    </aside>
  )
}
