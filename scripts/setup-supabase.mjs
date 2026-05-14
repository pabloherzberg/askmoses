/**
 * AskMoses.AI — Supabase Setup Script
 * Cria os 3 usuários demo via Auth Admin API
 * Executa via: node scripts/setup-supabase.mjs
 *
 * PRÉ-REQUISITO: rodar o SQL abaixo no Supabase SQL Editor ANTES deste script
 * (ver seção SQL_REQUIRED ao final do arquivo)
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Carrega .env.local manualmente para usar o mesmo projeto Supabase do app
function stripInlineComment(line) {
  let inSingle = false
  let inDouble = false
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i]
    if (c === "'" && !inDouble) { inSingle = !inSingle; continue }
    if (c === '"' && !inSingle) { inDouble = !inDouble; continue }
    if (c === '#' && !inSingle && !inDouble) return line.slice(0, i)
  }
  return line
}

function loadEnvLocal() {
  const path = resolve(process.cwd(), '.env.local')
  if (!existsSync(path)) return
  const content = readFileSync(path, 'utf8')
  for (const originalLine of content.split(/\r?\n/)) {
    const line = stripInlineComment(originalLine).trim()
    if (!line) continue
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!m) continue
    const [, key, rawValue] = m
    if (process.env[key]) continue
    const value = rawValue.trim()
      .replace(/^"(.*)"$/, '$1')
      .replace(/^'(.*)'$/, '$1')
    process.env[key] = value
  }
}
loadEnvLocal()

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY

if (!SUPABASE_URL) {
  console.error('✗ Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) in .env.local')
  process.exit(1)
}
if (!SERVICE_ROLE_KEY) {
  console.error('✗ Missing SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

console.log(`Supabase target: ${SUPABASE_URL}\n`)

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const ORG_DOG_WIZARD_HQ = '00000000-0000-0000-0000-000000000100'
const TRAINER_DB_ID     = '00000000-0000-0000-0000-000000000301' // trainers.id do Marcus

const DEMO_USERS = [
  {
    email: 'trainer@demo.askmoses.ai',
    password: 'demo123',
    role: 'trainer',
    name: 'Marcus Rivera',
    avatar: 'MR',
    avatarColor: 'blue',
    orgId: ORG_DOG_WIZARD_HQ,
  },
  {
    email: 'owner@demo.askmoses.ai',
    password: 'demo123',
    role: 'owner',
    name: 'Demo Owner',
    avatar: 'DO',
    avatarColor: 'amber',
    orgId: ORG_DOG_WIZARD_HQ,
  },
  {
    email: 'admin@askmoses.ai',
    password: 'demo123',
    role: 'admin',
    name: 'Admin',
    avatar: 'AD',
    avatarColor: 'blue',
    orgId: null, // admin não pertence a nenhuma org
  },
]

async function createUser(user) {
  console.log(`\n→ Criando ${user.email} (${user.role})...`)

  // Tenta criar; se já existe, busca o existente
  const { data, error } = await supabase.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    app_metadata: { role: user.role },
  })

  if (error) {
    if (error.message?.includes('already been registered') || error.message?.includes('already exists')) {
      console.log(`  ⚠ Usuário já existe — buscando ID...`)

      const { data: list, error: listErr } = await supabase.auth.admin.listUsers()
      if (listErr) throw listErr

      const existing = list.users.find((u) => u.email === user.email)
      if (!existing) throw new Error(`Usuário ${user.email} não encontrado após conflito`)

      return existing.id
    }
    throw error
  }

  console.log(`  ✓ Auth user criado: ${data.user.id}`)
  return data.user.id
}

async function upsertProfile(userId, user) {
  const { error } = await supabase.from('profiles').upsert(
    {
      id: userId,
      role: user.role,
      name: user.name,
      avatar: user.avatar,
      owner_id: null,
    },
    { onConflict: 'id' }
  )

  if (!error) {
    console.log(`  ✓ Profile upsertado (role=${user.role})`)
    return
  }
  // Schema sem profiles (dev novo) — JWT já vem de auth.users.app_metadata
  if (
    error.message?.includes("Could not find the table 'public.profiles'") ||
    error.code === '42P01'
  ) {
    console.log(`  · profiles table ausente — pulando (role já está em app_metadata)`)
    return
  }
  throw error
}

async function upsertPublicUser(userId, user) {
  if (!user.orgId && user.role === 'admin') {
    // Admin não tem org — apenas garantir row em public.users
    const { error } = await supabase
      .from('users')
      .upsert(
        { id: userId, name: user.name, email: user.email, avatar: user.avatar, avatar_color: user.avatarColor ?? 'blue', role: user.role, invite_status: 'accepted' },
        { onConflict: 'id' }
      )
    if (error && !error.message?.includes("Could not find the table")) {
      console.warn(`  ⚠ public.users upsert (admin): ${error.message}`)
    }
    return
  }

  const { error } = await supabase
    .from('users')
    .upsert(
      { id: userId, name: user.name, email: user.email, avatar: user.avatar, avatar_color: user.avatarColor ?? 'blue', role: user.role, invite_status: 'accepted', active_org_id: user.orgId },
      { onConflict: 'id' }
    )
  if (error) {
    if (error.message?.includes("Could not find the table 'public.users'") || error.code === '42P01') {
      console.log(`  · public.users table ausente — pulando`)
      return
    }
    throw error
  }
  console.log(`  ✓ public.users upsertado (active_org_id=${user.orgId})`)
}

async function upsertMembership(userId, user) {
  if (!user.orgId) return

  const { error } = await supabase
    .from('memberships')
    .upsert(
      { user_id: userId, org_id: user.orgId, role: user.role, invite_status: 'accepted', invited_at: new Date().toISOString() },
      { onConflict: 'user_id,org_id' }
    )
  if (error) {
    if (error.message?.includes("Could not find the table 'public.memberships'") || error.code === '42P01') {
      console.log(`  · memberships table ausente — pulando`)
      return
    }
    throw error
  }
  console.log(`  ✓ membership upsertada (org=${user.orgId}, role=${user.role})`)
}

async function linkTrainerToAuth(userId) {
  // Atualiza a row de trainers do Marcus (ID fixo 301) para usar o Auth user_id real
  const { error } = await supabase
    .from('trainers')
    .update({ user_id: userId })
    .eq('id', TRAINER_DB_ID)
    .is('user_id', null) // só atualiza se ainda não foi vinculado

  // Se já foi vinculado ou tabela não existe, ignora
  if (error && !error.message?.includes('0 rows')) {
    console.warn(`  ⚠ linkTrainerToAuth: ${error.message}`)
  } else {
    console.log(`  ✓ trainers.user_id → Auth user (ou já estava vinculado)`)
  }
}

async function main() {
  console.log('=== AskMoses.AI — Supabase Setup ===\n')
  console.log('ATENÇÃO: certifique-se de ter rodado o SQL de criação da tabela')
  console.log('profiles e trigger ANTES de continuar. Ver seção SQL_REQUIRED.\n')

  const results = []

  for (const user of DEMO_USERS) {
    try {
      const userId = await createUser(user)
      await upsertProfile(userId, user)
      await upsertPublicUser(userId, user)
      await upsertMembership(userId, user)
      if (user.role === 'trainer' && user.orgId) {
        await linkTrainerToAuth(userId)
      }
      results.push({ email: user.email, role: user.role, id: userId, ok: true })
    } catch (err) {
      console.error(`  ✗ ERRO para ${user.email}:`, err.message)
      results.push({ email: user.email, role: user.role, ok: false, error: err.message })
    }
  }

  console.log('\n=== Resultado Final ===')
  for (const r of results) {
    const icon = r.ok ? '✓' : '✗'
    const detail = r.ok ? r.id : r.error
    console.log(`${icon} ${r.email} (${r.role}) — ${detail}`)
  }

  const failed = results.filter((r) => !r.ok)
  if (failed.length === 0) {
    console.log('\n✅ Setup completo! Logins disponíveis:')
    console.log('   trainer@demo.askmoses.ai / demo123  → /me')
    console.log('   owner@demo.askmoses.ai  / demo123  → /dashboard')
    console.log('   admin@askmoses.ai       / demo123  → /admin')
  } else {
    console.log(`\n⚠ ${failed.length} erro(s). Verifique acima.`)
    process.exit(1)
  }
}

main()

/*
═══════════════════════════════════════════════════════════════
SQL_REQUIRED — rodar no Supabase SQL Editor ANTES deste script
Supabase Dashboard → SQL Editor → New query → colar e executar
═══════════════════════════════════════════════════════════════

-- 1. Tabela de perfis vinculada ao auth.users
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('trainer', 'owner', 'admin')),
  owner_id   UUID,
  name       TEXT,
  avatar     TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. RLS: habilitar
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Policies
-- Usuário lê o próprio perfil
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Service role pode tudo (para o setup script)
CREATE POLICY "profiles_service_role_all"
  ON public.profiles
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 4. Trigger: popula app_metadata.role no JWT após INSERT/UPDATE em profiles
CREATE OR REPLACE FUNCTION public.set_role_claim()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data =
    COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', NEW.role)
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_profile_upserted ON public.profiles;
CREATE TRIGGER on_profile_upserted
  AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.set_role_claim();

*/
