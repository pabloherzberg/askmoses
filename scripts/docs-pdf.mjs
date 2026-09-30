// Gera os PDFs dos manuais a partir do Markdown em docs/manualAndUserGuide/.
//
//   npm run docs:pdf                     → os dois manuais
//   npm run docs:pdf -- user-guide       → só um (user-guide | system-manual)
//
// Saída: docs/manualAndUserGuide/askmoses-<nome>-v<versão>.pdf, com a versão
// lida da linha "Version X.Y" do próprio .md. PDFs de versões anteriores não
// são tocados.
//
// Precisa do Google Chrome (ou Chromium). Caminho em CHROME_PATH, ou um dos
// caminhos padrão abaixo.

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Marked } from 'marked'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DOCS = join(ROOT, 'docs/manualAndUserGuide')
const TEMPLATE = readFileSync(join(DOCS, 'pdf/template.html'), 'utf8')
const CSS = readFileSync(join(DOCS, 'pdf/style.css'), 'utf8')

const MANUALS = ['user-guide', 'system-manual']

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean)

function findChrome() {
  const found = CHROME_CANDIDATES.find((p) => existsSync(p))
  if (!found) {
    console.error('Chrome não encontrado. Defina CHROME_PATH com o caminho do executável.')
    process.exit(1)
  }
  return found
}

// Slug no estilo do GitHub, ignorando os badges em `code` (ex.: `OWNER`) —
// é o que faz os links do sumário ("#8-call-history") baterem com o título
// "8. Call History `OWNER`".
function slugify(text) {
  return text
    .replace(/`[^`]*`/g, '')
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-')
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function render(markdown) {
  const ids = new Set()
  const marked = new Marked({ gfm: true })
  marked.use({
    renderer: {
      heading({ tokens, depth, text }) {
        const id = slugify(text)
        ids.add(id)
        return `<h${depth} id="${id}">${this.parser.parseInline(tokens)}</h${depth}>\n`
      },
      // HTML cru no Markdown sai como texto. Um "<script name>" solto no .md
      // abria uma tag <script> e engolia o resto do documento.
      html({ text }) {
        return escapeHtml(text)
      },
      blockquote({ tokens }) {
        const body = this.parser.parse(tokens)
        const important = /^<p><strong>IMPORTANT<\/strong>/.test(body.trim())
        return `<blockquote${important ? ' class="callout-important"' : ''}>\n${body}</blockquote>\n`
      },
    },
  })
  const html = marked.parse(markdown)

  // Todo link interno do sumário precisa apontar para um título existente.
  const broken = [...html.matchAll(/href="#([^"]+)"/g)]
    .map((m) => m[1])
    .filter((a) => !ids.has(a))
  return { html, broken }
}

// PDF completo termina com o marcador %%EOF (seguido de, no máximo, quebras de linha).
function isCompletePdf(path) {
  const tail = readFileSync(path).subarray(-32).toString('latin1')
  return /%%EOF\s*$/.test(tail)
}

// No macOS o Chrome headless grava o PDF e às vezes não encerra. Em vez de
// esperar o processo, espera o arquivo aparecer e o tamanho parar de mudar,
// e então encerra o Chrome.
async function printToPdf(chrome, htmlUrl, outPath, profileDir) {
  rmSync(outPath, { force: true })
  const proc = spawn(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--no-pdf-header-footer',
    `--user-data-dir=${profileDir}`,
    `--print-to-pdf=${outPath}`,
    htmlUrl,
  ], { stdio: 'ignore' })

  let exited = false
  proc.on('exit', () => { exited = true })

  const deadline = Date.now() + 120_000
  let lastSize = -1
  try {
    while (Date.now() < deadline) {
      await sleep(500)
      const size = existsSync(outPath) ? statSync(outPath).size : 0
      if (size > 0 && size === lastSize && isCompletePdf(outPath)) return
      lastSize = size
      if (exited && size === 0) throw new Error('Chrome encerrou sem gerar o PDF')
    }
    throw new Error(`timeout de 120s gerando ${outPath}`)
  } finally {
    if (!exited) proc.kill()
  }
}

async function build(name, chrome) {
  const mdPath = join(DOCS, `askmoses-${name}.md`)
  const markdown = readFileSync(mdPath, 'utf8')

  const version = markdown.match(/^Version (\d+\.\d+)/m)?.[1]
  if (!version) throw new Error(`${mdPath}: linha "Version X.Y" não encontrada`)
  const title = markdown.match(/^# (.+)$/m)?.[1] ?? name

  const { html, broken } = render(markdown)
  if (broken.length > 0) {
    throw new Error(`${name}: links internos sem destino: ${broken.map((b) => '#' + b).join(', ')}`)
  }

  // Replacer em função: o HTML tem "$" (preços) e replace com string
  // interpretaria $&, $` e $' como padrões.
  const page = TEMPLATE
    .replace('{{title}}', () => title)
    .replace('{{css}}', () => CSS)
    .replace('{{content}}', () => html)

  const tmp = mkdtempSync(join(tmpdir(), 'askmoses-docs-'))
  try {
    const htmlPath = join(tmp, `${name}.html`)
    writeFileSync(htmlPath, page)
    const outPath = join(DOCS, `askmoses-${name}-v${version}.pdf`)
    await printToPdf(chrome, pathToFileURL(htmlPath).href, outPath, join(tmp, 'profile'))
    console.log(`✓ ${outPath.replace(ROOT + '/', '')}`)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

const requested = process.argv.slice(2)
const targets = requested.length > 0 ? requested : MANUALS
const unknown = targets.filter((t) => !MANUALS.includes(t))
if (unknown.length > 0) {
  console.error(`Manual desconhecido: ${unknown.join(', ')}. Use: ${MANUALS.join(' | ')}`)
  process.exit(1)
}

const chrome = findChrome()
for (const name of targets) await build(name, chrome)
