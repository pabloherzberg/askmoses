const DEFAULT_PROMPT =
  "This is a sales call between a dog training business and a prospect. Identify speakers as Trainer and Prospect."

const WHISPER_ENDPOINT = "https://api.openai.com/v1/audio/transcriptions"

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

  const ext = mimeType.split("/")[1]?.split(";")[0] ?? "mp3"
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
