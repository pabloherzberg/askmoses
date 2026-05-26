'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Search, Wand2, ChevronLeft, ChevronRight } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'

interface ScriptRow {
  id: string
  name: string
  description: string | null
  rubricId: string
  rubricName: string | null
  version: string
  sectionsCount: number
  criteriaCount: number
  createdAt: string
}

const PAGE_SIZE = 25

function formatDate(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleDateString(locale, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return '—'
  }
}

// Tabela de scripts do SAAS Panel (aba "Scripts"). Busca server-side via
// /api/admin/scripts/list (RPC list_admin_scripts) — bate em name,
// description, versão e conteúdo das sections. Botão Improve abre a tela
// de review (/admin/script-review/[scriptId]).
export function ScriptsTable() {
  const t = useTranslations('Admin.scripts')
  const tTools = useTranslations('Admin.tableTools')
  const locale = useLocale()

  const [rows, setRows] = useState<ScriptRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [error, setError] = useState<string | null>(null)

  const seqRef = useRef(0)

  const doFetch = useCallback(async (q: string, p: number) => {
    const seq = ++seqRef.current
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/scripts/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ search: q.trim() || undefined, page: p, limit: PAGE_SIZE }),
      })
      const json = await res.json()
      if (seq !== seqRef.current) return
      if (res.ok && json?.data) {
        setRows(json.data.rows as ScriptRow[])
        setTotal(json.data.total as number)
      } else {
        // Surface o erro em vez de engolir — facilita diagnosticar
        // (ex: migration 052 não aplicada → RPC ausente → 500).
        setRows([])
        setTotal(0)
        setError(json?.error?.message ?? `HTTP ${res.status}`)
      }
    } catch (err) {
      if (seq !== seqRef.current) return
      setRows([])
      setTotal(0)
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      if (seq === seqRef.current) setLoading(false)
    }
  }, [])

  // Debounced fetch — também roda no mount (fetch inicial).
  useEffect(() => {
    const handle = setTimeout(() => void doFetch(search, page), 250)
    return () => clearTimeout(handle)
  }, [search, page, doFetch])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      {/* Search */}
      <div className="flex items-center justify-end mb-3">
        <label className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--am-muted)' }}
          />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder={t('searchPlaceholder')}
            className="pl-8 pr-3 py-1.5 rounded-md border outline-none text-sm w-80"
            style={{
              background: 'var(--am-bg3)',
              borderColor: 'var(--am-border)',
              color: 'var(--am-text)',
            }}
          />
        </label>
      </div>

      {/* Table */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--am-border)' }}>
                {(['thName', 'thRubric', 'thVersion', 'thSections', 'thCreated'] as const).map(
                  (k) => (
                    <th
                      key={k}
                      className="text-[11px] font-medium text-left px-5 py-3 whitespace-nowrap"
                      style={{ color: 'var(--am-muted)' }}
                    >
                      {t(k)}
                    </th>
                  ),
                )}
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center py-10 text-sm"
                    style={{ color: error ? 'var(--am-red)' : 'var(--am-muted)' }}
                  >
                    {error ?? t('noResults')}
                  </td>
                </tr>
              )}
              {rows.map((s, i) => (
                <tr
                  key={s.id}
                  style={{
                    borderBottom:
                      i === rows.length - 1 ? 'none' : '1px solid var(--am-border)',
                  }}
                >
                  <td className="px-5 py-4">
                    <p className="text-[13px] font-medium" style={{ color: 'var(--am-text)' }}>
                      {s.name}
                    </p>
                    {s.description && (
                      <p
                        className="text-[11px] mt-0.5 max-w-md truncate"
                        style={{ color: 'var(--am-muted)' }}
                      >
                        {s.description}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-[12px]" style={{ color: 'var(--am-text)' }}>
                      {s.rubricName ?? '—'}
                    </span>
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap">
                    <span
                      className="text-[11px] font-mono font-medium px-1.5 py-0.5 rounded"
                      style={{ background: 'var(--am-bg4)', color: 'var(--am-muted)' }}
                    >
                      v{s.version}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-sm font-mono" style={{ color: 'var(--am-text)' }}>
                      {s.sectionsCount}
                    </span>
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap">
                    <span className="text-[12px] font-mono" style={{ color: 'var(--am-muted)' }}>
                      {formatDate(s.createdAt, locale)}
                    </span>
                  </td>
                  <td className="px-3 py-4 text-right">
                    <Link
                      href={`/${locale}/admin/script-review/${s.id}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium"
                      style={{
                        background: 'var(--am-accent-bg, rgba(110,86,255,0.15))',
                        color: 'var(--am-accent2)',
                      }}
                    >
                      <Wand2 size={12} />
                      {t('improve')}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {loading && (
          <div
            className="px-5 py-2 text-[11px] font-mono"
            style={{ borderTop: '1px solid var(--am-border)', color: 'var(--am-muted)' }}
          >
            {tTools('loading')}
          </div>
        )}
      </div>

      {/* Pagination */}
      <div
        className="flex items-center justify-between mt-3 text-xs"
        style={{ color: 'var(--am-muted)' }}
      >
        <span className="font-mono">{tTools('itemsTotal', { count: total })}</span>
        <div className="flex items-center gap-2">
          <span className="font-mono">{tTools('pageOf', { page, total: totalPages })}</span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            className="inline-flex items-center justify-center w-7 h-7 rounded-md border disabled:opacity-40"
            style={{
              borderColor: 'var(--am-border)',
              background: 'var(--am-bg3)',
              color: 'var(--am-text)',
            }}
            aria-label={tTools('prevPage')}
          >
            <ChevronLeft size={14} />
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            className="inline-flex items-center justify-center w-7 h-7 rounded-md border disabled:opacity-40"
            style={{
              borderColor: 'var(--am-border)',
              background: 'var(--am-bg3)',
              color: 'var(--am-text)',
            }}
            aria-label={tTools('nextPage')}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </>
  )
}
