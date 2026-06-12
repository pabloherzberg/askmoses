import { generateText } from "ai";
import { getOpenAIModel } from "@/lib/openai";

// Translations endpoint sempre devolve transcript em inglês,
// independente do idioma falado. Mesmo modelo Whisper-1, mesma qualidade.
// Usamos pra normalizar o idioma do transcript pro coaching UI/email em EN.
const WHISPER_TRANSLATE_ENDPOINT =
  "https://api.openai.com/v1/audio/translations";

const DEFAULT_PROMPT =
  "This is a sales call between a salesperson and a prospect. Provide a clean, natural English translation of the call.";

// Timeout POR TENTATIVA da chamada ao Whisper. Um chunk é ~10min de áudio
// (~5MB) e o translate volta em ~1min; 120s dá folga. Sem isto, o fetch herda
// o headersTimeout default do undici (5min) — um chunk lento trava o worker
// inteiro e estoura o maxDuration. Com timeout curto + retry, blips de rede
// ("fetch failed") são absorvidos antes de queimar as tentativas do chunk.
const WHISPER_TIMEOUT_MS = 120_000;
const WHISPER_MAX_ATTEMPTS = 3;

// Backoff em duas pistas: para 429, respeitamos o header Retry-After quando
// presente (com piso na escada abaixo) + jitter pra dessincronizar chunks
// concorrentes que levaram 429 juntos. O teto de 45s é deliberado: in-process
// só absorve blip CURTO de rate limit — espera longa pertence à re-fila com
// next_attempt_at (delay de 1-15min via dbRetryOrFailChunk), que não gasta
// tempo de função serverless. O teto também mantém o pior caso de um chunk
// (~480s com timeouts) abaixo do stale-reclaim do worker (600s) — sem isso,
// outro worker re-reivindicaria um chunk ainda em backoff e transcreveria em
// dobro.
const NETWORK_BACKOFF_MS = [1_000, 2_000];
const RATE_LIMIT_BACKOFF_MS = [15_000, 30_000];
const RATE_LIMIT_MAX_WAIT_MS = 45_000;
const RATE_LIMIT_JITTER_MS = 5_000;

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
};

function mimeToExt(mimeType: string): string {
  const base = mimeType.split(";")[0].trim().toLowerCase();
  if (MIME_TO_EXT[base]) return MIME_TO_EXT[base];
  const sub = base.split("/")[1]?.replace(/^x-/, "");
  return sub ?? "mp3";
}

export interface TranscribeOptions {
  prompt?: string;
  filename?: string;
  /** Quando true, faz pós-processamento com LLM pra atribuir speaker labels
   *  (Trainer / Prospect). Adiciona ~$0.005 + ~3-5s por call. Default true
   *  porque transcript sem labels é difícil de ler. */
  diarize?: boolean;
  /** Contexto pra ajudar o LLM a saber quem é Trainer vs Prospect (opcional). */
  trainerName?: string;
  clientName?: string;
}

export async function transcribeAudioBuffer(
  buffer: Buffer,
  mimeType: string,
  options: TranscribeOptions = {},
): Promise<string> {
  const rawTranscript = await callWhisperTranslate(buffer, mimeType, options);
  if (!rawTranscript) return "";

  if (options.diarize === false) {
    return rawTranscript;
  }

  try {
    return await assignSpeakerLabels(rawTranscript, options);
  } catch (err) {
    console.warn(
      "[whisper] diarization step failed, returning raw transcript",
      {
        err: err instanceof Error ? err.message : String(err),
      },
    );
    return rawTranscript;
  }
}

/**
 * Diariza um transcript JÁ pronto (texto puro → turnos rotulados Trainer/
 * Prospect). Usado pelo pipeline de chunks: cada chunk é transcrito SEM
 * diarização (diarize:false) e a diarização roda 1x sobre o transcript
 * consolidado — mais barato e mais coerente que diarizar pedaço a pedaço.
 *
 * Best-effort no caller: se falhar, use o texto sem labels.
 */
export async function diarizeTranscript(
  transcript: string,
  options: Pick<TranscribeOptions, "trainerName" | "clientName"> = {},
): Promise<string> {
  if (!transcript.trim()) return transcript;
  return assignSpeakerLabels(transcript, options);
}

async function callWhisperTranslate(
  buffer: Buffer,
  mimeType: string,
  options: TranscribeOptions,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured in .env");

  const ext = mimeToExt(mimeType);
  const filename = options.filename ?? `audio.${ext}`;

  const ab = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;

  const blob = new Blob([ab], { type: mimeType });

  let lastErr: unknown;
  for (let attempt = 1; attempt <= WHISPER_MAX_ATTEMPTS; attempt++) {
    // FormData é reconstruída por tentativa (o body é consumido no fetch); o
    // Blob é reaproveitável.
    const form = new FormData();
    form.append("file", blob, filename);
    form.append("model", "whisper-1");
    form.append("prompt", options.prompt ?? DEFAULT_PROMPT);

    let rateLimited = false;
    let retryAfterMs: number | null = null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WHISPER_TIMEOUT_MS);
    try {
      const res = await fetch(WHISPER_TRANSLATE_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: controller.signal,
      });

      if (res.ok) {
        const data = (await res.json()) as { text: string };
        return data.text.trim();
      }

      const errText = await res.text();
      if (res.status === 429) {
        // A OpenAI usa 429 pra duas coisas distintas: rate limit (transitório,
        // retry com espera resolve) e insufficient_quota (créditos esgotados —
        // NENHUM retry resolve, precisa de ação humana no billing). Quota falha
        // na hora com marcador próprio pro alerta pedir recarga.
        if (errText.toLowerCase().includes("insufficient_quota")) {
          throw new Error(
            `Whisper API error 429 (insufficient_quota): ${errText}`,
          );
        }
        rateLimited = true;
        retryAfterMs = parseRetryAfter(res);
        lastErr = new Error(`Whisper API error 429: ${errText}`);
      } else if (res.status >= 400 && res.status < 500) {
        // 4xx (exceto 429) é erro de request — retentar não muda nada.
        throw new Error(`Whisper API error ${res.status}: ${errText}`);
      } else {
        lastErr = new Error(`Whisper API error ${res.status}: ${errText}`);
      }
    } catch (err) {
      // Timeout (AbortError) e falha de rede ("fetch failed") são retentáveis;
      // o 4xx (e o 429 de quota) acima é re-lançado direto.
      if (
        err instanceof Error &&
        err.message.startsWith("Whisper API error 4")
      ) {
        throw err;
      }
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }

    if (attempt < WHISPER_MAX_ATTEMPTS) {
      await new Promise((r) =>
        setTimeout(r, backoffMs(attempt, rateLimited, retryAfterMs)),
      );
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error(`Whisper falhou após ${WHISPER_MAX_ATTEMPTS} tentativas`);
}

/** Espera entre tentativas: pista lenta pra 429, pista rápida pro resto. */
function backoffMs(
  attempt: number,
  rateLimited: boolean,
  retryAfterMs: number | null,
): number {
  if (!rateLimited) {
    return NETWORK_BACKOFF_MS[
      Math.min(attempt - 1, NETWORK_BACKOFF_MS.length - 1)
    ];
  }
  const scheduled =
    RATE_LIMIT_BACKOFF_MS[
      Math.min(attempt - 1, RATE_LIMIT_BACKOFF_MS.length - 1)
    ];
  const jitter = Math.floor(Math.random() * RATE_LIMIT_JITTER_MS);
  return Math.min(
    Math.max(retryAfterMs ?? 0, scheduled) + jitter,
    RATE_LIMIT_MAX_WAIT_MS,
  );
}

/** Retry-After pode vir em segundos ou como HTTP-date. */
function parseRetryAfter(res: Response): number | null {
  const header = res.headers.get("retry-after");
  if (!header) return null;
  const secs = Number(header);
  if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
  const at = Date.parse(header);
  return Number.isNaN(at) ? null : Math.max(0, at - Date.now());
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
    : "";
  const clientHint = options.clientName
    ? `The prospect's name is ${options.clientName}.`
    : "";

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
<<<TRANSCRIPT_END>>>`;

  const model = getOpenAIModel("openai/gpt-4o-mini");
  const result = await generateText({ model, prompt, temperature: 0 });
  return result.text.trim();
}
