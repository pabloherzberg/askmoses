import { after, type NextRequest } from 'next/server'
import { dbUpdateGhlCallPipeline } from '@/lib/db/calls'
import { runChunkingForCall } from '@/lib/services/chunk-pipeline'
import { notifyPipelineFailure } from '@/lib/services/pipeline-alerts'

// POST /api/calls/chunk  { callId: string }
//
//   Rota de chunking — a ÚNICA que roda ffmpeg (binário incluído no bundle via
//   outputFileTracingIncludes em next.config.mjs). Disparada fire-and-forget
//   pelo ingest (manual e GHL) DEPOIS que o áudio original já está no Storage.
//
//   Baixa o original, corta em chunks sobrepostos, enfileira em call_chunks,
//   apaga o original e cutuca o worker. A transcrição em si roda depois, no
//   worker auto-drenante (/api/calls/process-chunks).
//
//   Auth: 'x-internal-secret: $INTERNAL_API_SECRET' (chamada server-to-server).

export const runtime = 'nodejs'
// Áudio longo (ex.: call de 5h ≈ 30 chunks de ffmpeg + download de ~430MB do
// Storage) não cabe em 300s. Fluid Compute (Vercel Teams) suporta até 800s.
export const maxDuration = 800

export async function POST(request: NextRequest) {
  const internal = request.headers.get('x-internal-secret') ?? ''
  if (!process.env.INTERNAL_API_SECRET) {
    console.error('[calls/chunk] MISCONFIG: INTERNAL_API_SECRET ausente — rota interna desabilitada')
    return Response.json({ error: 'forbidden' }, { status: 401 })
  }
  if (internal !== process.env.INTERNAL_API_SECRET) {
    return Response.json({ error: 'forbidden' }, { status: 401 })
  }

  let callId: string
  try {
    const body = (await request.json()) as { callId?: string }
    if (!body.callId) return Response.json({ error: 'callId required' }, { status: 400 })
    callId = body.callId
  } catch {
    return Response.json({ error: 'invalid JSON' }, { status: 400 })
  }

  // Processa em BACKGROUND e responde já (202). O disparo (triggerChunking) é um
  // self-fetch que, em serverless, era morto quando a função do CALLER retornava
  // — e como esta rota era SÍNCRONA (corte de uma call de 5h leva minutos), o
  // caller tinha que segurar o fetch o tempo todo, então ele era cortado e a
  // call ficava presa em 'queued_for_chunking' de forma intermitente. Com
  // after(), a rota responde na hora; o caller (também em after()) confirma a
  // entrega rápida, e o corte roda aqui desacoplado, dentro do maxDuration desta
  // função (que é a que tem o ffmpeg + os 800s).
  const id = callId
  after(async () => {
    try {
      await runChunkingForCall(id)
    } catch (err) {
      console.error('[calls/chunk] chunking falhou', {
        callId: id,
        err: err instanceof Error ? err.message : String(err),
      })
      // Estado terminal mesmo em falhas fora do escopo do chunkAndEnqueue
      // (ex.: download do original do Storage). UPDATE idempotente.
      await dbUpdateGhlCallPipeline(id, { processingStatus: 'transcription_failed' }).catch(
        () => {},
      )
      await notifyPipelineFailure('transcription_failed', { callId: id, error: err })
    }
  })

  return Response.json(
    { data: { callId, status: 'chunking_started' }, error: null },
    { status: 202 },
  )
}
