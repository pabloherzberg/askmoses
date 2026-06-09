import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { dbClaimChunks } from '@/lib/db/call-chunks'
import {
  finalizeCallIfReady,
  kickChunkWorker,
  transcribeChunk,
} from '@/lib/services/chunk-pipeline'

// POST /api/calls/process-chunks
//
//   Worker da fila de transcrição por chunks (migrations 077-080). NÃO é um
//   cron — a fila é auto-drenante por eventos:
//     - o ingest chama após enfileirar (chunkAndEnqueueCall → kickChunkWorker);
//     - este worker re-dispara a si mesmo enquanto reivindica trabalho;
//     - o cron existente (recover-stale-analyses, 15min) cutuca como rede de
//       segurança caso um elo da cadeia morra.
//   Não adicionamos cron próprio: evita o limite de cron jobs do Vercel
//   (Hobby = 2, só diário) e é mais resiliente (dispara na hora do upload).
//
//   Cada execução:
//     1. Reivindica um lote de chunks 'pending' (claim atômico · SKIP LOCKED),
//        baixa cada um do Storage e transcreve via Whisper.
//     2. Para cada call tocada, tenta consolidar se todos os chunks estão done.
//     3. Varre calls presas em 'awaiting_chunks' (safety net de consolidação).
//     4. Se reivindicou algo, re-dispara o próprio worker pra continuar drenando.
//
//   Auth: 'x-internal-secret: $INTERNAL_API_SECRET' (auto-disparo/ingest) OU
//   'Authorization: Bearer $CRON_SECRET' (rede de segurança via cron).

export const runtime = 'nodejs'
export const maxDuration = 300

// Quantos chunks transcrever por execução. Cada chunk ~10min de áudio ≈ alguns
// segundos de Whisper; conservador pra caber folgado em maxDuration.
const CHUNK_BATCH = 5
// Stale de 'processing' (chunk reivindicado mas nunca finalizado): re-elegível.
const STALE_SECONDS = 300
// Calls em 'awaiting_chunks' varridas por run como safety net de consolidação.
const FINALIZE_SCAN_LIMIT = 25

function isAuthorized(request: NextRequest): boolean {
  const internal = request.headers.get('x-internal-secret') ?? ''
  if (process.env.INTERNAL_API_SECRET && internal === process.env.INTERNAL_API_SECRET) {
    return true
  }
  const auth = request.headers.get('authorization') ?? ''
  if (process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) {
    return true
  }
  return false
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ error: 'forbidden' }, { status: 401 })
  }

  let claimed = 0
  let transcribed = 0
  let finalized = 0

  try {
    // ─── 1. Reivindica e transcreve um lote de chunks ──────────────────────
    const chunks = await dbClaimChunks(CHUNK_BATCH, STALE_SECONDS)
    claimed = chunks.length

    const toFinalize = new Set<string>()
    // Sequencial de propósito: limita memória (cada chunk é baixado inteiro) e
    // evita rajada de chamadas simultâneas ao Whisper.
    for (const chunk of chunks) {
      const callId = await transcribeChunk(chunk)
      toFinalize.add(callId)
      transcribed += 1
    }

    // ─── 2 + 3. Consolida calls tocadas + safety net de awaiting_chunks ────
    const admin = createAdminClient()
    const { data: stuck } = await admin
      .from('calls')
      .select('id')
      .eq('processing_status', 'awaiting_chunks')
      .order('updated_at', { ascending: true })
      .limit(FINALIZE_SCAN_LIMIT)
    for (const row of stuck ?? []) toFinalize.add(row.id as string)

    for (const callId of toFinalize) {
      try {
        await finalizeCallIfReady(callId)
        finalized += 1
      } catch (err) {
        console.error('[process-chunks] finalize falhou', {
          callId,
          err: err instanceof Error ? err.message : String(err),
        })
      }
    }

    // ─── 4. Auto-drenagem: se houve trabalho, continua a cadeia ────────────
    // Re-dispara só quando reivindicou algo — evita hot-loop quando a fila
    // está vazia (próximo ingest ou o cron de 15min reativam).
    if (claimed > 0) {
      kickChunkWorker()
    }
  } catch (err) {
    console.error('[process-chunks] run falhou:', err)
    return Response.json(
      { error: 'run failed', claimed, transcribed, finalized },
      { status: 500 },
    )
  }

  return Response.json({ claimed, transcribed, finalized })
}
