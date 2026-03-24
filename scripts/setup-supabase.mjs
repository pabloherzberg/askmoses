/**
 * AskMoses.AI — Supabase Setup Script
 * Cria os 3 usuários demo via Auth Admin API
 * Executa via: node scripts/setup-supabase.mjs
 *
 * PRÉ-REQUISITO: rodar o SQL abaixo no Supabase SQL Editor ANTES deste script
 * (ver seção SQL_REQUIRED ao final do arquivo)
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ahusozxvfdbapnyztmva.supabase.co'
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFodXNvenh2ZmRiYXBueXp0bXZhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjk2OTcxNCwiZXhwIjoyMDg4NTQ1NzE0fQ.iD2xV7N-1h2a92DoLzYONgRyqXKojIQDunvSH-s65Lk'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const DEMO_USERS = [
  {
    email: 'trainer@demo.askmoses.ai',
    password: 'demo123',
    role: 'trainer',
    name: 'Marcus Rivera',
    avatar: 'MR',
  },
  {
    email: 'owner@demo.askmoses.ai',
    password: 'demo123',
    role: 'owner',
    name: 'Demo Owner',
    avatar: 'DO',
  },
  {
    email: 'admin@askmoses.ai',
    password: 'demo123',
    role: 'admin',
    name: 'Admin',
    avatar: 'AD',
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

  if (error) throw error
  console.log(`  ✓ Profile upsertado (role=${user.role})`)
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
