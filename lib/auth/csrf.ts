// Same-origin check pra endpoints state-changing. Defesa contra CSRF
// quando a sessão Supabase é mantida via cookies (default).
//
// Estratégia: comparar Origin/Referer com Host. Browser nunca permite
// JS de outro site setar Origin pro nosso host, então qualquer request
// cross-site falha. Form submission cross-site (sem fetch) não tem
// Origin mas tem Referer — checamos os dois.
//
// Limitações:
//   - Mobile/native apps: precisam mandar X-Requested-With ou Origin
//     explicitamente pra não falhar. App nosso é web, então OK.
//   - Server-to-server: não passa por aqui (não usa cookies, usa Bearer).
//   - Privacy modes: Firefox/Brave/Tor podem stripar Referer. Origin
//     deve estar presente em fetch POST/PATCH/PUT/DELETE — confiamos nele.
//
// Quando aplicar: TODO endpoint que modifica state via cookie auth
// (POST/PATCH/PUT/DELETE). GETs ficam de fora (read-only não é alvo CSRF).

const STATE_CHANGING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

export function isSameOrigin(request: Request): boolean {
  // GET/HEAD/OPTIONS são seguros por design — não precisam de check.
  if (!STATE_CHANGING_METHODS.has(request.method.toUpperCase())) return true

  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')
  const host = request.headers.get('host')

  if (!host) {
    // Header host SEMPRE presente em HTTP/1.1+. Sem ele algo está muito
    // errado — recusar é mais seguro.
    return false
  }

  // Preferência: Origin (set por browser em fetch state-changing).
  if (origin) {
    try {
      const originHost = new URL(origin).host
      return originHost === host
    } catch {
      return false
    }
  }

  // Fallback: Referer (set por browser em form submit, mais frágil mas
  // funcional). Browsers que não enviam nenhum dos dois numa request
  // state-changing são raros — recusar é seguro.
  if (referer) {
    try {
      const refererHost = new URL(referer).host
      return refererHost === host
    } catch {
      return false
    }
  }

  return false
}

export function csrfDenied(): Response {
  return Response.json(
    {
      data: null,
      error: {
        message: 'Origem da requisição não autorizada.',
        code: 403,
        reason: 'CSRF_CHECK_FAILED',
      },
    },
    { status: 403 },
  )
}

// Convenience wrapper: chama no topo de qualquer endpoint state-changing.
// Retorna null quando ok, Response 403 quando bloqueado.
export function requireSameOrigin(request: Request): Response | null {
  return isSameOrigin(request) ? null : csrfDenied()
}
