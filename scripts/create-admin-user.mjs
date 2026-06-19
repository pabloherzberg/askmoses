import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://azphsweveznidfttykbq.supabase.co'
// Service role key from .env
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmcnFtbWd3cHdraGd2eWl0aHV3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTgyMDYzMCwiZXhwIjoyMDk1Mzk2NjMwfQ.m3LshbqfYA6ghhJToXZfIb0bwpyODJ-tiZcdoc7geN0'

const EMAIL = 'lucas@askmoses.ai'
const PASSWORD = 'demo123'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data, error } = await supabase.auth.admin.createUser({
  email: EMAIL,
  password: PASSWORD,
  email_confirm: true,
  app_metadata: { role: 'admin' },
})

if (error) {
  console.error('Erro ao criar usuário:', error.message)
  process.exit(1)
}

console.log('Usuário admin criado com sucesso!')
console.log('ID:', data.user.id)
console.log('Email:', data.user.email)
console.log('Role:', data.user.app_metadata?.role)
