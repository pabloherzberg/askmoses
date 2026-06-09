import { type NextRequest } from 'next/server'
import { forbidden, getOrgId, getSession, requireOwnerWrite, unauthorized } from '@/lib/auth'
import { dbGetCallById, dbUpdateGhlCallPipeline } from '@/lib/db/calls'
import { triggerChunking } from '@/lib/services/chunk-pipeline'

// POST /api/calls/start-chunking  { callId: string }
//
//   Segundo passo do ingest manual de áudio: o browser já subiu o original pela
//   signed URL (de /api/calls/create-upload); aqui marcamos a call como
//   'queued_for_chunking' e disparamos o chunking. O resto (transcrição,
//   scoring, email) roda assíncrono no pipeline de chunks.

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const writeErr = await requireOwnerWrite()
  if (writeErr) return writeErr

  const orgId = await getOrgId()
  if (!orgId) return forbidden()

  const body = (await request.json().catch(() => ({}))) as { callId?: string }
  if (!body.callId) return Response.json({ error: 'callId required' }, { status: 400 })

  // A call precisa existir e pertencer à org do caller (anti cross-tenant).
  const call = await dbGetCallById(body.callId, { orgId })
  if (!call) return forbidden()

  await dbUpdateGhlCallPipeline(call.id, { processingStatus: 'queued_for_chunking' })
  triggerChunking(call.id)

  return Response.json({ data: { callId: call.id, status: 'queued_for_chunking' }, error: null })
}
