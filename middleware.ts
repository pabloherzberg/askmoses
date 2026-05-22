import { NextResponse, type NextRequest } from 'next/server'
import createIntlMiddleware from 'next-intl/middleware'
import { createServerClient } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { routing, type Locale } from '@/i18n/routing'
import type { Role } from '@/lib/types'

const intlMiddleware = createIntlMiddleware(routing)

function stripLocale(pathname: string): { locale: Locale; rawPath: string } {
  const segments = pathname.split('/')
  const maybeLocale = segments[1] as Locale
  if ((routing.locales as readonly string[]).includes(maybeLocale)) {
    const rest = '/' + segments.slice(2).join('/')
    return { locale: maybeLocale, rawPath: rest === '/' ? '/' : rest.replace(/\/$/, '') }
  }
  return { locale: routing.defaultLocale, rawPath: pathname }
}

function localized(path: string, locale: Locale, baseUrl: string) {
  const suffix = path === '/' ? '' : path
  return new URL(`/${locale}${suffix}`, baseUrl)
}

function redirectByRole(role: Role, locale: Locale, baseUrl: string) {
  const routes: Record<Role, string> = { trainer: '/me', owner: '/dashboard', admin: '/admin' }
  return localized(routes[role] ?? '/login', locale, baseUrl)
}

// Rotas que NÃO precisam de login (qualquer visitante pode acessar).
// /signup é público porque é onde o user cria a conta antes de existir
// sessão. Logged-in users são redirecionados via lógica no bloco isPublic.
const PUBLIC_PATHS = ['/login', '/signup', '/presentation', '/demobiz', '/tech']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Let next-intl resolve the locale (adds prefix when missing, detects from Accept-Language)
  const intlResponse = intlMiddleware(request)

  // If intl issued a redirect (e.g. `/` → `/pt`), honor it and stop here
  if (
    intlResponse.status >= 300 &&
    intlResponse.status < 400 &&
    intlResponse.headers.get('location')
  ) {
    return intlResponse
  }

  const { locale, rawPath } = stripLocale(pathname)

  if (rawPath.startsWith('/me/calls/new')) {
    return new NextResponse(null, { status: 404 })
  }

  const isPublic = rawPath === '/' || PUBLIC_PATHS.some((p) => rawPath.startsWith(p))
  const isOnboarding = rawPath === '/onboarding' || rawPath.startsWith('/onboarding/')

  // Start from the intl response so locale headers/cookies are preserved
  let supabaseResponse = NextResponse.next({ request })
  intlResponse.headers.forEach((value, key) => supabaseResponse.headers.set(key, value))

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          intlResponse.headers.forEach((value, key) => supabaseResponse.headers.set(key, value))
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const role = user?.app_metadata?.role as Role | undefined
  // Admin impersonando uma org: app_metadata.impersonating_org_id setado por
  // POST /api/admin/impersonate. Só Admin pode impersonar — claim em outras
  // roles é ignorado defensivamente.
  const impersonatingOrgId = role === 'admin' && typeof user?.app_metadata?.impersonating_org_id === 'string'
    ? user.app_metadata.impersonating_org_id as string
    : null

  // /onboarding é multi-step e semi-público — requer login mas permite
  // estados intermediários do fluxo de cadastro:
  //   step-1 (/onboarding):       user SEM role (acabou de confirmar email)
  //   step-2 (/onboarding/plan):  owner com role definida, sub 'inactive'
  //                                (criou org no step-1, falta pagar plano)
  //
  // Pelo modelo de roles (Admin nunca tem org; Trainer sempre via invite),
  // a única transição válida que passa por /onboarding é signup → step-1
  // → step-2 → /dashboard. Admin/Trainer aqui = bug → safe-fail pra home.
  // Self-service 2ª org (Task B futura) será uma rota separada.
  if (isOnboarding) {
    if (!user) return NextResponse.redirect(localized('/login', locale, request.url))

    const isStep2 = rawPath.startsWith('/onboarding/plan')

    if (isStep2) {
      // /onboarding/plan: owner-only. Sem role = ainda no step-1.
      if (!role) return NextResponse.redirect(localized('/onboarding', locale, request.url))
      if (role !== 'owner') return NextResponse.redirect(redirectByRole(role, locale, request.url))
      // Owner com sub já ativa não precisa do step-2 — a página redireciona
      // server-side; deixamos passar aqui pra não duplicar a checagem.
      return supabaseResponse
    }

    // step-1 (/onboarding exato ou outras subrotas não conhecidas):
    // só user sem role; role-bearing volta pra home.
    if (role) return NextResponse.redirect(redirectByRole(role, locale, request.url))
    return supabaseResponse
  }

  if (isPublic) {
    // Logged-in com role tentando /login ou /signup → manda pra home dele
    if (user && role && (rawPath.startsWith('/login') || rawPath.startsWith('/signup'))) {
      return NextResponse.redirect(redirectByRole(role, locale, request.url))
    }
    // Logged-in sem role tentando /signup → manda pro onboarding (já se cadastrou)
    if (user && !role && rawPath.startsWith('/signup')) {
      return NextResponse.redirect(localized('/onboarding', locale, request.url))
    }
    return supabaseResponse
  }

  if (!user) return NextResponse.redirect(localized('/login', locale, request.url))
  // User logado sem role = limbo pós-signup. Manda pro onboarding em vez do
  // login (que ficaria em loop porque ele já tem sessão).
  if (!role) return NextResponse.redirect(localized('/onboarding', locale, request.url))

  if (rawPath.startsWith('/admin') && role !== 'admin') {
    return NextResponse.redirect(redirectByRole(role, locale, request.url))
  }

  // ── Admin impersonando: whitelist de paths read-only ─────────────────────
  // Admin vê só /dashboard e /team-command-center (e drilldowns de call) quando
  // está numa org cliente. Telas operacionais (upload, settings, marketing
  // intelligence, etc.) redirecionam pra /admin pra não dar impressão de que
  // ele pode operar a org. /admin continua acessível pra Admin sair do modo.
  if (impersonatingOrgId) {
    const IMPERSONATE_ALLOWED = ['/dashboard', '/team-command-center', '/calls', '/marketing-intelligence']
    const isAllowed =
      rawPath === '/' ||
      rawPath.startsWith('/admin') ||
      IMPERSONATE_ALLOWED.some((p) => rawPath === p || rawPath.startsWith(p + '/'))
    // Bloqueia drilldowns que são operacionais mesmo dentro das rotas
    // permitidas (upload, script-builder, settings).
    const isOperational =
      rawPath.startsWith('/dashboard/upload') ||
      rawPath.startsWith('/dashboard/script-builder') ||
      rawPath.startsWith('/dashboard/settings')
    if (!isAllowed || isOperational) {
      return NextResponse.redirect(localized('/admin', locale, request.url))
    }
  }

  // Redirect legacy routes
  if (rawPath === '/overview' || rawPath.startsWith('/overview/')) {
    return NextResponse.redirect(localized('/dashboard', locale, request.url))
  }
  if (rawPath === '/coaching' || rawPath.startsWith('/coaching/')) {
    return NextResponse.redirect(localized('/team-command-center', locale, request.url))
  }

  // Admin-only pages — owner and trainer are redirected out
  if (rawPath.startsWith('/dashboard/script-builder') && role !== 'admin') {
    return NextResponse.redirect(redirectByRole(role!, locale, request.url))
  }

  // Trainer: allow /me, /calls (filtered server-side), /dashboard/upload
  const trainerBlocked = ['/team-command-center', '/marketing-intelligence']
  const trainerDashboardBlocked =
    rawPath.startsWith('/dashboard') && !rawPath.startsWith('/dashboard/upload')
  if (
    role === 'trainer' &&
    (trainerBlocked.some((p) => rawPath.startsWith(p)) || trainerDashboardBlocked)
  ) {
    // ── Guard defensivo: JWT pode estar stale ────────────────────────────
    // Cenário conhecido (Branch 3A multi-org): user era trainer numa org,
    // foi convidado como owner pra outra org, aceitou o invite via
    // /api/auth/verify-invite-token. O endpoint atualiza app_metadata.role
    // pra 'owner' e gera magic link → /api/auth/verify-otp deveria criar
    // sessão fresca. Mas se os cookies novos não chegarem nessa request
    // (cookie propagation issue, ou outra aba ainda com sessão antiga), o
    // JWT aqui continua 'trainer' → redirect indevido pra /me com sidebar
    // de trainer (Bug reportado pelo Vitor, validação SP-03/SP-04).
    //
    // Antes de redirecionar, confere DB: se o user tem membership de owner
    // aceita pra sua active_org_id, é o caso do bug. Sync app_metadata e
    // força refresh da sessão; deixa request seguir como owner. Custo extra
    // (2 queries + refresh) só nesse caminho específico (trainer tentando
    // /dashboard) — happy path do trainer real (acessando /me) é inalterado.
    const actuallyOwner = await isActuallyOwner(supabase, user.id)
    if (actuallyOwner) {
      console.warn(
        '[middleware] JWT role=trainer mas DB diz owner — sincronizando',
        { userId: user.id, path: rawPath },
      )
      try {
        const admin = createSupabaseClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { autoRefreshToken: false, persistSession: false } },
        )
        const currentMeta = (user.app_metadata ?? {}) as Record<string, unknown>
        await admin.auth.admin.updateUserById(user.id, {
          app_metadata: { ...currentMeta, role: 'owner' },
        })
        // refreshSession lê o app_metadata atualizado e devolve um JWT novo.
        // Cookies escrevem na response via setAll já configurado acima.
        await supabase.auth.refreshSession()
        return supabaseResponse
      } catch (err) {
        console.error('[middleware] sync app_metadata falhou — caindo no redirect padrão', err)
        // Cai pro redirect abaixo — pelo menos o user não fica em loop.
      }
    }
    return NextResponse.redirect(localized('/me', locale, request.url))
  }

  return supabaseResponse
}

// Checa se o user tem membership de owner aceita pra sua active_org_id.
// Roda só quando há suspeita de JWT stale — não no happy path. RLS deixa
// o user ler suas próprias rows em users + memberships (select_self/select_own).
async function isActuallyOwner(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
): Promise<boolean> {
  const { data: userRow } = await supabase
    .from('users')
    .select('active_org_id')
    .eq('id', userId)
    .maybeSingle()
  const activeOrgId = (userRow as { active_org_id: string | null } | null)?.active_org_id
  if (!activeOrgId) return false
  const { data: membership } = await supabase
    .from('memberships')
    .select('role')
    .eq('user_id', userId)
    .eq('org_id', activeOrgId)
    .eq('invite_status', 'accepted')
    .maybeSingle()
  return (membership as { role: string } | null)?.role === 'owner'
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|images|api|mockServiceWorker.js|.*\\..*).*)',
  ],
}
