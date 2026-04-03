'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Role } from '@/lib/types'
import { ThemeToggle } from '@/components/shared/ThemeToggle'
import { LogoSVG } from '@/components/shared/LogoSVG'

const DEMO_USERS = [
  { label: 'Trainer', email: 'trainer@demo.askmoses.ai', password: 'demo123', hint: 'Marcus R.' },
  { label: 'Trainer 2', email: 'trainer2@demo.askmoses.ai', password: 'demo123', hint: 'Jamie L.' },
  { label: 'Trainer 3', email: 'trainer3@demo.askmoses.ai', password: 'demo123', hint: 'Jordan K.' },
  { label: 'Trainer 4', email: 'trainer4@demo.askmoses.ai', password: 'demo123', hint: 'Taylor M.' },
  { label: 'Gestor', email: 'owner@demo.askmoses.ai', password: 'demo123', hint: 'Owner' },
  { label: 'Admin', email: 'admin@askmoses.ai', password: 'demo123', hint: 'AskMoses Team' },
]

function redirectByRole(role: Role): string {
  return role === 'trainer' ? '/me' : role === 'owner' ? '/dashboard' : '/admin'
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const supabase = createClient()

      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError || !data.session) {
        setError('Email or password incorrect')
        return
      }

      // Fetch profile via API (admin client bypasses RLS)
      // Pass access token in header so the server can read the session even before the cookie propagates
      const meRes = await fetch('/api/me', {
        headers: { Authorization: `Bearer ${data.session.access_token}` },
      })
      const { data: meData } = await meRes.json() as { data: { role: string; name: string; trainerId: string | null } | null; error: unknown }

      if (!meData) {
        setError('User profile not found. Run the seed script in Supabase.')
        return
      }

      window.location.href = redirectByRole(meData.role as Role)
    } finally {
      setLoading(false)
    }
  }

  const fillDemo = (demoEmail: string, demoPassword: string) => {
    setEmail(demoEmail)
    setPassword(demoPassword)
    setError('')
  }

  return (
    <div className="w-full max-w-sm px-6">
      {/* Logo + ThemeToggle */}
      <div className="flex items-center justify-between mb-10">
        <LogoSVG className="h-14 w-auto" />
        <ThemeToggle />
      </div>

      {/* Form */}
      <form onSubmit={handleLogin} className="space-y-4">
        <div>
          <label className="block text-xs mb-1.5" style={{ color: 'var(--am-muted)' }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors"
            style={{ background: 'var(--am-bg3)', border: '1px solid var(--am-border2)', color: 'var(--am-text)' }}
            placeholder="your@email.com"
          />
        </div>

        <div>
          <label className="block text-xs mb-1.5" style={{ color: 'var(--am-muted)' }}>
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors"
            style={{ background: 'var(--am-bg3)', border: '1px solid var(--am-border2)', color: 'var(--am-text)' }}
            placeholder="••••••••"
          />
        </div>

        {error && (
          <p className="text-xs" style={{ color: 'var(--am-red)' }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-60"
          style={{ background: 'var(--accent)' }}
        >
          {loading ? 'Signing in...' : 'Login'}
        </button>
      </form>

      {/* Demo shortcuts */}
      <div
        className="mt-8 mb-8 p-4 rounded-xl border"
        style={{ background: 'var(--am-bg3)', borderColor: 'var(--am-border)' }}
      >
        <p className="text-[11px] font-medium tracking-widest uppercase mb-3" style={{ color: 'var(--am-muted)' }}>
          Demo access
        </p>
        <div className="flex flex-col gap-2">
          {DEMO_USERS.map((u) => (
            <button
              key={u.email}
              type="button"
              onClick={() => fillDemo(u.email, u.password)}
              className="flex items-center justify-between w-full px-3 py-2 rounded-lg text-left transition-colors"
              style={{ background: 'var(--am-bg4)', border: '1px solid var(--am-border)', color: 'var(--am-text)' }}
            >
              <span className="text-xs font-medium">{u.label}</span>
              <span className="text-[11px]" style={{ color: 'var(--am-muted)' }}>{u.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
