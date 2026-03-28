'use client'

import { useTheme } from 'next-themes'
import { Sun, Moon } from 'lucide-react'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <button
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      aria-label="Alternar tema"
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
      {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  )
}
