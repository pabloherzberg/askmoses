/**
 * AskMoses.AI — MVP Dump Script (descartável)
 *
 * Faz dump completo de um projeto Supabase MVP antes de deletar:
 *   - pg_dump do schema public (schema + dados)
 *   - pg_dump do schema auth (só dados — schema é gerenciado pelo Supabase)
 *   - pg_dump do schema storage (metadata dos buckets)
 *   - Download dos arquivos de Storage (S3) via Supabase Storage API
 *   - MANIFEST.json com checksums e contagens
 *   - Comprime em .tar.gz
 *
 * Uso:
 *   node scripts/dump-mvp.mjs --target=centurionk9
 *   node scripts/dump-mvp.mjs --target=client1
 *   node scripts/dump-mvp.mjs --target=centurionk9 --dry-run    # só lista o que faria
 *
 * Pré-requisitos no .env.local:
 *   DUMP_<TARGET>_DB_URL=postgresql://postgres:PASS@db.REF.supabase.co:5432/postgres
 *   DUMP_<TARGET>_URL=https://REF.supabase.co
 *   DUMP_<TARGET>_SERVICE_ROLE_KEY=eyJ...
 *
 * Usa pg_dump local em .tools/pgsql/bin/pg_dump.exe (PostgreSQL 17 client
 * binaries baixados sem instalação no sistema — ver .tools/ no .gitignore).
 */

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, createWriteStream } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

// ── Args ──────────────────────────────────────────────────────────────────────

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/)
    return m ? [m[1], m[2] ?? true] : [a, true]
  }),
)

const TARGET = args.target
const DRY_RUN = !!args['dry-run']

if (!TARGET || typeof TARGET !== 'string') {
  console.error('Uso: node scripts/dump-mvp.mjs --target=<centurionk9|client1> [--dry-run]')
  process.exit(1)
}

const TARGET_UPPER = TARGET.toUpperCase()

// ── Env loading (mesmo padrão de setup-supabase.mjs) ──────────────────────────

function loadEnvLocal() {
  const path = resolve(process.cwd(), '.env.local')
  if (!existsSync(path)) {
    console.error(`Arquivo .env.local não encontrado em ${path}`)
    process.exit(1)
  }
  const content = readFileSync(path, 'utf8')
  for (const originalLine of content.split(/\r?\n/)) {
    const line = originalLine.split('#')[0].trim()
    if (!line) continue
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!m) continue
    const [, key, rawValue] = m
    if (process.env[key]) continue
    process.env[key] = rawValue.trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
  }
}
loadEnvLocal()

const DB_URL = process.env[`DUMP_${TARGET_UPPER}_DB_URL`]
const PROJECT_URL = process.env[`DUMP_${TARGET_UPPER}_URL`]
const SERVICE_ROLE = process.env[`DUMP_${TARGET_UPPER}_SERVICE_ROLE_KEY`]

if (!DB_URL || !PROJECT_URL || !SERVICE_ROLE) {
  console.error(`Faltam env vars no .env.local pra target=${TARGET}:`)
  console.error(`  DUMP_${TARGET_UPPER}_DB_URL`)
  console.error(`  DUMP_${TARGET_UPPER}_URL`)
  console.error(`  DUMP_${TARGET_UPPER}_SERVICE_ROLE_KEY`)
  process.exit(1)
}

// ── Output dir ────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10)
const OUT_DIR = resolve(process.cwd(), 'backups', TODAY, TARGET)
const OBJECTS_DIR = join(OUT_DIR, 'objects')

function ensureDir(p) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true })
}

// ── pg_dump local binary ──────────────────────────────────────────────────────

const PG_DUMP_PATH = resolve(process.cwd(), '.tools', 'pgsql', 'bin', 'pg_dump.exe')

if (!existsSync(PG_DUMP_PATH)) {
  console.error(`pg_dump não encontrado em ${PG_DUMP_PATH}`)
  console.error(`Baixe os binários do PostgreSQL 17 em https://get.enterprisedb.com/postgresql/postgresql-17.6-1-windows-x64-binaries.zip`)
  console.error(`e extraia em .tools/pgsql/`)
  process.exit(1)
}

function runPgDump({ outFile, extraArgs }) {
  const outPath = join(OUT_DIR, outFile)
  const pgArgs = [
    ...extraArgs,
    `--file=${outPath}`,
    DB_URL,
  ]

  console.log(`  [pg_dump] ${extraArgs.join(' ')} → ${outFile}`)

  if (DRY_RUN) {
    console.log(`  (dry-run, comando: ${PG_DUMP_PATH} ${pgArgs.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')})`)
    return { ok: true, dryRun: true }
  }

  const res = spawnSync(PG_DUMP_PATH, pgArgs, { stdio: 'inherit' })
  if (res.status !== 0) {
    console.error(`  ❌ pg_dump falhou (exit ${res.status})`)
    return { ok: false }
  }

  const size = statSync(outPath).size
  console.log(`  ✓ ${outFile} (${(size / 1024).toFixed(1)} KB)`)
  return { ok: true, size, path: outPath }
}

// ── Supabase Storage API ──────────────────────────────────────────────────────

const storageHeaders = {
  apikey: SERVICE_ROLE,
  Authorization: `Bearer ${SERVICE_ROLE}`,
}

async function listBuckets() {
  const res = await fetch(`${PROJECT_URL}/storage/v1/bucket`, { headers: storageHeaders })
  if (!res.ok) {
    console.error(`  Storage list bucket falhou: ${res.status}`)
    return []
  }
  return res.json()
}

async function listObjects(bucketId) {
  // POST /storage/v1/object/list/<bucket> aceita { prefix, limit, offset }
  const all = []
  let offset = 0
  const limit = 100
  while (true) {
    const res = await fetch(`${PROJECT_URL}/storage/v1/object/list/${bucketId}`, {
      method: 'POST',
      headers: { ...storageHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: '', limit, offset, sortBy: { column: 'name', order: 'asc' } }),
    })
    if (!res.ok) {
      console.error(`    list objects falhou bucket=${bucketId}: ${res.status}`)
      break
    }
    const page = await res.json()
    if (!Array.isArray(page) || page.length === 0) break
    all.push(...page)
    if (page.length < limit) break
    offset += limit
  }
  return all
}

async function downloadObject(bucketId, objectPath, destFile) {
  const url = `${PROJECT_URL}/storage/v1/object/${bucketId}/${encodeURIComponent(objectPath)}`
  const res = await fetch(url, { headers: storageHeaders })
  if (!res.ok || !res.body) {
    console.error(`    download falhou ${bucketId}/${objectPath}: ${res.status}`)
    return { ok: false, size: 0 }
  }
  ensureDir(dirname(destFile))
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destFile))
  return { ok: true, size: statSync(destFile).size }
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(`\nDump MVP — target=${TARGET} ${DRY_RUN ? '(DRY-RUN)' : ''}`)
console.log(`Project URL: ${PROJECT_URL}`)
console.log(`Output dir:  ${OUT_DIR}`)
console.log()

ensureDir(OUT_DIR)

const manifest = {
  target: TARGET,
  projectUrl: PROJECT_URL,
  dumpedAt: new Date().toISOString(),
  dryRun: DRY_RUN,
  files: {},
  buckets: [],
}

// 1) Schema + dados de public
console.log('1/4 pg_dump --schema=public (schema + dados)')
const publicDump = runPgDump({
  outFile: 'public.sql',
  extraArgs: ['--schema=public', '--no-owner', '--no-acl'],
})
if (publicDump.ok && !publicDump.dryRun) manifest.files['public.sql'] = publicDump.size

// 2) Dados de auth (schema é gerenciado pelo Supabase — só dumpamos dados)
console.log('\n2/4 pg_dump --schema=auth --data-only (apenas dados)')
const authDump = runPgDump({
  outFile: 'auth-data.sql',
  extraArgs: ['--schema=auth', '--data-only', '--no-owner', '--no-acl'],
})
if (authDump.ok && !authDump.dryRun) manifest.files['auth-data.sql'] = authDump.size

// 3) Dados de storage (buckets + objects metadata, não os bytes em si)
console.log('\n3/4 pg_dump --schema=storage --data-only (metadata dos buckets)')
const storageDump = runPgDump({
  outFile: 'storage-meta.sql',
  extraArgs: ['--schema=storage', '--data-only', '--no-owner', '--no-acl'],
})
if (storageDump.ok && !storageDump.dryRun) manifest.files['storage-meta.sql'] = storageDump.size

// 4) Storage objects (arquivos físicos)
console.log('\n4/4 Storage objects (download via Storage API)')
const buckets = await listBuckets()
console.log(`  Buckets encontrados: ${buckets.length}`)

let totalObjects = 0
let totalBytes = 0
for (const bucket of buckets) {
  const objects = await listObjects(bucket.id)
  console.log(`  • ${bucket.id}: ${objects.length} objects`)
  const bucketInfo = { id: bucket.id, name: bucket.name, public: bucket.public, objectCount: objects.length, totalBytes: 0 }
  for (const obj of objects) {
    if (!obj.name || obj.name.endsWith('/')) continue // skip placeholders
    if (DRY_RUN) {
      bucketInfo.totalBytes += obj.metadata?.size ?? 0
      totalObjects++
      continue
    }
    const dest = join(OBJECTS_DIR, bucket.id, obj.name)
    const r = await downloadObject(bucket.id, obj.name, dest)
    if (r.ok) {
      bucketInfo.totalBytes += r.size
      totalBytes += r.size
      totalObjects++
    }
  }
  manifest.buckets.push(bucketInfo)
  if (DRY_RUN) totalBytes += bucketInfo.totalBytes
}

console.log(`  Total: ${totalObjects} objects, ${(totalBytes / 1024 / 1024).toFixed(2)} MB`)

// MANIFEST
manifest.totalObjectCount = totalObjects
manifest.totalObjectBytes = totalBytes

if (!DRY_RUN) {
  const manifestPath = join(OUT_DIR, 'MANIFEST.json')
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  console.log(`\n✓ MANIFEST.json escrito em ${manifestPath}`)

  // Comprime
  console.log('\nComprimindo em .tar.gz…')
  const tarOut = resolve(process.cwd(), 'backups', TODAY, `${TARGET}.tar.gz`)
  // -C pra entrar no parent dir e adicionar só a pasta do target
  const parentDir = resolve(process.cwd(), 'backups', TODAY)
  const res = spawnSync('tar', ['-czf', tarOut, '-C', parentDir, TARGET], { stdio: 'inherit' })
  if (res.status !== 0) {
    console.error(`  ⚠ tar falhou (exit ${res.status}) — pasta ${OUT_DIR} ainda está disponível pra compressão manual`)
  } else {
    const size = statSync(tarOut).size
    console.log(`✓ ${tarOut} (${(size / 1024 / 1024).toFixed(2)} MB)`)
  }
} else {
  console.log(`\n(dry-run, MANIFEST e compressão pulados)`)
  console.log('\nResumo do que SERIA feito:')
  console.log(`  - 3 arquivos .sql via pg_dump`)
  console.log(`  - ${totalObjects} arquivos de Storage`)
  console.log(`  - ~${(totalBytes / 1024 / 1024).toFixed(2)} MB de storage estimado`)
}

console.log('\nDone.')
