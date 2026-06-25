import { dbGetOrgGhlConfigByOrgId } from '@/lib/db/organizations'
import { dbGetLinkedGhlUserIds } from '@/lib/db/trainers'
import { fetchGhlUsers, GhlAuthError, type GhlUser } from '@/lib/services/ghl-api'

// Validação compartilhada do vínculo "membro ↔ usuário do GHL". Antes vivia
// copiada em POST /api/invites e PATCH /api/memberships/[userId]; centralizar
// evita que as regras divirjam (uma rota aceitando o que a outra rejeita).

export type GhlLinkErrorKind =
  | 'not_configured'
  | 'already_linked'
  | 'invalid_user'
  | 'ghl_auth'
  | 'ghl_unavailable'

// Erro de domínio: a request é válida mas o vínculo não passa numa regra
// (org sem GHL, id duplicado/inexistente, GHL indisponível). O caller traduz
// via ghlLinkErrorResponse. Erros de infra (DB) escapam como Error genérico e
// viram 500 no caller.
export class GhlLinkValidationError extends Error {
  readonly kind: GhlLinkErrorKind
  constructor(kind: GhlLinkErrorKind) {
    super(`GHL link validation failed: ${kind}`)
    this.name = 'GhlLinkValidationError'
    this.kind = kind
  }
}

/**
 * Valida que `ghlUserId` pode ser vinculado a um membro da org e devolve o
 * usuário do GHL correspondente (fonte da verdade para nome/email). Lança
 * GhlLinkValidationError quando alguma regra falha.
 *
 * `excludeUserId` deixa o próprio membro de fora da checagem de unicidade
 * (edição — ele mantém o vínculo atual).
 */
export async function resolveGhlUserForOrg(
  orgId: string,
  ghlUserId: string,
  excludeUserId?: string,
): Promise<GhlUser> {
  const config = await dbGetOrgGhlConfigByOrgId(orgId)
  if (!config) throw new GhlLinkValidationError('not_configured')

  // dbGetLinkedGhlUserIds (DB) e fetchGhlUsers (round-trip externo ao GHL) são
  // independentes — roda em paralelo pra não somar as latências.
  const [linked, ghlUsers] = await Promise.all([
    dbGetLinkedGhlUserIds(orgId, excludeUserId),
    fetchGhlUsers(config.locationId, config.accessToken).catch((err) => {
      throw err instanceof GhlAuthError
        ? new GhlLinkValidationError('ghl_auth')
        : new GhlLinkValidationError('ghl_unavailable')
    }),
  ])

  if (linked.includes(ghlUserId)) throw new GhlLinkValidationError('already_linked')

  const match = ghlUsers.find((u) => u.id === ghlUserId)
  if (!match) throw new GhlLinkValidationError('invalid_user')

  return match
}

const GHL_LINK_ERROR_MAP: Record<GhlLinkErrorKind, { code: number; message: string }> = {
  not_configured: {
    code: 400,
    message:
      'Integração GHL não configurada para esta organização. Configure o GHL antes de adicionar vendedores.',
  },
  already_linked: {
    code: 409,
    message: 'Este usuário do GHL já está vinculado a um membro desta organização',
  },
  invalid_user: { code: 400, message: 'Usuário do GHL inválido para esta organização' },
  ghl_auth: {
    code: 502,
    message: 'Não foi possível autenticar no GHL — verifique o token da integração',
  },
  ghl_unavailable: { code: 502, message: 'Não foi possível carregar os usuários do GHL' },
}

/** Traduz um GhlLinkValidationError para a resposta HTTP padrão da API. */
export function ghlLinkErrorResponse(err: GhlLinkValidationError): Response {
  const { code, message } = GHL_LINK_ERROR_MAP[err.kind]
  return Response.json({ data: null, error: { message, code } }, { status: code })
}
