'use client'

import { useState } from 'react'
import { Building2, FileText } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { Client } from '@/lib/types'
import { AdminPanelClient } from './AdminPanelClient'
import { ScriptsTable } from './ScriptsTable'

type Tab = 'organizations' | 'scripts'

interface Props {
  initialRows: Client[]
  initialTotal: number
  initialPageSize: number
}

// Wrapper de abas do SAAS Panel: "Organizations" (tabela de orgs) e
// "Scripts" (catálogo de scripts com busca + Improve). Conditional render —
// trocar de aba remonta o conteúdo; aceitável pra Fase 1 (catálogos pequenos).
export function AdminPanelTabs({ initialRows, initialTotal, initialPageSize }: Props) {
  const t = useTranslations('Admin.tabs')
  const [tab, setTab] = useState<Tab>('organizations')

  return (
    <>
      {/* Tab toggle */}
      <div
        className="inline-flex rounded-lg p-0.5 border mb-4"
        style={{ background: 'var(--am-bg3)', borderColor: 'var(--am-border)' }}
        role="tablist"
      >
        {([
          { key: 'organizations' as const, icon: <Building2 size={13} /> },
          { key: 'scripts' as const, icon: <FileText size={13} /> },
        ]).map(({ key, icon }) => {
          const active = tab === key
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(key)}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md text-xs font-medium transition-colors"
              style={{
                background: active ? 'var(--am-accent)' : 'transparent',
                color: active ? 'var(--am-on-accent)' : 'var(--am-muted)',
              }}
            >
              {icon}
              {t(key)}
            </button>
          )
        })}
      </div>

      {tab === 'organizations' ? (
        <AdminPanelClient
          initialRows={initialRows}
          initialTotal={initialTotal}
          initialPageSize={initialPageSize}
        />
      ) : (
        <ScriptsTable />
      )}
    </>
  )
}
