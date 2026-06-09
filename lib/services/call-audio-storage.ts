import { createAdminClient } from '@/lib/supabase/admin'

// ────────────────────────────────────────────────────────────────────────────
// Storage transitório dos chunks de áudio (bucket `call-audio`, migration 080).
//
// Os arquivos vivem só enquanto o chunk está na fila; são deletados assim que
// transcritos. Todo acesso é server-side via service role (admin client),
// então o bucket é privado e não tem policies de usuário.
// ────────────────────────────────────────────────────────────────────────────

export const CALL_AUDIO_BUCKET = 'call-audio'

/** Path determinístico do chunk no bucket. */
export function chunkStoragePath(callId: string, chunkIndex: number): string {
  return `chunks/${callId}/${chunkIndex}.mp3`
}

/**
 * Path do áudio ORIGINAL (transitório). Vive só entre o ingest e o chunking:
 * a rota /api/calls/chunk baixa daqui, corta, e deleta. Extensão neutra porque
 * o ffmpeg detecta o formato pelo conteúdo, não pelo nome.
 */
export function originalStoragePath(callId: string): string {
  return `originals/${callId}.input`
}

/** Sobe o áudio original (ingest manual ou recording do GHL). */
export async function putOriginalAudio(
  callId: string,
  buffer: Buffer,
  contentType = 'application/octet-stream',
): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.storage
    .from(CALL_AUDIO_BUCKET)
    .upload(originalStoragePath(callId), buffer, { contentType, upsert: true })

  if (error) throw new Error(`putOriginalAudio(${callId}): ${error.message}`)
}

/** Baixa o áudio original pra cortar. */
export async function getOriginalAudio(callId: string): Promise<Buffer> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.storage
    .from(CALL_AUDIO_BUCKET)
    .download(originalStoragePath(callId))

  if (error) throw new Error(`getOriginalAudio(${callId}): ${error.message}`)
  if (!data) throw new Error(`getOriginalAudio(${callId}): resposta vazia`)

  return Buffer.from(await data.arrayBuffer())
}

/** Remove o áudio original após o chunking (best-effort). */
export async function deleteOriginalAudio(callId: string): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.storage
    .from(CALL_AUDIO_BUCKET)
    .remove([originalStoragePath(callId)])
  if (error) {
    console.warn(`[call-audio-storage] deleteOriginalAudio(${callId}) falhou: ${error.message}`)
  }
}

/** Sobe o mp3 de um chunk. `upsert` true pra ser idempotente em re-chunking. */
export async function putChunkAudio(
  path: string,
  buffer: Buffer,
  contentType = 'audio/mpeg',
): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.storage
    .from(CALL_AUDIO_BUCKET)
    .upload(path, buffer, { contentType, upsert: true })

  if (error) throw new Error(`putChunkAudio(${path}): ${error.message}`)
}

/** Baixa o mp3 de um chunk como Buffer pro worker transcrever. */
export async function getChunkAudio(path: string): Promise<Buffer> {
  const supabase = createAdminClient()
  const { data, error } = await supabase.storage.from(CALL_AUDIO_BUCKET).download(path)

  if (error) throw new Error(`getChunkAudio(${path}): ${error.message}`)
  if (!data) throw new Error(`getChunkAudio(${path}): resposta vazia`)

  const arrayBuffer = await data.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

/** Remove um arquivo de chunk (best-effort: não lança em "não existe"). */
export async function deleteChunkAudio(path: string): Promise<void> {
  const supabase = createAdminClient()
  const { error } = await supabase.storage.from(CALL_AUDIO_BUCKET).remove([path])
  if (error) {
    console.warn(`[call-audio-storage] deleteChunkAudio(${path}) falhou: ${error.message}`)
  }
}

/**
 * Apaga todos os arquivos de chunk de uma call (cleanup pós-consolidação).
 * Best-effort — lista o prefixo e remove em lote.
 */
export async function deleteAllChunkAudioForCall(callId: string): Promise<void> {
  const supabase = createAdminClient()
  const prefix = `chunks/${callId}`

  const { data: files, error: listErr } = await supabase.storage
    .from(CALL_AUDIO_BUCKET)
    .list(prefix)

  if (listErr) {
    console.warn(`[call-audio-storage] list(${prefix}) falhou: ${listErr.message}`)
    return
  }
  if (!files || files.length === 0) return

  const paths = files.map((f) => `${prefix}/${f.name}`)
  const { error: rmErr } = await supabase.storage.from(CALL_AUDIO_BUCKET).remove(paths)
  if (rmErr) {
    console.warn(`[call-audio-storage] remove lote (${prefix}) falhou: ${rmErr.message}`)
  }
}
