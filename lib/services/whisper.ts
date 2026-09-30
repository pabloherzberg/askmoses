import { generateText } from "ai";
// Transcrição de áudio (Whisper STT) é OpenAI-only — resolve a chave OpenAI do
// banco (getProviderApiKey), com fallback pro .env. A diarização (limpeza de
// texto) segue o provider ATIVO como o resto do pipeline. Ver
// lib/constants/ai-modules.ts (diarização fica fora do tuning por módulo).
import { getActiveLlmModel, getProviderApiKey } from "@/lib/llm-provider";
import { recordLlmUsage } from "@/lib/services/llm-usage";

// Translations endpoint sempre devolve transcript em inglês,
// independente do idioma falado. Mesmo modelo Whisper-1, mesma qualidade.
// Usamos pra normalizar o idioma do transcript pro coaching UI/email em EN.
const WHISPER_TRANSLATE_ENDPOINT =
  "https://api.openai.com/v1/audio/translations";

// ─── Por que NÃO enviamos `prompt` por padrão ────────────────────────────────
// Havia aqui um DEFAULT_PROMPT: "This is a sales call between a salesperson and
// a prospect. Provide a clean, natural English translation of the call."
//
// Ele causou 30 calls com transcrição corrompida entre junho e setembro de 2026,
// e foi removido em 2026-09-19. Duas razões, nesta ordem:
//
// 1. NÃO FAZIA O QUE DIZIA. O `prompt` do Whisper não é canal de instrução — é
//    texto de CONDICIONAMENTO, prepended ao contexto do decoder como amostra do
//    vocabulário esperado. O modelo nunca leu aquilo como comando. E a segunda
//    frase era inócua de qualquer forma: este é o endpoint /audio/translations,
//    que sempre devolve inglês (ver nota acima), então pedir "English
//    translation" não mudava nada.
//
// 2. VIRAVA A SAÍDA quando o áudio não tinha fala. Sem sinal acústico
//    competindo — silêncio, música de espera, lado mudo, cauda da gravação
//    depois do desligamento — a continuação mais provável dos tokens do prompt
//    é o próprio prompt. O decoder entra em loop e emite a frase dezenas de
//    vezes. A API devolve 200 com um `text` bem formado: do ponto de vista dela
//    não houve erro.
//
// Como toda call do GHL passa pelo chunking (ghl-call-pipeline.ts) em janelas
// de 10 min, e cada chunk era condicionado separadamente, a exposição crescia
// com a duração: 4,3x mais corrupção em call acima de 30 min que em call de até
// 10 min. Um terço dos casos, porém, foi em chunk ÚNICO — call curta quase sem
// fala (caixa postal, ninguém atendeu). Não é um problema de call longa: é uma
// chance de corromper a cada 10 minutos de áudio.
//
// `options.prompt` continua existindo como escape hatch deliberado. O que não
// volta é um default global — se algum caller precisar condicionar, que assuma
// a escolha explicitamente, ciente do que está acima.

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
  /** Atribuição de custo do passo de diarização (telemetria COGS, opcional). */
  orgId?: string | null;
  callId?: string | null;
}

export interface TranscriptionResult {
  /** Texto aproveitável. "" quando o Whisper devolveu saída degenerada. */
  text: string;
  /** O que o Whisper devolveu, sempre — inclusive quando rejeitado. É a
   *  evidência que permite conferir falso positivo do guard. */
  raw: string;
  degenerate: boolean;
  stats: DegenerateStats;
}

/**
 * Transcreve e devolve a medida de qualidade junto.
 *
 * Existe porque o pipeline de chunks precisa de três coisas que o retorno
 * simples esconde: a razão medida (pra calibrar o limiar com dados reais), o
 * texto cru (evidência quando rejeitado) e o veredito. Quem não precisa disso
 * usa transcribeAudioBuffer.
 */
export async function transcribeAudioDetailed(
  buffer: Buffer,
  mimeType: string,
  options: TranscribeOptions = {},
): Promise<TranscriptionResult> {
  const raw = await callWhisperTranslate(buffer, mimeType, options);
  const stats = degenerateStats(raw);

  if (!raw) return { text: "", raw, degenerate: false, stats };

  if (isDegenerateTranscript(raw)) {
    // Sem fala aproveitável. Texto VAZIO em vez de exceção: o trecho não tinha
    // conteúdo, e o stitcher já descarta chunk vazio. Lançar queimaria as 3
    // tentativas e derrubaria a call inteira por causa de um pedaço que nunca
    // teve nada — inclusive nas longas, onde o resto é conversa boa.
    console.warn("[whisper] saída degenerada descartada", {
      filename: options.filename,
      ...stats,
    });
    return { text: "", raw, degenerate: true, stats };
  }

  if (options.diarize === false) {
    return { text: raw, raw, degenerate: false, stats };
  }

  try {
    return { text: await assignSpeakerLabels(raw, options), raw, degenerate: false, stats };
  } catch (err) {
    console.warn("[whisper] diarization step failed, returning raw transcript", {
      err: err instanceof Error ? err.message : String(err),
    });
    return { text: raw, raw, degenerate: false, stats };
  }
}

export async function transcribeAudioBuffer(
  buffer: Buffer,
  mimeType: string,
  options: TranscribeOptions = {},
): Promise<string> {
  const { text } = await transcribeAudioDetailed(buffer, mimeType, options);
  return text;
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
  options: Pick<TranscribeOptions, "trainerName" | "clientName" | "orgId" | "callId"> = {},
): Promise<string> {
  if (!transcript.trim()) return transcript;
  return assignSpeakerLabels(transcript, options);
}

async function callWhisperTranslate(
  buffer: Buffer,
  mimeType: string,
  options: TranscribeOptions,
): Promise<string> {
  // Chave OpenAI do banco (llm_provider_settings) com fallback pro .env — assim
  // uma chave OpenAI configurada na tela /admin/llm-config vale inclusive pra
  // transcrição, que é OpenAI-only (Whisper).
  const apiKey = await getProviderApiKey("openai");
  if (!apiKey) throw new Error("Nenhuma chave OpenAI configurada (banco ou OPENAI_API_KEY)");

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
    if (options.prompt) form.append("prompt", options.prompt);

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

// ─── Detecção de saída degenerada ────────────────────────────────────────────
// Mede a razão de SENTENÇAS únicas, não de palavras. A razão por palavra cai
// naturalmente com o tamanho do texto (textos longos repetem vocabulário), então
// um limiar único erraria em chunk curto ou longo. Já repetir uma SENTENÇA
// inteira é o que conversa real praticamente nunca faz — e é exatamente o que a
// alucinação do Whisper produz.
//
// Aplicada POR CHUNK, aqui dentro, e não no transcript consolidado: medido em
// 2026-09-19 sobre 1.436 transcrições consolidadas, as duas populações se
// sobrepõem (normal com 0,002; corrompida com 0,976), porque uma call longa com
// um chunk ruim tem conversa real diluindo a razão. Antes da costura a separação
// é limpa — um chunk inteiramente degenerado não tem texto legítimo a diluir.
//
// LIMIAR PROVISÓRIO. 0,3 é conservador: pega o caso claro (frase repetida
// dezenas de vezes fica perto de zero) sem risco de descartar chunk legítimo.
// Não foi calibrado contra dados de chunk porque o banco só guarda o
// consolidado — os chunks são apagados após a costura. O console.warn acima
// existe pra isso: acumular razões reais de chunk e permitir recalibrar.
const DEGENERATE_SENTENCE_RATIO = 0.3;

// Abaixo disto a razão é ruído: um chunk com 3 sentenças pode legitimamente ter
// uma repetida. Só medimos quando há amostra suficiente.
const DEGENERATE_MIN_SENTENCES = 5;

function splitSentences(text: string): string[] {
  return text
    .split(/[.!?\n]+/)
    .map((s) => s.trim().toLowerCase().replace(/\s+/g, " "))
    // Fragmentos curtos ("ok", "yeah", "mm-hmm") repetem à vontade em conversa
    // real — contá-los derrubaria a razão de transcrição legítima.
    .filter((s) => s.length > 12);
}

export interface DegenerateStats {
  sentences: number;
  unique: number;
  /** Sentenças únicas / total. null quando não há amostra pra medir. */
  ratio: number | null;
}

export function degenerateStats(text: string): DegenerateStats {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return { sentences: 0, unique: 0, ratio: null };
  const unique = new Set(sentences).size;
  return {
    sentences: sentences.length,
    unique,
    ratio: Math.round((unique / sentences.length) * 1000) / 1000,
  };
}

/**
 * O Whisper devolveu repetição degenerada em vez de transcrição?
 *
 * Texto vazio NÃO é degenerado — é ausência, e o caller já trata. Amostra
 * pequena também não: sem sentenças suficientes a razão não significa nada.
 */
export function isDegenerateTranscript(text: string): boolean {
  const { sentences, ratio } = degenerateStats(text);
  if (ratio === null) return false;
  if (sentences < DEGENERATE_MIN_SENTENCES) return false;
  return ratio < DEGENERATE_SENTENCE_RATIO;
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

  const { model, provider, modelId } = await getActiveLlmModel("gpt-4o-mini");
  const result = await generateText({ model, prompt, temperature: 0 });

  // Telemetria de custo p/ COGS (best-effort). orgId/callId só chegam quando o
  // caller os passa (chunk-pipeline finalizeCallIfReady); senão fica sem org.
  void recordLlmUsage({
    orgId: options.orgId ?? null,
    surface: "diarization",
    provider,
    model: modelId,
    inputTokens: result.usage?.inputTokens ?? 0,
    outputTokens: result.usage?.outputTokens ?? 0,
    callId: options.callId ?? null,
  });

  const labeled = result.text.trim();

  // Camada separada de isDegenerateTranscript (que guarda a TRANSCRIÇÃO do
  // Whisper, por chunk). Este ponto é a DIARIZAÇÃO — um segundo modelo
  // (gpt-4o-mini) que reescreve o texto já transcrito com labels de speaker,
  // e pode ecoar as próprias instruções do prompt de diarização em vez de
  // segui-las (checklist §3.2). Sem essa checagem, o eco vira o transcript
  // "oficial" da call. Cai no bruto (já validado por isDegenerateTranscript)
  // em vez de gravar o eco.
  if (looksLikePromptLeak(labeled)) {
    console.warn("[whisper] diarização ecoou o prompt, usando transcript bruto", {
      callId: options.callId,
    });
    return rawTranscript;
  }

  return labeled;
}

const PROMPT_LEAK_MARKERS = [
  "<<<TRANSCRIPT_BEGIN>>>",
  "<<<TRANSCRIPT_END>>>",
  "Output rules:",
  "This is a sales call between a salesperson and a prospect",
];

function looksLikePromptLeak(text: string): boolean {
  return PROMPT_LEAK_MARKERS.some((marker) => text.includes(marker));
}
