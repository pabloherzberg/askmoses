'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useLocale } from 'next-intl'
import { Search, GitCompare, Wand2, Send, X, ChevronDown, ChevronUp, Loader2, CheckCircle } from 'lucide-react'
import type { Client, OrgScriptStatus } from '@/lib/types'
import type { ScriptSection, ScriptCriterion } from '@/lib/db/scripts'

// ── Types ──────────────────────────────────────────────────────────────────

interface CatalogScript {
  id: string
  name: string
  description: string | null
  version: string
  majorVersion: number
  minorVersion: number
  rubricId: string
  rubricName: string | null
}

interface ImprovedScript {
  name: string
  description: string
  sections: ScriptSection[]
  criteria: ScriptCriterion[]
  full_script: string
  explanation: string
  sourceScriptId: string
  orgId: string
  callsAnalyzed: number
}

// ── Helpers ────────────────────────────────────────────────────────────────

const scriptStatusStyles: Record<OrgScriptStatus, { bg: string; color: string; label: string }> = {
  none:       { bg: 'var(--am-bg4)',              color: 'var(--am-muted)',  label: 'None'       },
  pending:    { bg: 'rgba(255,171,46,0.15)',       color: 'var(--am-amber)', label: 'Pending'    },
  active:     { bg: 'rgba(34,217,160,0.15)',       color: 'var(--am-green)', label: 'Active'     },
  deprecated: { bg: 'rgba(255,94,94,0.15)',        color: 'var(--am-red)',   label: 'Deprecated' },
  rejected:   { bg: 'var(--am-bg4)',              color: 'var(--am-muted)',  label: 'Rejected'   },
}

function StatusBadge({ status }: { status: OrgScriptStatus }) {
  const s = scriptStatusStyles[status]
  return (
    <span
      className="inline-block text-[10px] font-mono font-medium px-2 py-0.5 rounded-full uppercase tracking-wide whitespace-nowrap"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  )
}

// Side-by-side diff of two section arrays
function SectionDiff({ current, proposed }: { current: ScriptSection[]; proposed: ScriptSection[] }) {
  return (
    <div className="space-y-3">
      {proposed.map((sec, i) => {
        const cur = current[i]
        const instrChanged = cur?.instructions !== sec.instructions
        const tipsChanged = cur?.tips !== sec.tips
        const changed = instrChanged || tipsChanged
        return (
          <div
            key={i}
            className="rounded-xl border overflow-hidden"
            style={{ borderColor: changed ? 'var(--am-accent)' : 'var(--am-border)' }}
          >
            <div
              className="flex items-center gap-2 px-4 py-2.5"
              style={{ background: changed ? 'rgba(110,86,255,0.08)' : 'var(--am-bg3)' }}
            >
              <span
                className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded"
                style={{ background: 'var(--am-bg4)', color: 'var(--am-muted)' }}
              >
                {i + 1}
              </span>
              <span className="text-[13px] font-semibold" style={{ color: 'var(--am-text)' }}>
                {sec.name}
              </span>
              {changed && (
                <span
                  className="ml-auto text-[10px] font-mono font-medium px-2 py-0.5 rounded-full uppercase tracking-wide"
                  style={{ background: 'rgba(110,86,255,0.15)', color: 'var(--am-accent2)' }}
                >
                  Changed
                </span>
              )}
            </div>

            {changed && (
              <div className="grid grid-cols-2">
                {/* Current */}
                <div className="p-4 space-y-2" style={{ borderRight: '1px solid var(--am-border)' }}>
                  <p className="text-[10px] font-mono uppercase tracking-wide mb-2" style={{ color: 'var(--am-muted)' }}>Current</p>
                  <p className="text-[12px] leading-relaxed" style={{ color: 'var(--am-muted)' }}>{cur?.instructions}</p>
                  {cur?.tips && (
                    <p className="text-[11px] italic" style={{ color: 'var(--am-muted)' }}>Tip: {cur.tips}</p>
                  )}
                </div>
                {/* Proposed */}
                <div className="p-4 space-y-2">
                  <p className="text-[10px] font-mono uppercase tracking-wide mb-2" style={{ color: 'var(--am-accent2)' }}>Proposed</p>
                  <p className="text-[12px] leading-relaxed" style={{ color: 'var(--am-text)' }}>{sec.instructions}</p>
                  {sec.tips && (
                    <p className="text-[11px] italic" style={{ color: 'var(--am-accent2)' }}>Tip: {sec.tips}</p>
                  )}
                </div>
              </div>
            )}

            {!changed && (
              <div className="px-4 py-3">
                <p className="text-[12px] leading-relaxed" style={{ color: 'var(--am-muted)' }}>{sec.instructions}</p>
                {sec.tips && (
                  <p className="text-[11px] italic mt-1" style={{ color: 'var(--am-muted)' }}>Tip: {sec.tips}</p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Diff Modal ─────────────────────────────────────────────────────────────

interface DiffModalProps {
  org: Client
  improved: ImprovedScript
  currentScript: { sections: ScriptSection[]; criteria: ScriptCriterion[]; name: string; version: string }
  catalog: CatalogScript[]
  onClose: () => void
}

function DiffModal({ org, improved, currentScript, catalog, onClose }: DiffModalProps) {
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedScriptId, setSelectedScriptId] = useState<string | null>(null)
  const [showFullScript, setShowFullScript] = useState(false)

  // Find the most-recent script with same rubric as current for the "send" base
  const rubricScripts = catalog.filter(s =>
    improved.sourceScriptId && s.id === improved.sourceScriptId
      ? true
      : false
  )
  void rubricScripts

  const handleSend = async () => {
    if (!selectedScriptId) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/scripts/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptId: selectedScriptId, orgIds: [org.orgId] }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json?.error?.message ?? 'Failed to send script')
        return
      }
      setSent(true)
    } catch {
      setError('Network error — please try again')
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border shadow-2xl"
        style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
      >
        {/* Header */}
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b"
          style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
        >
          <div>
            <p className="text-[11px] font-mono uppercase tracking-wide mb-0.5" style={{ color: 'var(--am-accent2)' }}>
              Script Intelligence Review
            </p>
            <h2 className="text-[16px] font-semibold" style={{ color: 'var(--am-text)' }}>
              {org.name}
            </h2>
            <p className="text-[12px] mt-0.5" style={{ color: 'var(--am-muted)' }}>
              v{currentScript.version} → proposed improvements · {improved.callsAnalyzed} calls analyzed
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-opacity hover:opacity-70"
            style={{ background: 'var(--am-bg3)', color: 'var(--am-muted)' }}
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Explanation */}
          <div
            className="rounded-xl p-4 border"
            style={{ background: 'rgba(110,86,255,0.06)', borderColor: 'rgba(110,86,255,0.2)' }}
          >
            <p className="text-[11px] font-mono uppercase tracking-wide mb-1.5" style={{ color: 'var(--am-accent2)' }}>
              AI Analysis
            </p>
            <p className="text-[13px] leading-relaxed" style={{ color: 'var(--am-text)' }}>
              {improved.explanation}
            </p>
          </div>

          {/* Section diff */}
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wide mb-3" style={{ color: 'var(--am-muted)' }}>
              Section Changes
            </p>
            <SectionDiff current={currentScript.sections} proposed={improved.sections} />
          </div>

          {/* Full script toggle */}
          <div>
            <button
              className="flex items-center gap-1.5 text-[12px] font-medium transition-opacity hover:opacity-70"
              style={{ color: 'var(--am-accent2)' }}
              onClick={() => setShowFullScript(v => !v)}
            >
              {showFullScript ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {showFullScript ? 'Hide' : 'Show'} full script text
            </button>
            {showFullScript && (
              <pre
                className="mt-3 text-[11px] font-mono leading-relaxed rounded-xl p-4 overflow-x-auto whitespace-pre-wrap"
                style={{ background: 'var(--am-bg3)', color: 'var(--am-muted)' }}
              >
                {improved.full_script}
              </pre>
            )}
          </div>

          {/* Send for review */}
          {!sent ? (
            <div
              className="rounded-xl border p-4 space-y-3"
              style={{ background: 'var(--am-bg3)', borderColor: 'var(--am-border)' }}
            >
              <p className="text-[13px] font-semibold" style={{ color: 'var(--am-text)' }}>
                Send for Review
              </p>
              <p className="text-[12px]" style={{ color: 'var(--am-muted)' }}>
                Select which script version to send to this org for owner approval:
              </p>
              <select
                value={selectedScriptId ?? ''}
                onChange={(e) => setSelectedScriptId(e.target.value || null)}
                className="w-full rounded-lg border px-3 py-2 text-[13px]"
                style={{
                  background: 'var(--am-bg)',
                  borderColor: 'var(--am-border)',
                  color: 'var(--am-text)',
                }}
              >
                <option value="">— select a script —</option>
                {catalog.map((s) => (
                  <option key={s.id} value={s.id}>
                    v{s.version} · {s.name}{s.rubricName ? ` (${s.rubricName})` : ''}
                  </option>
                ))}
              </select>
              {error && (
                <p className="text-[12px]" style={{ color: 'var(--am-red)' }}>{error}</p>
              )}
              <button
                onClick={handleSend}
                disabled={!selectedScriptId || sending}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-opacity disabled:opacity-40"
                style={{ background: 'var(--am-accent)', color: '#fff' }}
              >
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {sending ? 'Sending…' : 'Send for Review'}
              </button>
            </div>
          ) : (
            <div
              className="rounded-xl border p-4 flex items-center gap-3"
              style={{ background: 'rgba(34,217,160,0.07)', borderColor: 'rgba(34,217,160,0.25)' }}
            >
              <CheckCircle size={18} style={{ color: 'var(--am-green)' }} />
              <div>
                <p className="text-[13px] font-semibold" style={{ color: 'var(--am-green)' }}>Sent for review</p>
                <p className="text-[12px]" style={{ color: 'var(--am-muted)' }}>
                  The owner of {org.name} will see a pending approval banner on their dashboard.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Improve Modal (loading state) ──────────────────────────────────────────

interface ImproveModalProps {
  org: Client
  catalog: CatalogScript[]
  onClose: () => void
  onImproved: (improved: ImprovedScript, currentScript: { sections: ScriptSection[]; criteria: ScriptCriterion[]; name: string; version: string }) => void
}

function ImproveModal({ org, catalog, onClose, onImproved }: ImproveModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedScriptId, setSelectedScriptId] = useState<string>(
    org.currentScript?.scriptId ?? catalog[0]?.id ?? ''
  )

  const handleImprove = async () => {
    if (!selectedScriptId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/scripts/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scriptId: selectedScriptId, orgId: org.orgId }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json?.error?.message ?? 'Failed to generate improvements')
        return
      }
      // Fetch current script details for the diff
      const scriptRes = await fetch(`/api/admin/scripts/catalog`)
      const catalogJson = await scriptRes.json()
      const catalogData = (catalogJson?.data ?? []) as CatalogScript[]
      const found = catalogData.find((s: CatalogScript) => s.id === selectedScriptId)

      // Fetch full script sections/criteria
      const detailRes = await fetch(`/api/admin/scripts/${selectedScriptId}`)
      let currentSections: ScriptSection[] = []
      let currentCriteria: ScriptCriterion[] = []
      if (detailRes.ok) {
        const detail = await detailRes.json()
        currentSections = detail?.data?.sections ?? []
        currentCriteria = detail?.data?.criteria ?? []
      }

      onImproved(json.data, {
        sections: currentSections,
        criteria: currentCriteria,
        name: found?.name ?? 'Current Script',
        version: found?.version ?? '?',
      })
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={(e) => { if (e.target === e.currentTarget && !loading) onClose() }}
    >
      <div
        className="w-full max-w-md rounded-2xl border shadow-2xl p-6 space-y-4"
        style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-wide mb-0.5" style={{ color: 'var(--am-accent2)' }}>
              Script Intelligence
            </p>
            <h2 className="text-[16px] font-semibold" style={{ color: 'var(--am-text)' }}>
              Improve Script for {org.name}
            </h2>
          </div>
          {!loading && (
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:opacity-70" style={{ background: 'var(--am-bg3)', color: 'var(--am-muted)' }}>
              <X size={16} />
            </button>
          )}
        </div>

        <p className="text-[13px]" style={{ color: 'var(--am-muted)' }}>
          AI will analyze recent closed calls from this org and propose targeted improvements to the selected script. Sections and criteria structure stays the same — only text is updated.
        </p>

        <div className="space-y-1.5">
          <label className="text-[11px] font-mono uppercase tracking-wide" style={{ color: 'var(--am-muted)' }}>
            Base Script
          </label>
          <select
            value={selectedScriptId}
            onChange={(e) => setSelectedScriptId(e.target.value)}
            disabled={loading}
            className="w-full rounded-lg border px-3 py-2 text-[13px] disabled:opacity-50"
            style={{ background: 'var(--am-bg)', borderColor: 'var(--am-border)', color: 'var(--am-text)' }}
          >
            {catalog.map((s) => (
              <option key={s.id} value={s.id}>
                v{s.version} · {s.name}{s.rubricName ? ` (${s.rubricName})` : ''}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p className="text-[12px] rounded-lg px-3 py-2" style={{ background: 'rgba(255,94,94,0.1)', color: 'var(--am-red)' }}>
            {error}
          </p>
        )}

        <button
          onClick={handleImprove}
          disabled={!selectedScriptId || loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold transition-opacity disabled:opacity-40"
          style={{ background: 'var(--am-accent)', color: '#fff' }}
        >
          {loading ? (
            <><Loader2 size={15} className="animate-spin" /> Analyzing calls &amp; generating improvements…</>
          ) : (
            <><Wand2 size={15} /> Generate Improvements</>
          )}
        </button>
        {loading && (
          <p className="text-[11px] text-center" style={{ color: 'var(--am-muted)' }}>
            This may take 10–20 seconds
          </p>
        )}
      </div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────

interface Props {
  initialRows: Client[]
  initialTotal: number
  initialPageSize: number
  catalog: CatalogScript[]
}

export function ScriptReviewClient({ initialRows, initialTotal, initialPageSize, catalog }: Props) {
  const locale = useLocale()
  const [rows, setRows] = useState<Client[]>(initialRows)
  const [total, setTotal] = useState(initialTotal)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const limit = initialPageSize
  const fetchSeqRef = useRef(0)

  const [improveTarget, setImproveTarget] = useState<Client | null>(null)
  const [diffState, setDiffState] = useState<{
    org: Client
    improved: ImprovedScript
    currentScript: { sections: ScriptSection[]; criteria: ScriptCriterion[]; name: string; version: string }
  } | null>(null)

  const doFetch = useCallback(async (q: string, p: number) => {
    const seq = ++fetchSeqRef.current
    setLoading(true)
    try {
      const res = await fetch('/api/admin/organizations/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ search: q.trim() || undefined, page: p, limit }),
      })
      const json = await res.json()
      if (seq !== fetchSeqRef.current) return
      if (res.ok && json?.data) {
        setRows(json.data.rows as Client[])
        setTotal(json.data.total as number)
      }
    } finally {
      if (seq === fetchSeqRef.current) setLoading(false)
    }
  }, [limit])

  const isFirst = useRef(true)
  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return }
    const t = setTimeout(() => void doFetch(search, page), 250)
    return () => clearTimeout(t)
  }, [search, page, doFetch])

  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <>
      {/* Search */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="flex items-center gap-2 flex-1 max-w-xs rounded-xl border px-3 py-2"
          style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
        >
          <Search size={14} style={{ color: 'var(--am-muted)' }} />
          <input
            type="text"
            placeholder="Search organizations…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="flex-1 bg-transparent text-[13px] outline-none placeholder:opacity-50"
            style={{ color: 'var(--am-text)' }}
          />
        </div>
        {loading && <Loader2 size={15} className="animate-spin" style={{ color: 'var(--am-muted)' }} />}
      </div>

      {/* Table */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ background: 'var(--am-bg2)', borderColor: 'var(--am-border)' }}
      >
        <table className="w-full">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--am-border)' }}>
              {['Organization', 'Current Script', 'Version', 'Script Status', 'Actions'].map((h) => (
                <th
                  key={h}
                  className="px-5 py-3 text-left text-[11px] font-mono uppercase tracking-wide"
                  style={{ color: 'var(--am-muted)' }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-10 text-center text-[13px]" style={{ color: 'var(--am-muted)' }}>
                  No organizations found
                </td>
              </tr>
            )}
            {rows.map((client, i) => {
              const script = client.currentScript
              const status: OrgScriptStatus = script?.status ?? 'none'
              const isLast = i === rows.length - 1
              return (
                <tr
                  key={client.id}
                  style={{ borderBottom: isLast ? 'none' : '1px solid var(--am-border)' }}
                >
                  <td className="px-5 py-4">
                    <p className="text-[13px] font-medium" style={{ color: 'var(--am-text)' }}>{client.name}</p>
                  </td>
                  <td className="px-5 py-4">
                    <p className="text-[12px]" style={{ color: script ? 'var(--am-text)' : 'var(--am-muted)' }}>
                      {script?.scriptName ?? '—'}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    {script ? (
                      <div className="inline-flex items-center gap-1.5 font-mono text-[11px]">
                        {script.previousVersion && (
                          <>
                            <span className="px-1.5 py-0.5 rounded" style={{ background: 'var(--am-bg4)', color: 'var(--am-muted)' }}>
                              v{script.previousVersion}
                            </span>
                            <span style={{ color: 'var(--am-muted)' }}>→</span>
                          </>
                        )}
                        <span className="px-1.5 py-0.5 rounded font-medium" style={{ background: scriptStatusStyles[status].bg, color: scriptStatusStyles[status].color }}>
                          v{script.version}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[12px] font-mono" style={{ color: 'var(--am-muted)' }}>—</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <StatusBadge status={status} />
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      {script ? (
                        <Link
                          href={`/${locale}/admin/script-review/${script.scriptId}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-opacity hover:opacity-80"
                          style={{ background: 'rgba(110,86,255,0.15)', color: 'var(--am-accent2)' }}
                          title="Open the Script Intelligence review for this org"
                        >
                          <Wand2 size={12} />
                          Improve
                        </Link>
                      ) : (
                        <button
                          disabled
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium opacity-30 cursor-not-allowed"
                          style={{ background: 'rgba(110,86,255,0.15)', color: 'var(--am-accent2)' }}
                          title="No active script to improve"
                        >
                          <Wand2 size={12} />
                          Improve
                        </button>
                      )}
                      {script && (
                        <button
                          onClick={() => {
                            // Open diff modal with current script data (no AI, just review existing)
                            setDiffState(null)
                            setImproveTarget(client)
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-opacity hover:opacity-80"
                          style={{ background: 'var(--am-bg3)', color: 'var(--am-muted)' }}
                          title="Send a different script version to this org"
                        >
                          <Send size={12} />
                          Send
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-[12px]" style={{ color: 'var(--am-muted)' }}>
            {total} organizations
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium disabled:opacity-30"
              style={{ background: 'var(--am-bg3)', color: 'var(--am-text)' }}
            >
              ←
            </button>
            <span className="text-[12px] font-mono" style={{ color: 'var(--am-muted)' }}>
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 rounded-lg text-[12px] font-medium disabled:opacity-30"
              style={{ background: 'var(--am-bg3)', color: 'var(--am-text)' }}
            >
              →
            </button>
          </div>
        </div>
      )}

      {/* Improve Modal */}
      {improveTarget && !diffState && (
        <ImproveModal
          org={improveTarget}
          catalog={catalog}
          onClose={() => setImproveTarget(null)}
          onImproved={(improved, currentScript) => {
            setDiffState({ org: improveTarget, improved, currentScript })
            setImproveTarget(null)
          }}
        />
      )}

      {/* Diff Modal */}
      {diffState && (
        <DiffModal
          org={diffState.org}
          improved={diffState.improved}
          currentScript={diffState.currentScript}
          catalog={catalog}
          onClose={() => setDiffState(null)}
        />
      )}
    </>
  )
}
