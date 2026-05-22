const DEFAULT_PROMPT =
  "This is a sales call between a dog training business and a prospect. Identify speakers as Trainer and Prospect."

const WHISPER_ENDPOINT = "https://api.openai.com/v1/audio/transcriptions"

// Whisper API olha a EXTENSÃO do filename pra decidir formato, não o MIME.
// Sua lista permitida: flac, m4a, mp3, mp4, mpeg, mpga, oga, ogg, wav, webm.
// GHL devolve `audio/x-wav` (MIME legado Microsoft); split direto vira
// `x-wav` que NÃO bate com `wav` na lista do Whisper → 400. Por isso o
// map explícito + fallback que strip o prefixo `x-`.
const MIME_TO_EXT: Record<string, string> = {
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
  "audio/vnd.wave": "wav",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "mp4",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/ogg": "ogg",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
  "audio/webm": "webm",
}

function mimeToExt(mimeType: string): string {
  const base = mimeType.split(";")[0].trim().toLowerCase()
  if (MIME_TO_EXT[base]) return MIME_TO_EXT[base]
  const sub = base.split("/")[1]?.replace(/^x-/, "")
  return sub ?? "mp3"
}

export interface TranscribeOptions {
  prompt?: string
  filename?: string
}

export async function transcribeAudioBuffer(
  buffer: Buffer,
  mimeType: string,
  options: TranscribeOptions = {},
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured in .env")

  const ext = mimeToExt(mimeType)
  const filename = options.filename ?? `audio.${ext}`

  const ab = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer

  const form = new FormData()
  form.append("file", new Blob([ab], { type: mimeType }), filename)
  form.append("model", "whisper-1")
  form.append("prompt", options.prompt ?? DEFAULT_PROMPT)

  const res = await fetch(WHISPER_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Whisper API error ${res.status}: ${err}`)
  }

  const data = (await res.json()) as { text: string }
  return data.text.trim()
}
