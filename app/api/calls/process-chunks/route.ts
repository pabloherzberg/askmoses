import { after, type NextRequest } from 'next/server'
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
// Fluid Compute (Vercel Teams) suporta até 800s. Damos folga porque o batch
// agora roda concorrente e queremos drenar bastante chunk por ciclo.
export const maxDuration = 800

// Quantos chunks reivindicar por execução. Como agora a transcrição do batch
// roda CONCORRENTE (Promise.all), este número é o nível de CONCORRÊNCIA, não um
// multiplicador de tempo: N chunks terminam em ~1 chunk de tempo (~45s), não N.
// O fix do after() removeu a antiga trava do headersTimeout (que me obrigou a
// usar 2), então dá pra subir. Limites a respeitar: maxDuration desta função e
// o rate-limit do Whisper (429 já tem retry/backoff no whisper.ts). 6 é um
// equilíbrio seguro; ajuste vendo o comportamento real.
const CHUNK_BATCH = 6
// Stale de 'processing' (chunk reivindicado mas nunca finalizado): re-elegível.
const STALE_SECONDS = 300
// Calls em 'awaiting_chunks' varridas por run como safety net de consolidação.
const FINALIZE_SCAN_LIMIT = 25

function isAuthorized(request: NextRequest): boolean {
  if (!process.env.INTERNAL_API_SECRET && !process.env.CRON_SECRET) {
    console.error('[process-chunks] MISCONFIG: nem INTERNAL_API_SECRET nem CRON_SECRET configurados — worker desabilitado')
  }
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

  // Processa em BACKGROUND e responde já. O worker é disparado por self-fetch
  // fire-and-forget (kickChunkWorker / triggerChunking → chunk). Se a resposta
  // esperasse o batch inteiro terminar, o fetch do disparo estouraria o
  // headersTimeout default do undici (5min → UND_ERR_HEADERS_TIMEOUT) sempre que
  // um run chegasse perto disso. Com after(), o disparo recebe 200 na hora e o
  // batch roda desacoplado — a Vercel mantém a função viva pro after() (mesmo
  // padrão do webhook do GHL). O work completa independente da conexão do kick.
  after(async () => {
    let claimed = 0
    let transcribed = 0
    let finalized = 0

    try {
      // ─── 1. Reivindica e transcreve um lote de chunks ────────────────────
      const chunks = await dbClaimChunks(CHUNK_BATCH, STALE_SECONDS)
      claimed = chunks.length

      const toFinalize = new Set<string>()
      // Transcreve o batch em PARALELO. transcribeChunk é I/O-bound (download do
      // chunk + Whisper), trata o próprio erro e NUNCA lança — então Promise.all
      // é seguro e N chunks terminam em ~1 chunk de tempo, não N. A concorrência
      // é limitada pelo tamanho do batch (CHUNK_BATCH). Memória: cada chunk
      // (~5MB transcodado) × CHUNK_BATCH — folgado.
      const callIds = await Promise.all(chunks.map((chunk) => transcribeChunk(chunk)))
      for (const callId of callIds) {
        toFinalize.add(callId)
        transcribed += 1
      }

      // ─── 2 + 3. Consolida calls tocadas + safety net de awaiting_chunks ──
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

      // ─── 4. Auto-drenagem: se houve trabalho, continua a cadeia ──────────
      // Re-dispara só quando reivindicou algo — evita hot-loop quando a fila
      // está vazia (próximo ingest ou o cron de 15min reativam). Aguarda dentro
      // do after() pra garantir que o request saia antes da função congelar.
      if (claimed > 0) {
        await kickChunkWorker()
      }
    } catch (err) {
      console.error('[process-chunks] run falhou:', err)
    }
  })

  // Aceito: o batch roda no after(). 202 deixa claro que é assíncrono.
  return Response.json({ accepted: true }, { status: 202 })
}
