'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { LogOut } from 'lucide-react'
import { ThemeToggle } from '@/components/shared/ThemeToggle'

export function AppHeader() {
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 h-[61px] border-b"
      style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-base font-semibold text-white font-mono"
          style={{ background: 'var(--am-accent)' }}
        >
          M
        </div>
        <span className="text-base font-semibold tracking-tight" style={{ color: 'var(--am-text)' }}>
          Ask<span style={{ color: 'var(--am-accent2)' }}>Moses</span>.AI
        </span>
      </div>

      {/* Right */}
      <div className="flex items-center gap-4">
        <span
          className="text-xs px-3 py-1 rounded-full font-mono border"
          style={{
            background: 'var(--am-bg4)',
            borderColor: 'var(--am-border2)',
            color: 'var(--am-muted)',
          }}
        >
          Semana 6 / 6
        </span>
        {/* Live dot */}
        <span
          className="w-2 h-2 rounded-full"
          title="Ao vivo"
          style={{
            background: 'var(--am-green)',
            boxShadow: '0 0 8px var(--am-green)',
            animation: 'am-pulse 2s infinite',
          }}
        />
        <ThemeToggle />
        <button
          onClick={handleLogout}
          className="p-1.5 rounded-md transition-colors hover:opacity-70"
          style={{ color: 'var(--am-muted)' }}
          title="Sair"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  )
}
