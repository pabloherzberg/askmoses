'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { ChevronRight, Phone, FileText, RefreshCw, AlertCircle, History, X, Clock } from 'lucide-react'
import { formatDuration } from '@/lib/format'
import { ScorePill } from '@/components/shared/ScorePill'
import { NotSalesCallPill } from '@/components/shared/NotSalesCallPill'
import { IntentCell } from '@/components/shared/IntentCell'
import { SectionLabel } from '@/components/shared/SectionLabel'
import { RESULT_STYLES, DEFAULT_RESULT_STYLE, CALL_OUTCOMES, LEAD_SOURCE_LABELS } from '@/lib/constants'
import type { Call } from '@/lib/types'

const FAILED_STATUSES = new Set(['transcription_failed', 'no_recording', 'auth_expired', 'webhook_failed'])
const IN_PROGRESS_STATUSES = new Set(['processing', 'queued_for_chunking', 'chunking', 'awaiting_chunks', 'consolidating', 'transcribed'])
const REFRESH_INTERVAL_MS = 8_000
const REFRESH_MAX = 45 // ~6 minutos

// Call está completamente analisada se tem sections (rubrica preenchida pela IA).
// Score 0.0 sozinho não é critério — pode ser score legítimo.
function isAnalysisComplete(call: Call): boolean {
  return Array.isArray(call.sections) && call.sections.length > 0
}

// Mostra o botão se a call falhou OU está em progresso sem análise completa.
function shouldShowReprocessButton(call: Call): boolean {
  const status = call.processingStatus ?? null
  if (status && FAILED_STATUSES.has(status)) return true
  if (status && IN_PROGRESS_STATUSES.has(status) && !isAnalysisComplete(call)) return true
  return false
}

type ReprocessState = 'idle' | 'loading' | 'queued' | 'error'

function ReprocessButton({ callId, hasSections, onRefresh }: { callId: string; hasSections: boolean; onRefresh: () => void }) {
  const [state, setState] = useState<ReprocessState>('idle')
  const [errorMsg, setErrorMsg] = useState<string>('')
  const t = useTranslations('Owner.calls.reprocess')

  // Quando em 'queued', faz refresh periódico. O pai para de renderizar
  // este botão quando sections chegarem (análise finalizada).
  useEffect(() => {
    if (state !== 'queued') return
    let count = 0
    const id = setInterval(() => {
      count++
      onRefresh()
      if (count >= REFRESH_MAX) clearInterval(id)
    }, REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [state, onRefresh])

  // Sections chegaram — o pai vai desmontar este componente, mas se por algum
  // motivo ainda estiver montado, muda estado local para idle.
  useEffect(() => {
    if (state === 'queued' && hasSections) setState('idle')
  }, [hasSections, state])

  const handleClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (state !== 'idle') return
    setState('loading')
    setErrorMsg('')
    try {
      const res = await fetch(`/api/calls/${callId}/reprocess`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`)
      }
      setState('queued')
      onRefresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[reprocess]', callId, msg)
      setErrorMsg(msg)
      setState('error')
      setTimeout(() => setState('idle'), 6000)
    }
  }, [callId, state, onRefresh])

  if (state === 'queued') {
    return (
      <span
        className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg whitespace-nowrap"
        style={{ color: 'var(--am-blue)', background: 'rgba(94,179,255,0.12)' }}
      >
        <RefreshCw size={11} className="animate-spin" />
        {t('processing')}
      </span>
    )
  }

  if (state === 'error') {
    return (
      <span
        className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg whitespace-nowrap cursor-help"
        style={{ color: 'var(--am-red)', background: 'rgba(255,94,94,0.12)' }}
        title={errorMsg}
      >
        <AlertCircle size={12} />
        {t('error')}
      </span>
    )
  }

  return (
    <button
      onClick={handleClick}
      disabled={state === 'loading'}
      className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg whitespace-nowrap transition-opacity hover:opacity-80 disabled:opacity-50"
      style={{ color: 'var(--am-amber)', background: 'rgba(255,171,46,0.12)', border: '1px solid rgba(255,171,46,0.25)' }}
      title={t('tooltip')}
    >
      <RefreshCw size={11} className={state === 'loading' ? 'animate-spin' : ''} />
      {state === 'loading' ? t('queuing') : t('label')}
    </button>
  )
}

interface CallsTableProps {
  calls: Call[]
  showTrainerColumn?: boolean
  /**
   * @deprecated não tem mais efeito. Filtro de Sources foi removido (sem
   * funcionalidade real); filtro de Script e pill de "active script" agora
   * dependem apenas dos dados (`hasScripts`). Mantido na assinatura pra
   * compat com callers existentes — pode ser removido em refactor futuro.
   */
  showAdvancedFilters?: boolean
  sectionLabel: string
  title: string
  canReprocess?: boolean
}

const GREEN_BG = 'var(--am-green-bg, rgba(34,217,160,0.12))'

// Uma "conta" na tabela: todas as calls de um mesmo contactId. Calls sem
// contactId viram grupos de 1 (chaveadas pelo próprio id da call).
type CallGroup = {
  key: string
  calls: Call[] // ordenadas por data desc — [0] é a mais recente
  latest: Call
}

export function CallsTable({
  calls,
  showTrainerColumn = true,
  sectionLabel,
  title,
  canReprocess = false,
}: CallsTableProps) {
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations('Owner.calls')
  const tOutcomes = useTranslations('Shared.outcomes')
  const [resultFilter, setResultFilter] = useState<string>('all')
  const [trainerFilter, setTrainerFilter] = useState<string>('all')
  // Source filter removido da UI (sem funcionalidade real ainda).
  // const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [scriptFilter, setScriptFilter] = useState<string>('all')

  const trainers = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of calls) {
      if (c.trainerId) map.set(c.trainerId, c.trainerName)
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [calls])

  // Scripts efetivamente usados pelas calls visíveis — fonte tanto do filtro
  // quanto da tag de script ativo. Calls sem script (rubric) são ignoradas.
  const scriptsInCalls = useMemo(() => {
    const map = new Map<string, { id: string; name: string; isActive: boolean }>()
    for (const c of calls) {
      if (c.scriptId && c.scriptName && !map.has(c.scriptId)) {
        map.set(c.scriptId, { id: c.scriptId, name: c.scriptName, isActive: !!c.scriptIsActive })
      }
    }
    return Array.from(map.values())
  }, [calls])

  const hasScripts = scriptsInCalls.length > 0
  const activeScript = scriptsInCalls.find((s) => s.isActive) ?? null

  const filtered = useMemo(
    () => calls.filter((c) => {
      if (resultFilter !== 'all' && c.result !== resultFilter) return false
      if (trainerFilter !== 'all' && c.trainerId !== trainerFilter) return false
      if (scriptFilter !== 'all' && (c.scriptId ?? null) !== scriptFilter) return false
      return true
    }),
    [calls, resultFilter, trainerFilter, scriptFilter]
  )

  // Agrupa as calls filtradas por contactId — um registro por cliente. Dentro
  // do grupo as calls ficam em ordem temporal (mais nova primeiro) e os grupos
  // são ordenados pela call mais recente de cada cliente.
  const groups = useMemo<CallGroup[]>(() => {
    const byContact = new Map<string, Call[]>()
    const result: CallGroup[] = []
    for (const call of filtered) {
      if (call.contactId) {
        const arr = byContact.get(call.contactId)
        if (arr) arr.push(call)
        else byContact.set(call.contactId, [call])
      } else {
        result.push({ key: call.id, calls: [call], latest: call })
      }
    }
    for (const [contactId, arr] of byContact) {
      const sorted = [...arr].sort((a, b) => b.date.localeCompare(a.date))
      result.push({ key: contactId, calls: sorted, latest: sorted[0] })
    }
    return result.sort((a, b) => b.latest.date.localeCompare(a.latest.date))
  }, [filtered])

  // Cliente selecionado para o modal de histórico. Guardamos só a chave e
  // derivamos o grupo dos `groups` recalculados — assim, quando uma call é
  // reanalisada (router.refresh recarrega os dados), o modal reflete o status
  // novo em vez de um snapshot congelado no momento da abertura.
  const [historyKey, setHistoryKey] = useState<string | null>(null)
  const historyGroup = historyKey ? groups.find((g) => g.key === historyKey) ?? null : null

  const selectClass = 'text-sm rounded-lg px-3 py-1.5 border outline-none transition-colors cursor-pointer'
  const selectStyle = { background: 'var(--card)', borderColor: 'var(--am-border2)', color: 'var(--am-text)' }

  const headers = [
    ...(showTrainerColumn ? [t('thTrainer')] : []),
    t('thProspect'), t('thDate'),
    ...(hasScripts ? [t('thScript')] : []),
    t('thDuration'), t('thIntent'), t('thScore'), t('thResult'), '',
  ]

  const countLabel = filtered.length === 1
    ? t('callsAnalyzedOne', { count: filtered.length })
    : t('callsAnalyzedOther', { count: filtered.length })

  // Renderiza a linha do cliente (call mais recente do contactId). Quando o
  // cliente tem histórico (>1 call), um botão abre o modal com todas as calls.
  const renderRow = (call: Call, group: CallGroup) => {
    const result = RESULT_STYLES[call.result] ?? DEFAULT_RESULT_STYLE
    const outcomeLabel = call.result in RESULT_STYLES
      ? tOutcomes(`short.${call.result}`)
      : tOutcomes('unknown')
    const hasHistory = group.calls.length > 1
    return (
      <tr
        key={call.id}
        className="cursor-pointer transition-colors"
        style={{ borderBottom: '1px solid var(--am-border)' }}
        onClick={() => router.push(`/${locale}/calls/${call.id}`)}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--am-bg3)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
      >
        {showTrainerColumn && (
          <td className="px-4 py-3">
            <span className="text-[13px] font-medium whitespace-nowrap" style={{ color: 'var(--am-text)' }}>
              {call.trainerName}
            </span>
          </td>
        )}
        <td className="px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px]" style={{ color: 'var(--am-text)' }}>{call.prospect}</span>
            {call.lead_source && (
              <span
                className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                style={{ background: 'var(--am-bg4)', color: 'var(--am-accent2)' }}
              >
                {LEAD_SOURCE_LABELS[call.lead_source]}
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <span className="text-xs font-mono" style={{ color: 'var(--am-muted)' }}>
            {new Date(call.date).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })}
          </span>
        </td>
        {hasScripts && (
          <td className="px-4 py-3">
            {call.scriptName ? (
              <span
                className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
                style={
                  call.scriptIsActive
                    ? { background: GREEN_BG, color: 'var(--am-green)' }
                    : { background: 'var(--am-bg4)', color: 'var(--am-muted)' }
                }
              >
                <FileText size={11} />
                {call.scriptName}
              </span>
            ) : (
              <span className="text-xs" style={{ color: 'var(--am-muted)' }}>—</span>
            )}
          </td>
        )}
        {/* Duração real da call (ex.: "1m30s") — Owner vê só a
            duração, nunca o custo (visível apenas pro Admin). */}
        <td className="px-4 py-3 whitespace-nowrap">
          <span className="text-[13px] font-mono" style={{ color: 'var(--am-muted)' }}>
            {formatDuration(call.durationSeconds)}
          </span>
        </td>
        {/* Intent (1–5): só o número + tooltip com a mensagem fixa.
            Sem estrelas, sem badge colorido (decisão Task C). */}
        <td className="px-4 py-3">
          <IntentCell score={call.intent} />
        </td>
        {call.isSalesCall === false ? (
          <>
            <td className="px-4 py-3"><span style={{ color: 'var(--am-muted)' }}>—</span></td>
            <td className="px-4 py-3"><NotSalesCallPill label={tOutcomes('notSalesCall')} /></td>
          </>
        ) : (
          <>
            <td className="px-4 py-3"><ScorePill score={call.score} /></td>
            <td className="px-4 py-3">
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full font-mono" style={{ background: result.bg, color: result.color }}>
                {outcomeLabel}
              </span>
            </td>
          </>
        )}
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-end gap-2">
            {hasHistory && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setHistoryKey(group.key) }}
                className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-lg border transition-opacity hover:opacity-80 whitespace-nowrap"
                style={{ color: 'var(--am-accent2)', borderColor: 'var(--am-border2)', background: 'var(--am-bg3)' }}
                title={t('groupViewAll', { count: group.calls.length })}
              >
                <History size={12} />
                {t('groupViewAll', { count: group.calls.length })}
              </button>
            )}
            {canReprocess && shouldShowReprocessButton(call) ? (
              <ReprocessButton callId={call.id} hasSections={isAnalysisComplete(call)} onRefresh={router.refresh} />
            ) : (
              <ChevronRight size={16} style={{ color: 'var(--am-muted)' }} />
            )}
          </div>
        </td>
      </tr>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <SectionLabel>{sectionLabel}</SectionLabel>
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--am-text)' }}>
          {title}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--am-muted)' }}>
          {countLabel}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <select className={selectClass} style={selectStyle} value={resultFilter} onChange={(e) => setResultFilter(e.target.value)}>
          <option value="all">{tOutcomes('all')}</option>
          {CALL_OUTCOMES.map((o) => (
            <option key={o.value} value={o.value}>{tOutcomes(`full.${o.value}`)}</option>
          ))}
        </select>
        {showTrainerColumn && trainers.length > 0 && (
          <select className={selectClass} style={selectStyle} value={trainerFilter} onChange={(e) => setTrainerFilter(e.target.value)}>
            <option value="all">{t('filterAllSalesPeople')}</option>
            {trainers.map((tr) => <option key={tr.id} value={tr.id}>{tr.name}</option>)}
          </select>
        )}
        {/* Filtro de Sources removido — sem funcionalidade real por trás.
            Reabilitar quando lead_source for editável e tiver consumidores. */}
        {hasScripts && (
          <select className={selectClass} style={selectStyle} value={scriptFilter} onChange={(e) => setScriptFilter(e.target.value)}>
            <option value="all">{t('filterAllScripts')}</option>
            {scriptsInCalls.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}

        {activeScript && (
          <span
            className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg sm:ml-auto"
            style={{ background: GREEN_BG, color: 'var(--am-green)' }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--am-green)' }} />
            {t('activeScriptTag', { name: activeScript.name })}
          </span>
        )}
      </div>

      <div className="rounded-2xl border overflow-hidden shadow-md" style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Phone size={32} style={{ color: 'var(--am-muted)', opacity: 0.4 }} />
            <p className="text-sm" style={{ color: 'var(--am-muted)' }}>{t('noCallsFound')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--am-border)' }}>
                  {headers.map((h, i) => (
                    <th key={i} className="text-[11px] font-medium text-left px-4 py-3" style={{ color: 'var(--am-muted)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => renderRow(group.latest, group))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de histórico do cliente — todas as calls do mesmo contactId */}
      {historyGroup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)' }}
          onClick={() => setHistoryKey(null)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl border shadow-xl max-h-[80vh] flex flex-col overflow-hidden"
            style={{ background: 'var(--card)', borderColor: 'var(--am-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 p-5 border-b" style={{ borderColor: 'var(--am-border)' }}>
              <div>
                <h2 className="text-base font-semibold flex items-center gap-2" style={{ color: 'var(--am-text)' }}>
                  <History size={16} />
                  {t('clientHistoryTitle')}
                </h2>
                <p className="text-xs mt-1" style={{ color: 'var(--am-muted)' }}>
                  {t('clientHistorySubtitle', { count: historyGroup.calls.length, prospect: historyGroup.latest.prospect })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryKey(null)}
                aria-label={t('groupHide')}
                className="rounded-md p-1 transition-opacity hover:opacity-70"
                style={{ color: 'var(--am-muted)' }}
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-3 overflow-y-auto space-y-2">
              {historyGroup.calls.map((call) => {
                const r = RESULT_STYLES[call.result] ?? DEFAULT_RESULT_STYLE
                const label = call.result in RESULT_STYLES
                  ? tOutcomes(`short.${call.result}`)
                  : tOutcomes('unknown')
                const showReprocess = canReprocess && shouldShowReprocessButton(call)
                const goToDetail = () => router.push(`/${locale}/calls/${call.id}`)
                return (
                  // Linha como <div> (não <button>) para permitir aninhar o
                  // botão de reanálise sem violar HTML. A navegação para o
                  // detalhe fica no onClick da linha; o ReprocessButton faz
                  // stopPropagation internamente e não dispara a navegação.
                  <div
                    key={call.id}
                    role="button"
                    tabIndex={0}
                    onClick={goToDetail}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        goToDetail()
                      }
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left cursor-pointer transition-opacity hover:opacity-90"
                    style={{ background: 'var(--am-bg3)', borderColor: 'var(--am-border)' }}
                  >
                    <div className="flex flex-col gap-1.5 min-w-0">
                      {/* Linha 1: data + resultado + origem */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[13px] font-medium" style={{ color: 'var(--am-text)' }}>
                          {new Date(call.date).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        {call.isSalesCall === false ? (
                          <NotSalesCallPill label={tOutcomes('notSalesCall')} />
                        ) : (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-full font-mono" style={{ background: r.bg, color: r.color }}>
                            {label}
                          </span>
                        )}
                        {call.lead_source && (
                          <span
                            className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                            style={{ background: 'var(--am-bg4)', color: 'var(--am-accent2)' }}
                          >
                            {LEAD_SOURCE_LABELS[call.lead_source]}
                          </span>
                        )}
                      </div>
                      {/* Linha 2: metadados — vendedor, script, duração, intent */}
                      <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-[11px]" style={{ color: 'var(--am-muted)' }}>
                        {showTrainerColumn && (
                          <span className="font-medium" style={{ color: 'var(--am-text)' }}>{call.trainerName}</span>
                        )}
                        {call.scriptName && (
                          <span
                            className="inline-flex items-center gap-1 font-medium px-1.5 py-0.5 rounded-full"
                            style={
                              call.scriptIsActive
                                ? { background: GREEN_BG, color: 'var(--am-green)' }
                                : { background: 'var(--am-bg4)', color: 'var(--am-muted)' }
                            }
                          >
                            <FileText size={10} />
                            {call.scriptName}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 font-mono">
                          <Clock size={11} />
                          {formatDuration(call.durationSeconds)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          {t('thIntent')}
                          <IntentCell score={call.intent} />
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {call.isSalesCall !== false && <ScorePill score={call.score} />}
                      {showReprocess ? (
                        <ReprocessButton callId={call.id} hasSections={isAnalysisComplete(call)} onRefresh={router.refresh} />
                      ) : (
                        <ChevronRight size={15} style={{ color: 'var(--am-muted)' }} />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
