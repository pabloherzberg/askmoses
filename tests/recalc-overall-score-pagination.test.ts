/**
 * scripts/recalc-overall-score-history.mts — leitura paginada e trilha antes
 * do UPDATE.
 *
 * O select único devolvia só 1000 linhas (max-rows do PostgREST, sem erro) de
 * ~1075 calls com sections: o resto nunca era recalculado. E a trilha em
 * calls_data_corrections falhando só gerava um AVISO — o UPDATE seguia sem
 * registro.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, it, expect } from 'vitest'
import {
  CALLS_PAGE_SIZE,
  applyOverallScoreCorrection,
  fetchCallsWithSections,
  type CallWithSections,
} from '@/lib/data-corrections/recalc-overall-score'

const PG_MAX_ROWS = 1000

function makeRows(n: number): CallWithSections[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `call-${String(i).padStart(5, '0')}`,
    sections: [{ name: 'Discovery', score: 80, weight: 1 }],
    overall_score: 80,
  }))
}

// Simula o PostgREST: aplica o range pedido e, como o servidor real, nunca
// devolve mais que max-rows numa resposta.
function mockReadClient(rows: CallWithSections[], opts: { failAtOffset?: number } = {}) {
  const ranges: Array<[number, number]> = []
  const orders: string[] = []
  const client = {
    from(table: string) {
      expect(table).toBe('calls')
      const q = {
        select: () => q,
        not: () => q,
        order: (col: string) => { orders.push(col); return q },
        range: async (from: number, to: number) => {
          ranges.push([from, to])
          if (opts.failAtOffset === from) return { data: null, error: { message: 'boom' } }
          const count = Math.min(to - from + 1, PG_MAX_ROWS)
          return { data: rows.slice(from, from + count), error: null }
        },
      }
      return q
    },
  }
  return { client: client as unknown as SupabaseClient, ranges, orders }
}

describe('fetchCallsWithSections — paginação', () => {
  it('lê as 1075 calls em lotes de 500, não para em 1000', async () => {
    const rows = makeRows(1075)
    const { client, ranges } = mockReadClient(rows)

    const result = await fetchCallsWithSections(client)

    expect(CALLS_PAGE_SIZE).toBe(500)
    expect(ranges).toEqual([[0, 499], [500, 999], [1000, 1499]])
    expect(result).toHaveLength(1075)
    expect(new Set(result.map((r) => r.id)).size).toBe(1075)
    expect(result[1074].id).toBe('call-01074')
  })

  it('total múltiplo do lote: busca uma página vazia a mais e para', async () => {
    const { client, ranges } = mockReadClient(makeRows(1000))
    const result = await fetchCallsWithSections(client)
    expect(result).toHaveLength(1000)
    expect(ranges).toEqual([[0, 499], [500, 999], [1000, 1499]])
  })

  it('ordena por id em toda página — sem ordem estável o offset repete ou pula linhas', async () => {
    const { client, orders, ranges } = mockReadClient(makeRows(1075))
    await fetchCallsWithSections(client)
    expect(orders).toHaveLength(ranges.length)
    expect(orders.every((c) => c === 'id')).toBe(true)
  })

  it('erro em qualquer página lança — nada de seguir com lista parcial', async () => {
    const { client } = mockReadClient(makeRows(1075), { failAtOffset: 500 })
    await expect(fetchCallsWithSections(client)).rejects.toThrow(/offset 500.*boom/)
  })
})

function mockWriteClient(opts: { auditError?: string; updateError?: string }) {
  const calls: string[] = []
  const client = {
    from(table: string) {
      return {
        insert: async () => {
          calls.push(`insert:${table}`)
          return { error: opts.auditError ? { message: opts.auditError } : null }
        },
        update: () => ({
          eq: async () => {
            calls.push(`update:${table}`)
            return { error: opts.updateError ? { message: opts.updateError } : null }
          },
        }),
      }
    },
  }
  return { client: client as unknown as SupabaseClient, calls }
}

const AUDIT = { appliedBy: '116_recalc_overall_score_history:victor', reason: 'teste' }

describe('applyOverallScoreCorrection — trilha antes do UPDATE', () => {
  it('trilha ok → grava a trilha e depois atualiza a call', async () => {
    const { client, calls } = mockWriteClient({})
    const r = await applyOverallScoreCorrection(client, { id: 'c1', overall_score: 70 }, 82, AUDIT)
    expect(r.result).toBe('updated')
    expect(calls).toEqual(['insert:calls_data_corrections', 'update:calls'])
  })

  it('trilha falha → NÃO faz o UPDATE', async () => {
    const { client, calls } = mockWriteClient({ auditError: 'permission denied' })
    const r = await applyOverallScoreCorrection(client, { id: 'c1', overall_score: 70 }, 82, AUDIT)
    expect(r).toEqual({ result: 'audit_failed', message: 'permission denied' })
    expect(calls).toEqual(['insert:calls_data_corrections'])
  })

  it('update falha → reporta update_failed', async () => {
    const { client } = mockWriteClient({ updateError: 'timeout' })
    const r = await applyOverallScoreCorrection(client, { id: 'c1', overall_score: 70 }, 82, AUDIT)
    expect(r).toEqual({ result: 'update_failed', message: 'timeout' })
  })
})
