'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Role } from '@/lib/types'

const DEMO_USERS = [
  { label: 'Trainer', email: 'trainer@demo.askmoses.ai', password: 'demo123', hint: 'Marcus R.' },
  { label: 'Trainer 2', email: 'trainer2@demo.askmoses.ai', password: 'demo123', hint: 'Jamie L.' },
  { label: 'Trainer 3', email: 'trainer3@demo.askmoses.ai', password: 'demo123', hint: 'Jordan K.' },
  { label: 'Trainer 4', email: 'trainer4@demo.askmoses.ai', password: 'demo123', hint: 'Taylor M.' },
  { label: 'Gestor', email: 'owner@demo.askmoses.ai', password: 'demo123', hint: 'Owner' },
  { label: 'Admin', email: 'admin@askmoses.ai', password: 'demo123', hint: 'AskMoses Team' },
]

function redirectByRole(role: Role): string {
  return role === 'trainer' ? '/me' : role === 'owner' ? '/overview' : '/admin'
}

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    const { data, error: authError } = await res.json() as {
      data: { user: { role: Role; trainerId: string | null } } | null
      error: { message: string } | null
    }

    if (authError || !data) {
      setError(authError?.message ?? 'Email ou senha incorretos')
      setLoading(false)
      return
    }

    const { role, trainerId } = data.user
    // Persiste sessão demo via cookie para o middleware ler
    document.cookie = `demo-role=${role}; path=/; max-age=86400; SameSite=Lax`
    if (trainerId) {
      document.cookie = `demo-trainer-id=${trainerId}; path=/; max-age=86400; SameSite=Lax`
    } else {
      document.cookie = `demo-trainer-id=; path=/; max-age=0; SameSite=Lax`
    }
    router.push(redirectByRole(role))
  }

  const fillDemo = (demoEmail: string, demoPassword: string) => {
    setEmail(demoEmail)
    setPassword(demoPassword)
    setError('')
  }

  return (
    <div className="w-full max-w-sm px-6">
      {/* Logo */}
      <div className="flex items-center justify-center gap-2.5 mb-10">
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
            style={{
              background: 'var(--am-bg3)',
              border: '1px solid var(--am-border2)',
              color: 'var(--am-text)',
            }}
            placeholder="seu@email.com"
          />
        </div>

        <div>
          <label className="block text-xs mb-1.5" style={{ color: 'var(--am-muted)' }}>
            Senha
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none transition-colors"
            style={{
              background: 'var(--am-bg3)',
              border: '1px solid var(--am-border2)',
              color: 'var(--am-text)',
            }}
            placeholder="••••••••"
          />
        </div>

        {error && (
          <p className="text-xs" style={{ color: 'var(--am-red)' }}>
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-60"
          style={{ background: 'var(--am-accent)' }}
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>

      {/* Demo shortcuts */}
      <div
        className="mt-8 p-4 rounded-xl border"
        style={{ background: 'var(--am-bg3)', borderColor: 'var(--am-border)' }}
      >
        <p className="text-[11px] font-medium tracking-widest uppercase mb-3" style={{ color: 'var(--am-muted)' }}>
          Acesso demo
        </p>
        <div className="flex flex-col gap-2">
          {DEMO_USERS.map((u) => (
            <button
              key={u.email}
              type="button"
              onClick={() => fillDemo(u.email, u.password)}
              className="flex items-center justify-between w-full px-3 py-2 rounded-lg text-left transition-colors"
              style={{
                background: 'var(--am-bg4)',
                border: '1px solid var(--am-border)',
                color: 'var(--am-text)',
              }}
            >
              <span className="text-xs font-medium">{u.label}</span>
              <span className="text-[11px]" style={{ color: 'var(--am-muted)' }}>
                {u.hint}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
