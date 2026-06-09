import { type NextRequest } from 'next/server'
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
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const internal = request.headers.get('x-internal-secret') ?? ''
  if (!process.env.INTERNAL_API_SECRET || internal !== process.env.INTERNAL_API_SECRET) {
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

  try {
    await runChunkingForCall(callId)
  } catch (err) {
    console.error('[calls/chunk] chunking falhou', {
      callId,
      err: err instanceof Error ? err.message : String(err),
    })
    // Garante estado terminal mesmo em falhas fora do escopo do chunkAndEnqueue
    // (ex.: download do original do Storage). UPDATE idempotente.
    await dbUpdateGhlCallPipeline(callId, { processingStatus: 'transcription_failed' }).catch(
      () => {},
    )
    await notifyPipelineFailure('transcription_failed', { callId, error: err })
    return Response.json({ error: 'chunking failed' }, { status: 500 })
  }

  return Response.json({ data: { callId, status: 'chunking_started' }, error: null })
}
