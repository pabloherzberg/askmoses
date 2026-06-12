import { type NextRequest, NextResponse } from 'next/server'
import { getSession, getRole, getOrgId } from '@/lib/auth'
import { dbGetCallById, dbUpdateGhlCallPipeline } from '@/lib/db/calls'
import { dbGetOrgGhlConfigByOrgId } from '@/lib/db/organizations'
import { dbDeleteChunksForCall } from '@/lib/db/call-chunks'
import { downloadRecording, fetchRecordingUrl } from '@/lib/services/ghl-api'
import { putOriginalAudio } from '@/lib/services/call-audio-storage'
import { triggerChunking } from '@/lib/services/chunk-pipeline'

export const runtime = 'nodejs'
export const maxDuration = 300

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ data: null, error: { message: 'Unauthorized', code: 401 } }, { status: 401 })
  }

  const role = await getRole()
  if (role === 'trainer') {
    return NextResponse.json({ data: null, error: { message: 'Forbidden', code: 403 } }, { status: 403 })
  }

  const orgId = await getOrgId()
  if (!orgId) {
    return NextResponse.json({ data: null, error: { message: 'No active org', code: 403 } }, { status: 403 })
  }

  const { id: callId } = await params

  const call = await dbGetCallById(callId, { orgId })
  if (!call) {
    return NextResponse.json({ data: null, error: { message: 'Call not found', code: 404 } }, { status: 404 })
  }

  const ghlConfig = await dbGetOrgGhlConfigByOrgId(orgId)
  if (!ghlConfig) {
    return NextResponse.json(
      { data: null, error: { message: 'GHL integration not configured for this org', code: 422 } },
      { status: 422 },
    )
  }

  try {
    await dbUpdateGhlCallPipeline(callId, { processingStatus: 'processing' })

    // Limpa chunks antigos (mp3s já foram deletados do Storage após a transcrição,
    // então a tabela precisa ser zerada antes de re-cortar).
    await dbDeleteChunksForCall(callId)

    // Resolve a URL do áudio.
    let recordingUrl = call.recording_url ?? null

    if (!recordingUrl) {
      const payload = call.ghl_payload as Record<string, unknown> | null
      const customData = (payload?.customData ?? payload) as Record<string, unknown> | null
      const contactId = (customData?.contactId ?? null) as string | null

      if (!contactId) {
        return NextResponse.json(
          { data: null, error: { message: 'Call sem recording_url e sem contactId — não é possível reanalisar', code: 422 } },
          { status: 422 },
        )
      }

      const ref = await fetchRecordingUrl(contactId, ghlConfig.accessToken)
      if (!ref) {
        return NextResponse.json(
          { data: null, error: { message: 'GHL não retornou URL de gravação para este contato', code: 422 } },
          { status: 422 },
        )
      }
      recordingUrl = ref.url
      await dbUpdateGhlCallPipeline(callId, { recordingUrl })
    }

    // Baixa o áudio, sobe no Storage e dispara o chunking (ffmpeg).
    const audio = await downloadRecording(recordingUrl, ghlConfig.accessToken)
    await putOriginalAudio(callId, audio.buffer, audio.mimeType)
    await dbUpdateGhlCallPipeline(callId, { processingStatus: 'queued_for_chunking' })
    await triggerChunking(callId)

    return NextResponse.json({ data: { callId, status: 'queued_for_chunking' }, error: null })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[reprocess] failed', { callId, err: message })
    await dbUpdateGhlCallPipeline(callId, { processingStatus: 'transcription_failed' }).catch(() => {})
    return NextResponse.json(
      { data: null, error: { message: `Reprocess failed: ${message}`, code: 500 } },
      { status: 500 },
    )
  }
}
