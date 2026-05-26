import { generateText } from "ai"
import { getOpenAIModel } from "@/lib/openai"

// Translations endpoint sempre devolve transcript em inglês,
// independente do idioma falado. Mesmo modelo Whisper-1, mesma qualidade.
// Usamos pra normalizar o idioma do transcript pro coaching UI/email em EN.
const WHISPER_TRANSLATE_ENDPOINT = "https://api.openai.com/v1/audio/translations"

const DEFAULT_PROMPT =
  "This is a sales call between a salesperson and a prospect. Provide a clean, natural English translation of the call."

// Whisper API olha a EXTENSÃO do filename pra decidir formato, não o MIME.
// Lista permitida: flac, m4a, mp3, mp4, mpeg, mpga, oga, ogg, wav, webm.
// GHL devolve `audio/x-wav` (MIME legado Microsoft); split direto vira
// `x-wav` que NÃO bate com `wav` na lista do Whisper → 400.
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
  /** Quando true, faz pós-processamento com LLM pra atribuir speaker labels
   *  (Trainer / Prospect). Adiciona ~$0.005 + ~3-5s por call. Default true
   *  porque transcript sem labels é difícil de ler. */
  diarize?: boolean
  /** Contexto pra ajudar o LLM a saber quem é Trainer vs Prospect (opcional). */
  trainerName?: string
  clientName?: string
}

export async function transcribeAudioBuffer(
  buffer: Buffer,
  mimeType: string,
  options: TranscribeOptions = {},
): Promise<string> {
  const rawTranscript = await callWhisperTranslate(buffer, mimeType, options)
  if (!rawTranscript) return ""

  if (options.diarize === false) {
    return rawTranscript
  }

  try {
    return await assignSpeakerLabels(rawTranscript, options)
  } catch (err) {
    console.warn("[whisper] diarization step failed, returning raw transcript", {
      err: err instanceof Error ? err.message : String(err),
    })
    return rawTranscript
  }
}

async function callWhisperTranslate(
  buffer: Buffer,
  mimeType: string,
  options: TranscribeOptions,
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

  const res = await fetch(WHISPER_TRANSLATE_ENDPOINT, {
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

/**
 * Whisper não faz diarização nativa. Pra dar speaker labels usáveis no UI/email
 * sem trocar de provider, jogamos o transcript bruto pro gpt-4o-mini e pedimos
 * pra reescrever em turnos rotulados.
 *
 * Não é speaker diarization "verdadeiro" (não usa pistas acústicas), mas pra
 * conversas 1-a-1 onde o conteúdo deixa claro quem é o vendedor vs prospect
 * (apresentações, perguntas de discovery, ofertas), funciona bem o suficiente.
 *
 * Quando virar gargalo de qualidade, migrar pra AssemblyAI/Deepgram com
 * diarize:true. Por enquanto, mais barato manter no Whisper + LLM split.
 */
async function assignSpeakerLabels(
  rawTranscript: string,
  options: TranscribeOptions,
): Promise<string> {
  const trainerHint = options.trainerName
    ? `The salesperson's name is ${options.trainerName}.`
    : ""
  const clientHint = options.clientName
    ? `The prospect's name is ${options.clientName}.`
    : ""

  const prompt = `You receive a raw English transcript of a sales call between a salesperson (labeled "Trainer") and a prospective customer (labeled "Prospect"). The transcript has no speaker labels — your job is to add them.

${trainerHint} ${clientHint}

Output rules:
- Each utterance gets a label prefix: "Trainer:" or "Prospect:".
- One label per line. New speaker = new line.
- Preserve the exact words; do not paraphrase or summarize.
- If a sentence clearly belongs to a different speaker than the one before, split it onto a new line with the right label.
- If you genuinely cannot tell who spoke (ambient or filler), use "Trainer:" as default for that line — sales call recordings usually start with the salesperson.

Do NOT add anything else. No preamble, no markdown, no commentary. Output only the labeled transcript.

Raw transcript:
<<<TRANSCRIPT_BEGIN>>>
${rawTranscript}
<<<TRANSCRIPT_END>>>`

  const model = getOpenAIModel("openai/gpt-4o-mini")
  const result = await generateText({ model, prompt, temperature: 0 })
  return result.text.trim()
}
