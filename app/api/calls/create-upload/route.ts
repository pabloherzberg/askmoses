import { type NextRequest } from 'next/server'
import {
  forbidden,
  getActiveOrgContext,
  getOrgId,
  getSession,
  getTrainerDbId,
  requireActiveSubscription,
  requireOwnerWrite,
  unauthorized,
} from '@/lib/auth'
import { dbCreateCall } from '@/lib/db/calls'
import { dbGetTrainerById } from '@/lib/db/trainers'
import { createAdminClient } from '@/lib/supabase/admin'
import { CALL_AUDIO_BUCKET, originalStoragePath } from '@/lib/services/call-audio-storage'

// POST /api/calls/create-upload
//
//   Ingest manual de áudio, fluxo assíncrono por chunks (077-080). Substitui o
//   antigo blob-token→transcribe→analyze síncrono SÓ no caminho de áudio (o de
//   transcript colado segue direto em /api/analyze).
//
//   Cria a linha da call (status 'pending') e devolve uma signed upload URL pro
//   áudio ORIGINAL ir DIRETO do browser pro Supabase Storage — assim arquivos
//   grandes (>50MB, justamente os que quebravam o Whisper) não passam pelo body
//   da função. Depois do upload, o browser chama /api/calls/start-chunking.
//
//   Mesmo gating do /api/analyze: sessão, admin-impersonate read-only,
//   subscription ativa, e limite de calls/mês do plano.

export const runtime = 'nodejs'

interface CreateUploadBody {
  trainerId?: string
  trainerName?: string
  trainerEmail?: string
  clientName?: string
}

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session) return unauthorized()

  const writeErr = await requireOwnerWrite()
  if (writeErr) return writeErr

  const subErr = await requireActiveSubscription()
  if (subErr) return subErr

  const orgId = await getOrgId()
  if (!orgId) return forbidden()

  // Gate de calls/mês (mesma regra do analyze: TC-10).
  const ctx = await getActiveOrgContext()
  const admin = createAdminClient()
  if (typeof ctx?.maxCallsPerMonth === 'number') {
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const { count, error: countErr } = await admin
      .from('calls')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .gte('created_at', startOfMonth.toISOString())

    if (countErr) {
      console.error('[calls/create-upload] limit check failed', countErr)
      return Response.json({ error: 'Não foi possível verificar o limite do plano' }, { status: 500 })
    }
    if ((count ?? 0) >= ctx.maxCallsPerMonth) {
      return Response.json(
        {
          error: `Limite de ${ctx.maxCallsPerMonth} calls/mês atingido para o plano dessa organização.`,
          code: 'PLAN_LIMIT_CALLS',
        },
        { status: 403 },
      )
    }
  }

  const body = (await request.json().catch(() => ({}))) as CreateUploadBody

  // trainerId precisa pertencer à org do caller (anti cross-tenant), igual analyze.
  if (body.trainerId) {
    const trainer = await dbGetTrainerById(body.trainerId)
    if (!trainer || trainer.orgId !== orgId) return forbidden()
  }
  const trainerId = body.trainerId ?? (await getTrainerDbId()) ?? undefined
  if (!trainerId || !body.trainerName) {
    return Response.json({ error: 'trainer é obrigatório' }, { status: 400 })
  }

  // Cria a call em 'pending' (sem transcript ainda). O áudio será subido pela
  // signed URL e o chunking disparado por /api/calls/start-chunking.
  let call
  try {
    call = await dbCreateCall({
      orgId,
      trainerId,
      trainerName: body.trainerName,
      trainerEmail: body.trainerEmail,
      clientName: body.clientName,
    })
  } catch (err) {
    console.error('[calls/create-upload] dbCreateCall falhou', err)
    return Response.json({ error: 'Não foi possível criar a call' }, { status: 500 })
  }

  const { data: signed, error: signErr } = await admin.storage
    .from(CALL_AUDIO_BUCKET)
    .createSignedUploadUrl(originalStoragePath(call.id))

  if (signErr || !signed) {
    console.error('[calls/create-upload] createSignedUploadUrl falhou', signErr)
    return Response.json({ error: 'Não foi possível preparar o upload' }, { status: 500 })
  }

  return Response.json({
    data: {
      callId: call.id,
      bucket: CALL_AUDIO_BUCKET,
      path: signed.path,
      token: signed.token,
    },
    error: null,
  })
}
