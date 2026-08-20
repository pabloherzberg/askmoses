import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyPipelineFailure } from '@/lib/services/pipeline-alerts'

// GET /api/cron/snapshot-weekly
//
//   Carimba os agregados da semana em `call_stats_weekly`. Roda segunda 07:00,
//   DEPOIS do sync de opportunities (06:00) e de appointments (06:30) — sem
//   isso o carimbo veria a semana com as vendas do fim de semana faltando.
//
//   Toda a agregação está na função stamp_call_stats_weekly (migration 107).
//   Esta rota só autentica, chama e reporta: trazer as calls pra memória só
//   pra contá-las seria o oposto do que a função existe pra evitar.
//
//   Sem argumento, a função lê o watermark em `job_watermarks` e recalcula
//   só as semanas que mudaram desde a última rodada. Rodar duas vezes seguidas
//   é inofensivo — a segunda recalcula, vê que nada mudou e não grava.
//
//   Auth: header 'Authorization: Bearer $CRON_SECRET' (padrão Vercel Cron).

interface StampResult {
  since: string | null
  weeks_dirty: number | string
  rows_written: number | string
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? ''
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
  if (!process.env.CRON_SECRET || auth !== expected) {
    return Response.json({ error: 'forbidden' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase.rpc('stamp_call_stats_weekly')
    if (error) throw new Error(error.message)

    // A função RETURNS TABLE, então o PostgREST devolve um array de uma linha.
    const row = (Array.isArray(data) ? data[0] : data) as StampResult | undefined

    const result = {
      since: row?.since ?? null,
      weeksDirty: Number(row?.weeks_dirty ?? 0),
      rowsWritten: Number(row?.rows_written ?? 0),
    }
    console.log('[cron/snapshot-weekly]', result)
    return Response.json(result)
  } catch (err) {
    console.error('[cron/snapshot-weekly] falhou:', err)

    // Falha silenciosa aqui é o pior caso: o número simplesmente para de
    // atualizar e ninguém percebe até alguém estranhar o gráfico.
    await notifyPipelineFailure('worker_failed', {
      callId: 'cron:snapshot-weekly',
      error: err,
      reason: 'unknown',
      meta: { operation: 'snapshot-weekly' },
    }).catch(() => {})

    return Response.json({ error: 'stamp failed' }, { status: 500 })
  }
}
